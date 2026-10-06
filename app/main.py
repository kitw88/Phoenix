import asyncio
import re
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.extract import extract_text

from app import cursor_review, mail, postman_sync, runner, store

WEB = Path(__file__).resolve().parents[1] / "web"
EMAIL_RE = re.compile(r"^[a-z0-9._+-]+@easyview\.com\.hk$")
PUBLIC_API = {"/api/auth/otp", "/api/auth/verify", "/api/auth/me", "/api/auth/logout"}

app = FastAPI(title="Prompt Desk")
app.mount("/assets", StaticFiles(directory=WEB), name="assets")


def normalize_email(value: str) -> str:
    email = (value or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise ValueError("domain")
    return email


def _secure_cookie(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return proto == "https"


@app.middleware("http")
async def attach_user(request: Request, call_next):
    user = store.user_from_token(request.cookies.get("phoenix_session"))
    token = store.actor.set(user)
    try:
        path = request.url.path
        if path.startswith("/api/") and path not in PUBLIC_API and not user:
            return JSONResponse({"detail": "未登錄"}, status_code=401)
        return await call_next(request)
    finally:
        store.actor.reset(token)


@app.middleware("http")
async def revalidate_pages(request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/assets/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.on_event("startup")
def startup() -> None:
    store.init_db()


@app.get("/")
def index() -> Response:
    html = (WEB / "index.html").read_text(encoding="utf-8")
    css = int((WEB / "styles.css").stat().st_mtime)
    script = int((WEB / "app.js").stat().st_mtime)
    html = html.replace('href="/assets/styles.css?v=3"', f'href="/assets/styles.css?v={css}"')
    html = html.replace('src="/assets/app.js?v=3"', f'src="/assets/app.js?v={script}"')
    return Response(html, media_type="text/html", headers={"Cache-Control": "no-cache"})


@app.get("/api/state")
def state() -> dict:
    return store.snapshot()


@app.get("/api/health")
async def health(target_id: int | None = None) -> dict:
    return await runner.check_target(target_id)


class EmailBody(BaseModel):
    email: str = ""
    locale: str = ""


class VerifyBody(BaseModel):
    email: str = ""
    code: str = ""


@app.post("/api/auth/otp")
def request_otp(body: EmailBody, request: Request) -> dict:
    try:
        email = normalize_email(body.email)
    except ValueError:
        raise HTTPException(status_code=400, detail="只能使用 @easyview.com.hk 郵箱")
    try:
        code = store.issue_otp(email)
    except RuntimeError:
        raise HTTPException(status_code=429, detail="請稍後再要驗證碼")
    locale = body.locale or request.headers.get("accept-language", "")
    try:
        mail.send_otp(email, code, locale)
    except Exception:
        raise HTTPException(status_code=502, detail="驗證碼沒有發出")
    return {"ok": True}


@app.post("/api/auth/verify")
def verify_otp(body: VerifyBody, request: Request) -> JSONResponse:
    try:
        email = normalize_email(body.email)
    except ValueError:
        raise HTTPException(status_code=400, detail="只能使用 @easyview.com.hk 郵箱")
    user = store.consume_otp(email, body.code)
    if not user:
        raise HTTPException(status_code=400, detail="驗證碼不對或已過期")
    token = store.create_session(user["id"])
    response = JSONResponse(user)
    response.set_cookie(
        "phoenix_session",
        token,
        httponly=True,
        samesite="lax",
        secure=_secure_cookie(request),
        max_age=60 * 60 * 24 * 14,
        path="/",
    )
    return response


@app.get("/api/auth/me")
def me(request: Request) -> dict:
    user = store.user_from_token(request.cookies.get("phoenix_session"))
    if not user:
        raise HTTPException(status_code=401, detail="未登錄")
    return user


@app.post("/api/auth/logout")
def logout(request: Request) -> JSONResponse:
    store.drop_session(request.cookies.get("phoenix_session"))
    response = JSONResponse({"ok": True})
    response.delete_cookie("phoenix_session", path="/")
    return response


class DraftBody(BaseModel):
    draft: str


@app.put("/api/prompts/{prompt_id}/draft")
def save_draft(prompt_id: int, body: DraftBody) -> dict:
    store.update_draft(prompt_id, body.draft)
    store.add_activity("prompt_draft")
    return store.snapshot()


class KeyBody(BaseModel):
    api_key: str = ""


@app.post("/api/postman/sync")
def sync_postman() -> dict:
    try:
        found = postman_sync.discover()
    except postman_sync.PostmanUnavailable as exc:
        return {"message": str(exc), "synced": False, "state": store.snapshot()}
    count = store.apply_postman_targets(found)
    return {
        "message": f"從 Postman 識別到 {count} 個 API Target。key 存在評測系統裡。" if count else "沒有已留下 key 的 API Target。",
        "synced": True,
        "state": store.snapshot(),
    }


@app.put("/api/targets/{target_id}/key")
def save_target_key(target_id: int, body: KeyBody) -> dict:
    try:
        store.save_target_key(target_id, body.api_key)
    except KeyError:
        raise HTTPException(status_code=404, detail="API Target not found")
    return store.snapshot()


class TargetEditBody(BaseModel):
    name: str = ""
    base_url: str = ""
    api_key: str = ""


class TargetCreateBody(BaseModel):
    name: str = ""
    base_url: str = ""
    api_key: str = ""
    model: str = ""


@app.post("/api/targets")
def add_target(body: TargetCreateBody) -> dict:
    try:
        target_id = store.create_target(body.name, body.base_url, body.api_key, body.model)
    except ValueError as exc:
        missing = {"base_url": "URL", "api_key": "key", "model": "model"}[str(exc)]
        raise HTTPException(status_code=400, detail=f"需要填 {missing}")
    return {"id": target_id, "state": store.snapshot()}


@app.put("/api/targets/{target_id}")
def edit_target(target_id: int, body: TargetEditBody) -> dict:
    try:
        store.update_target(target_id, body.model_dump())
    except KeyError:
        raise HTTPException(status_code=404, detail="API Target not found")
    return store.snapshot()


@app.delete("/api/targets/{target_id}")
def remove_target(target_id: int) -> dict:
    try:
        store.delete_target(target_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="API Target not found")
    return store.snapshot()


class DefaultTargetBody(BaseModel):
    prompt_id: int
    target_id: int


@app.put("/api/default-target")
def default_target(body: DefaultTargetBody) -> dict:
    store.set_default_target(body.prompt_id, body.target_id)
    return store.snapshot()


class CaseBody(BaseModel):
    case_id: int | None = None
    title: str | None = None
    input_text: str | None = None
    expectation: str | None = None


@app.post("/api/workflows/{workflow_id}/cases")
def save_case(workflow_id: int, body: CaseBody) -> dict:
    try:
        store.save_case(workflow_id, body.case_id, body.title, body.input_text, body.expectation)
    except KeyError:
        raise HTTPException(status_code=404, detail="Case not found")
    store.add_activity("case", (body.title or "").strip())
    return store.snapshot()


@app.get("/api/workflows/{workflow_id}/cases")
def list_cases(
    workflow_id: int,
    suite: str = "test",
    result: str = "all",
    page: int = 1,
    page_size: int = 50,
    version_id: int | None = None,
    expectation: list[str] = Query(default=[]),
) -> dict:
    if suite not in {"test", "pending"}:
        raise HTTPException(status_code=400, detail="suite must be test or pending")
    if result not in {"all", "fail", "pass", "unscored"}:
        raise HTTPException(status_code=400, detail="result filter is invalid")
    return store.case_page(
        workflow_id,
        suite=suite,
        result=result,
        page=page,
        page_size=page_size,
        version_id=version_id,
        expectations=expectation,
    )


@app.get("/api/cases/{case_id}")
def read_case(case_id: int) -> dict:
    case = store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return {
        "id": case["id"],
        "title": case["title"],
        "input_text": case["input_text"],
        "expectation": case["expectation"] or "",
        "source_name": case.get("source_name") or "",
        "has_source": case.get("source_bytes") is not None,
    }


@app.get("/api/cases/{case_id}/file")
def read_case_file(case_id: int) -> Response:
    stored = store.get_case_file(case_id)
    if not stored:
        raise HTTPException(status_code=404, detail="這個 Case 沒有原檔")
    return Response(
        content=stored["bytes"],
        media_type=stored["mime"],
        headers={"Content-Disposition": f'attachment; filename="{stored["name"]}"'},
    )


@app.get("/api/runs/{run_id}")
def read_run(run_id: int) -> dict:
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@app.delete("/api/cases/{case_id}")
def delete_case(case_id: int) -> dict:
    case = store.get_case(case_id)
    store.delete_case(case_id)
    store.add_activity("delete", ((case or {}).get("title") or "").strip())
    return store.snapshot()


class PinBody(BaseModel):
    version_id: int | None = None
    target_id: int | None = None


@app.put("/api/prompts/{prompt_id}/pin")
def pin(prompt_id: int, body: PinBody) -> dict:
    try:
        store.pin_step(prompt_id, body.version_id, body.target_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return store.snapshot()


class PublishBody(BaseModel):
    remark: str = ""


class RemarkBody(BaseModel):
    remark: str = ""


class RunBody(BaseModel):
    source: str
    version_id: int | None = None
    target_id: int | None = None
    scope: str
    case_ids: list[int] = []


@app.put("/api/versions/{version_id}/remark")
def save_version_remark(version_id: int, body: RemarkBody) -> dict:
    try:
        store.update_version_remark(version_id, body.remark)
    except KeyError:
        raise HTTPException(status_code=404, detail="Prompt Version not found")
    store.add_activity("prompt_remark")
    return store.snapshot()


@app.post("/api/prompts/{prompt_id}/publish")
async def publish(prompt_id: int, body: PublishBody | None = None) -> dict:
    prompt = store.get_prompt(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    try:
        version = store.publish_version(prompt_id, body.remark if body else "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    store.add_activity("prompt_publish", str(version["number"]))
    target_id = prompt["default_target_id"]
    runs = []
    for case in store.labeled_cases(prompt_id):
        runs.append(
            await runner.execute(
                prompt_id=prompt_id,
                body=version["body"],
                target_id=target_id,
                input_text=case["input_text"],
                case_id=case["id"],
                version_id=version["id"],
                expectation=case["expectation"],
                kind="regression",
            )
        )
    await _attach_review(prompt_id, runs)
    return {"version": version, "runs": runs, "state": store.snapshot()}


def _run_brief(run: dict) -> dict:
    return {
        "id": run["id"],
        "case_id": run["case_id"],
        "passed": run["passed"],
        "error": run.get("error") or "",
    }


@app.post("/api/prompts/{prompt_id}/run")
async def run_labeled(prompt_id: int, body: RunBody) -> dict:
    prompt = store.get_prompt(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    if body.scope not in {"all", "fail", "unscored", "selected"}:
        raise HTTPException(status_code=400, detail="scope must be all, fail, unscored, or selected")
    version_id = None
    if body.source == "version":
        version = store.get_version(body.version_id or 0)
        if not version or version["prompt_id"] != prompt_id:
            raise HTTPException(status_code=404, detail="Prompt Version not found")
        text = version["body"]
        version_id = version["id"]
    elif body.source == "draft":
        text = prompt["draft"]
    else:
        raise HTTPException(status_code=400, detail="source must be draft or version")
    target_id = body.target_id or prompt["default_target_id"]
    if not target_id:
        raise HTTPException(status_code=400, detail="先選 API Target")
    try:
        if body.scope == "selected":
            cases = store.cases_by_ids(prompt_id, body.case_ids)
        else:
            cases = store.cases_for_scope(prompt_id, version_id, body.scope)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not cases:
        return {"runs": [], "message": "沒有要跑的 Case", "state": store.snapshot()}
    store.add_activity("run", body.scope)
    runs = []
    for case in cases:
        run = await runner.execute(
            prompt_id=prompt_id,
            body=text,
            target_id=target_id,
            input_text=case["input_text"],
            case_id=case["id"],
            version_id=version_id,
            expectation=case["expectation"],
            kind="regression",
        )
        runs.append(run)
    await _attach_review(prompt_id, runs)
    briefs = [_run_brief(run) for run in runs]
    failed = sum(1 for run in briefs if run["passed"] is False)
    label = {"all": "全部", "fail": "未通過", "unscored": "未回歸", "selected": "已選"}[body.scope]
    return {
        "runs": briefs,
        "message": f"Run {label} 完成，{len(runs)} 筆，未通過 {failed} 筆",
        "state": store.snapshot(),
    }


class ReviewBody(BaseModel):
    run_ids: list[int]


def _product(run: dict) -> str:
    parsed = run.get("parsed")
    if isinstance(parsed, dict) and parsed.get("product") is not None:
        return str(parsed["product"])
    return ""


def _mismatches(runs: list[dict]) -> list[dict]:
    found = []
    for run in runs:
        if run.get("passed") is not False:
            continue
        expectation = (run.get("expectation") or "").strip()
        if not expectation:
            continue
        product = _product(run)
        output = (run.get("output_text") or "").strip()
        if not product and not output:
            continue
        if product == expectation:
            continue
        case = store.get_case(run.get("case_id") or 0) or {}
        found.append(
            {
                "title": case.get("title") or f"Case {run.get('case_id')}",
                "expectation": expectation,
                "product": product,
                "output": output,
                "reasoning": run.get("reasoning_text") or "",
                "input": run.get("input_text") or "",
                "prompt": run.get("body") or "",
            }
        )
    return found


@app.post("/api/prompts/{prompt_id}/review")
async def review_mismatches(prompt_id: int, body: ReviewBody) -> dict:
    prompt = store.get_prompt(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    runs = store.get_runs_for_prompt(prompt_id, body.run_ids)
    cases = _mismatches(runs)
    if cases:
        prompt_text = cases[0]["prompt"] or prompt["draft"]
        text = await asyncio.to_thread(cursor_review.analyze, prompt_text, cases)
        store.set_mismatch_review(prompt_id, text)
    return {"state": store.snapshot()}


async def _attach_review(prompt_id: int, runs: list[dict]) -> None:
    cases = _mismatches(runs)
    if not cases:
        return
    prompt_text = cases[0]["prompt"] or ""
    text = await asyncio.to_thread(cursor_review.analyze, prompt_text, cases)
    store.set_mismatch_review(prompt_id, text)


class TryBody(BaseModel):
    source: str
    version_id: int | None = None
    target_id: int
    case_id: int


@app.post("/api/prompts/{prompt_id}/try")
async def try_run(prompt_id: int, body: TryBody) -> dict:
    prompt = store.get_prompt(prompt_id)
    case = store.get_case(body.case_id)
    if not prompt or not case:
        raise HTTPException(status_code=404, detail="Prompt or case not found")
    version_id = None
    if body.source == "version":
        version = store.get_version(body.version_id or 0)
        if not version or version["prompt_id"] != prompt_id:
            raise HTTPException(status_code=404, detail="Prompt Version not found")
        text = version["body"]
        version_id = version["id"]
    else:
        text = prompt["draft"]
    run = await runner.execute(
        prompt_id=prompt_id,
        body=text,
        target_id=body.target_id,
        input_text=case["input_text"],
        case_id=case["id"],
        version_id=version_id,
        expectation=case["expectation"] or None,
        kind="try",
    )
    await _attach_review(prompt_id, [run])
    return {"run": run, "state": store.snapshot()}


@app.post("/api/workflows/{workflow_id}/drop")
async def drop_case(
    workflow_id: int,
    file: UploadFile = File(...),
    expectation: str = Form(""),
) -> dict:
    raw = await file.read()
    try:
        text = extract_text(file.filename or "", raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    title = (file.filename or "Dropped case").rsplit(".", 1)[0].strip() or "Dropped case"
    state = store.snapshot()
    prompt = next(
        (
            item
            for item in state["prompts"]
            if item["workflow"] and item["workflow"]["id"] == workflow_id
        ),
        None,
    )
    if not prompt:
        raise HTTPException(status_code=404, detail="Workflow not found")
    chosen = expectation.strip()
    if chosen and chosen not in prompt["expectation_options"]:
        raise HTTPException(status_code=400, detail="期望標籤不在清單裡")
    existing_id = store.find_case_id_by_title(workflow_id, title)
    existing = store.get_case(existing_id) if existing_id else None
    kept = ((existing or {}).get("expectation") or "").strip()
    applied = chosen or kept
    case_id = store.save_case(
        workflow_id,
        existing_id,
        title,
        text,
        chosen if chosen else (None if existing else ""),
        source_name=file.filename or "",
        source_mime=file.content_type or "application/octet-stream",
        source_bytes=raw,
    )
    store.add_activity("upload", file.filename or title)
    run = await runner.execute(
        prompt_id=prompt["id"],
        body=prompt["draft"],
        target_id=prompt["default_target_id"],
        input_text=text,
        case_id=case_id,
        version_id=None,
        expectation=applied or None,
        kind="regression" if applied else "try",
    )
    await _attach_review(prompt["id"], [run])
    return {
        "run": run,
        "case_id": case_id,
        "replaced": existing is not None,
        "expectation": applied,
        "state": store.snapshot(),
    }
