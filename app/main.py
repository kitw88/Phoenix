from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.extract import extract_text

from app import postman_sync, runner, store

WEB = Path(__file__).resolve().parents[1] / "web"

app = FastAPI(title="Phoenix prompt desk")
app.mount("/assets", StaticFiles(directory=WEB), name="assets")


@app.on_event("startup")
def startup() -> None:
    store.init_db()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB / "index.html")


@app.get("/api/state")
def state() -> dict:
    return store.snapshot()


class DraftBody(BaseModel):
    draft: str


@app.put("/api/prompts/{prompt_id}/draft")
def save_draft(prompt_id: int, body: DraftBody) -> dict:
    store.update_draft(prompt_id, body.draft)
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
        "message": f"從 Postman 識別到 {count} 個 API Target。secret 讀不到，key 存在評測系統裡。",
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
    return store.snapshot()


@app.get("/api/workflows/{workflow_id}/cases")
def list_cases(
    workflow_id: int,
    suite: str = "test",
    result: str = "all",
    page: int = 1,
    page_size: int = 50,
    version_id: int | None = None,
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
    store.delete_case(case_id)
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


@app.post("/api/prompts/{prompt_id}/publish")
async def publish(prompt_id: int) -> dict:
    prompt = store.get_prompt(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    try:
        version = store.publish_version(prompt_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    target_id = prompt["default_target_id"]
    runs = []
    for case in store.labeled_cases(prompt_id):
        runs.append(
            await runner.execute_via_postman(
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
    return {"version": version, "runs": runs, "state": store.snapshot()}


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
    run = await runner.execute_via_postman(
        prompt_id=prompt_id,
        body=text,
        target_id=body.target_id,
        input_text=case["input_text"],
        case_id=case["id"],
        version_id=version_id,
        expectation=case["expectation"] or None,
        kind="try",
    )
    return {"run": run, "state": store.snapshot()}


@app.post("/api/workflows/{workflow_id}/drop")
async def drop_case(workflow_id: int, file: UploadFile = File(...)) -> dict:
    raw = await file.read()
    try:
        text = extract_text(file.filename or "", raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    title = (file.filename or "Dropped case").rsplit(".", 1)[0]
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
    case_id = store.save_case(
        workflow_id,
        None,
        title,
        text,
        "",
        source_name=file.filename or "",
        source_mime=file.content_type or "application/octet-stream",
        source_bytes=raw,
    )
    run = await runner.execute_via_postman(
        prompt_id=prompt["id"],
        body=prompt["draft"],
        target_id=prompt["default_target_id"],
        input_text=text,
        case_id=case_id,
        version_id=None,
        expectation=None,
        kind="try",
    )
    return {"run": run, "case_id": case_id, "state": store.snapshot()}
