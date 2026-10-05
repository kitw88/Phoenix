import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "phoenix.sqlite"
PROMPT_PATH = ROOT / "postman" / "ds-v4.1-product-classifier" / "classifier-prompt.txt"

from app.evaluate import PRODUCT_LABELS

SCHEMA = """
CREATE TABLE IF NOT EXISTS api_targets (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
    reasoning_effort TEXT NOT NULL DEFAULT 'low',
    is_default INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    expectation_field TEXT NOT NULL,
    expectation_options TEXT NOT NULL DEFAULT '[]',
    draft TEXT NOT NULL DEFAULT '',
    default_target_id INTEGER,
    FOREIGN KEY (default_target_id) REFERENCES api_targets(id)
);
CREATE TABLE IF NOT EXISTS prompt_versions (
    id INTEGER PRIMARY KEY,
    prompt_id INTEGER NOT NULL,
    number INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (prompt_id, number),
    FOREIGN KEY (prompt_id) REFERENCES prompts(id)
);
CREATE TABLE IF NOT EXISTS workflows (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workflow_steps (
    workflow_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    prompt_id INTEGER NOT NULL,
    pinned_version_id INTEGER,
    pinned_target_id INTEGER,
    PRIMARY KEY (workflow_id, position),
    FOREIGN KEY (workflow_id) REFERENCES workflows(id),
    FOREIGN KEY (prompt_id) REFERENCES prompts(id),
    FOREIGN KEY (pinned_version_id) REFERENCES prompt_versions(id),
    FOREIGN KEY (pinned_target_id) REFERENCES api_targets(id)
);
CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY,
    workflow_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    input_text TEXT NOT NULL DEFAULT '',
    expectation TEXT,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY,
    prompt_id INTEGER NOT NULL,
    prompt_version_id INTEGER,
    body TEXT NOT NULL,
    api_target_id INTEGER,
    case_id INTEGER,
    input_text TEXT NOT NULL,
    output_text TEXT NOT NULL DEFAULT '',
    reasoning_text TEXT NOT NULL DEFAULT '',
    parsed_json TEXT,
    expectation TEXT,
    passed INTEGER,
    error TEXT,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (prompt_id) REFERENCES prompts(id)
);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)
        existing = conn.execute("SELECT id FROM prompts LIMIT 1").fetchone()
        if existing:
            return
        _seed(conn)


def _migrate(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(api_targets)")}
    if "fingerprint" not in columns:
        conn.execute("ALTER TABLE api_targets ADD COLUMN fingerprint TEXT")
    if "seen" not in columns:
        conn.execute("ALTER TABLE api_targets ADD COLUMN seen INTEGER NOT NULL DEFAULT 1")
    conn.execute(
        """
        UPDATE api_targets
        SET fingerprint = base_url || char(10) || model
        WHERE fingerprint IS NULL OR fingerprint = ''
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS dismissed_targets (
            fingerprint TEXT PRIMARY KEY
        )
        """
    )
    case_columns = {row[1] for row in conn.execute("PRAGMA table_info(cases)")}
    if "source_name" not in case_columns:
        conn.execute("ALTER TABLE cases ADD COLUMN source_name TEXT NOT NULL DEFAULT ''")
    if "source_mime" not in case_columns:
        conn.execute("ALTER TABLE cases ADD COLUMN source_mime TEXT NOT NULL DEFAULT ''")
    if "source_bytes" not in case_columns:
        conn.execute("ALTER TABLE cases ADD COLUMN source_bytes BLOB")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_cases_workflow ON cases(workflow_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_case ON runs(case_id, kind, id)")
    version_columns = {row[1] for row in conn.execute("PRAGMA table_info(prompt_versions)")}
    if "remark" not in version_columns:
        conn.execute("ALTER TABLE prompt_versions ADD COLUMN remark TEXT NOT NULL DEFAULT ''")
    prompt_columns = {row[1] for row in conn.execute("PRAGMA table_info(prompts)")}
    if "mismatch_review" not in prompt_columns:
        conn.execute("ALTER TABLE prompts ADD COLUMN mismatch_review TEXT NOT NULL DEFAULT ''")


def _seed(conn: sqlite3.Connection) -> None:
    prompt_text = ""
    if PROMPT_PATH.exists():
        prompt_text = PROMPT_PATH.read_text(encoding="utf-8").replace("\r\n", "\n")
    conn.execute(
        """
        INSERT INTO prompts (name, expectation_field, expectation_options, draft, default_target_id)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            "Structured product classifier",
            "product",
            json.dumps(PRODUCT_LABELS),
            prompt_text,
            None,
        ),
    )
    prompt_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO workflows (name) VALUES (?)",
        ("Structured product classifier",),
    )
    workflow_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO workflow_steps
            (workflow_id, position, prompt_id, pinned_version_id, pinned_target_id)
        VALUES (?, 1, ?, NULL, ?)
        """,
        (workflow_id, prompt_id, None),
    )


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _target_public(row: sqlite3.Row) -> dict:
    key = row["api_key"] or ""
    return {
        "id": row["id"],
        "name": row["name"],
        "base_url": row["base_url"],
        "model": row["model"],
        "reasoning_effort": row["reasoning_effort"],
        "is_default": bool(row["is_default"]),
        "has_key": bool(key),
        "key_hint": key[-4:] if len(key) >= 4 else "",
    }


def snapshot() -> dict:
    with connect() as conn:
        _hide_keyless_targets(conn)
        targets = [
            _target_public(row)
            for row in conn.execute(
                """
                SELECT * FROM api_targets
                WHERE seen = 1
                ORDER BY id
                """
            )
        ]
        prompts = []
        for prompt in conn.execute("SELECT * FROM prompts ORDER BY id"):
            versions = [
                {
                    "id": row["id"],
                    "number": row["number"],
                    "body": row["body"],
                    "remark": row["remark"] or "",
                    "created_at": row["created_at"],
                }
                for row in conn.execute(
                    """
                    SELECT * FROM prompt_versions
                    WHERE prompt_id = ?
                    ORDER BY number DESC
                    """,
                    (prompt["id"],),
                )
            ]
            step = conn.execute(
                """
                SELECT s.*, w.name AS workflow_name, w.id AS workflow_id
                FROM workflow_steps s
                JOIN workflows w ON w.id = s.workflow_id
                WHERE s.prompt_id = ? AND s.position = 1
                """,
                (prompt["id"],),
            ).fetchone()
            runs = [
                _run_summary(row)
                for row in conn.execute(
                    """
                    SELECT * FROM runs
                    WHERE prompt_id = ?
                    ORDER BY id DESC
                    LIMIT 40
                    """,
                    (prompt["id"],),
                )
            ]
            prompts.append(
                {
                    "id": prompt["id"],
                    "name": prompt["name"],
                    "expectation_field": prompt["expectation_field"],
                    "expectation_options": json.loads(prompt["expectation_options"]),
                    "draft": prompt["draft"],
                    "mismatch_review": prompt["mismatch_review"] or "",
                    "default_target_id": prompt["default_target_id"],
                    "versions": versions,
                    "workflow": None
                    if not step
                    else {
                        "id": step["workflow_id"],
                        "name": step["workflow_name"],
                        "pinned_version_id": step["pinned_version_id"],
                        "pinned_target_id": step["pinned_target_id"],
                    },
                    "runs": runs,
                }
            )
    return {"targets": targets, "prompts": prompts}


def _parsed_product(raw: str | None) -> str:
    if not raw:
        return ""
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return ""
    if isinstance(parsed, dict) and parsed.get("product") is not None:
        return str(parsed["product"])
    return ""


def _run_summary(row: sqlite3.Row) -> dict:
    passed = row["passed"]
    return {
        "id": row["id"],
        "case_id": row["case_id"],
        "prompt_version_id": row["prompt_version_id"],
        "expectation": row["expectation"] or "",
        "product": _parsed_product(row["parsed_json"]),
        "passed": None if passed is None else bool(passed),
        "error": row["error"] or "",
        "kind": row["kind"],
        "created_at": row["created_at"],
    }


def _run_public(row: sqlite3.Row) -> dict:
    parsed = None
    if row["parsed_json"]:
        parsed = json.loads(row["parsed_json"])
    passed = row["passed"]
    return {
        "id": row["id"],
        "prompt_version_id": row["prompt_version_id"],
        "api_target_id": row["api_target_id"],
        "case_id": row["case_id"],
        "input_text": row["input_text"],
        "output_text": row["output_text"],
        "reasoning_text": row["reasoning_text"],
        "parsed": parsed,
        "expectation": row["expectation"] or "",
        "passed": None if passed is None else bool(passed),
        "error": row["error"] or "",
        "kind": row["kind"],
        "created_at": row["created_at"],
    }


def update_draft(prompt_id: int, draft: str) -> None:
    with connect() as conn:
        conn.execute("UPDATE prompts SET draft = ? WHERE id = ?", (draft, prompt_id))


def save_target_key(target_id: int, api_key: str) -> None:
    cleaned = api_key.strip()
    if not cleaned:
        return
    with connect() as conn:
        updated = conn.execute(
            "UPDATE api_targets SET api_key = ? WHERE id = ? AND seen = 1",
            (cleaned, target_id),
        )
        if updated.rowcount == 0:
            raise KeyError("target")


def _hide_keyless_targets(conn: sqlite3.Connection) -> None:
    conn.execute(
        "UPDATE api_targets SET is_default = 0 WHERE trim(api_key) = ''"
    )
    seen_default = conn.execute(
        """
        SELECT id FROM api_targets
        WHERE seen = 1 AND trim(api_key) != '' AND is_default = 1
        ORDER BY id LIMIT 1
        """
    ).fetchone()
    if not seen_default:
        first = conn.execute(
            """
            SELECT id FROM api_targets
            WHERE seen = 1 AND trim(api_key) != ''
            ORDER BY id LIMIT 1
            """
        ).fetchone()
        if first:
            conn.execute("UPDATE api_targets SET is_default = 0")
            conn.execute(
                "UPDATE api_targets SET is_default = 1 WHERE id = ?",
                (first["id"],),
            )
    conn.execute(
        """
        UPDATE prompts
        SET default_target_id = (
            SELECT id FROM api_targets
            WHERE seen = 1 AND trim(api_key) != '' AND is_default = 1
            ORDER BY id LIMIT 1
        )
        WHERE default_target_id IS NULL
           OR default_target_id NOT IN (
                SELECT id FROM api_targets WHERE seen = 1 AND trim(api_key) != ''
           )
        """
    )
    conn.execute(
        """
        UPDATE workflow_steps
        SET pinned_target_id = (
            SELECT id FROM api_targets
            WHERE seen = 1 AND trim(api_key) != '' AND is_default = 1
            ORDER BY id LIMIT 1
        )
        WHERE pinned_target_id IS NOT NULL
          AND pinned_target_id NOT IN (
                SELECT id FROM api_targets WHERE seen = 1 AND trim(api_key) != ''
          )
        """
    )
def apply_postman_targets(found: list[dict]) -> int:
    with connect() as conn:
        conn.execute("UPDATE api_targets SET seen = 0")
        dismissed = {
            row[0]
            for row in conn.execute("SELECT fingerprint FROM dismissed_targets")
        }
        for item in found:
            base_url = item["base_url"].rstrip("/")
            model = item["model"].strip()
            fingerprint = f"{base_url}\n{model}"
            if fingerprint in dismissed:
                continue
            host = base_url.split("//", 1)[-1].split("/")[0]
            name = f"{host} · {model}"
            current = conn.execute(
                "SELECT id, name, base_url, model FROM api_targets WHERE fingerprint = ?",
                (fingerprint,),
            ).fetchone()
            if current:
                old_host = current["base_url"].rstrip("/").split("//", 1)[-1].split("/")[0]
                old_auto = f"{old_host} · {current['model']}"
                kept_name = current["name"] if current["name"] != old_auto else name
                conn.execute(
                    """
                    UPDATE api_targets
                    SET name = ?, base_url = ?, model = ?, seen = 1
                    WHERE id = ?
                    """,
                    (kept_name, base_url, model, current["id"]),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO api_targets
                        (name, base_url, model, reasoning_effort, is_default, fingerprint, seen)
                    VALUES (?, ?, ?, 'low', 0, ?, 1)
                    """,
                    (name, base_url, model, fingerprint),
                )
        _hide_keyless_targets(conn)
        count = conn.execute(
            "SELECT COUNT(*) FROM api_targets WHERE seen = 1"
        ).fetchone()[0]
    return count


def update_target(target_id: int, fields: dict) -> None:
    with connect() as conn:
        current = conn.execute(
            "SELECT * FROM api_targets WHERE id = ?", (target_id,)
        ).fetchone()
        if not current:
            raise KeyError("target")
        api_key = current["api_key"]
        if fields.get("api_key") and str(fields["api_key"]).strip():
            api_key = str(fields["api_key"]).strip()
        name = str(fields.get("name") or current["name"]).strip() or current["name"]
        base_url = str(fields.get("base_url") or current["base_url"]).strip().rstrip("/")
        model = str(fields.get("model") or current["model"]).strip() or current["model"]
        conn.execute(
            """
            UPDATE api_targets
            SET name = ?, base_url = ?, model = ?, api_key = ?,
                reasoning_effort = ?, fingerprint = ?
            WHERE id = ?
            """,
            (
                name,
                base_url,
                model,
                api_key,
                fields.get("reasoning_effort", current["reasoning_effort"]),
                f"{base_url}\n{model}",
                target_id,
            ),
        )


def delete_target(target_id: int) -> None:
    with connect() as conn:
        current = conn.execute(
            "SELECT id, fingerprint, base_url, model FROM api_targets WHERE id = ?",
            (target_id,),
        ).fetchone()
        if not current:
            raise KeyError("target")
        fingerprint = current["fingerprint"] or f"{current['base_url'].rstrip('/')}\n{current['model']}"
        conn.execute(
            "INSERT OR IGNORE INTO dismissed_targets (fingerprint) VALUES (?)",
            (fingerprint,),
        )
        conn.execute(
            "UPDATE prompts SET default_target_id = NULL WHERE default_target_id = ?",
            (target_id,),
        )
        conn.execute(
            "UPDATE workflow_steps SET pinned_target_id = NULL WHERE pinned_target_id = ?",
            (target_id,),
        )
        conn.execute("DELETE FROM api_targets WHERE id = ?", (target_id,))
        _hide_keyless_targets(conn)


def set_default_target(prompt_id: int, target_id: int) -> None:
    with connect() as conn:
        conn.execute("UPDATE api_targets SET is_default = 0")
        conn.execute(
            "UPDATE api_targets SET is_default = 1 WHERE id = ?", (target_id,)
        )
        conn.execute(
            "UPDATE prompts SET default_target_id = ? WHERE id = ?",
            (target_id, prompt_id),
        )


def find_case_id_by_title(workflow_id: int, title: str) -> int | None:
    cleaned = title.strip()
    if not cleaned:
        return None
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id FROM cases
            WHERE workflow_id = ? AND title = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (workflow_id, cleaned),
        ).fetchone()
    return int(row["id"]) if row else None


def save_case(
    workflow_id: int,
    case_id: int | None,
    title: str | None,
    input_text: str | None,
    expectation: str | None,
    source_name: str = "",
    source_mime: str = "",
    source_bytes: bytes | None = None,
) -> int:
    with connect() as conn:
        if case_id:
            current = conn.execute(
                "SELECT * FROM cases WHERE id = ? AND workflow_id = ?",
                (case_id, workflow_id),
            ).fetchone()
            if not current:
                raise KeyError("case")
            next_title = current["title"] if title is None else (title.strip() or "Untitled case")
            next_input = current["input_text"] if input_text is None else input_text
            if expectation is None:
                next_expectation = current["expectation"]
            else:
                next_expectation = expectation.strip() or None
            if source_bytes is None:
                conn.execute(
                    """
                    UPDATE cases
                    SET title = ?, input_text = ?, expectation = ?
                    WHERE id = ? AND workflow_id = ?
                    """,
                    (next_title, next_input, next_expectation, case_id, workflow_id),
                )
            else:
                conn.execute(
                    """
                    UPDATE cases
                    SET title = ?, input_text = ?, expectation = ?,
                        source_name = ?, source_mime = ?, source_bytes = ?
                    WHERE id = ? AND workflow_id = ?
                    """,
                    (
                        next_title,
                        next_input,
                        next_expectation,
                        source_name,
                        source_mime,
                        source_bytes,
                        case_id,
                        workflow_id,
                    ),
                )
            return case_id
        expectation_value = (expectation or "").strip() or None
        conn.execute(
            """
            INSERT INTO cases (
                workflow_id, title, input_text, expectation,
                source_name, source_mime, source_bytes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                workflow_id,
                (title or "").strip() or "Untitled case",
                input_text or "",
                expectation_value,
                source_name,
                source_mime,
                source_bytes,
            ),
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def case_page(
    workflow_id: int,
    *,
    suite: str,
    result: str,
    page: int,
    page_size: int,
    version_id: int | None,
) -> dict:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    labeled = "c.expectation IS NOT NULL AND trim(c.expectation) != ''"
    suite_sql = labeled if suite == "test" else f"NOT ({labeled})"
    run_filter = ""
    version_filter = ""
    version_params: list = []
    if suite == "test" and version_id is not None:
        version_filter = "AND r2.prompt_version_id = ?"
        version_params.append(version_id)
    result_sql = {
        "fail": "AND passed = 0",
        "pass": "AND passed = 1",
        "unscored": "AND passed IS NULL",
    }.get(result, "")
    scored_sql = f"""
        SELECT c.id, c.title, c.expectation, c.source_name,
               CASE WHEN c.source_bytes IS NULL THEN 0 ELSE 1 END AS has_source,
               r.id AS run_id, r.passed, r.error, r.parsed_json,
               r.prompt_version_id, r.kind
        FROM cases c
        LEFT JOIN runs r ON r.id = (
            SELECT r2.id FROM runs r2
            WHERE r2.case_id = c.id {run_filter} {version_filter}
            ORDER BY r2.id DESC
            LIMIT 1
        )
        WHERE c.workflow_id = ? AND {suite_sql}
    """
    scored_params = [*version_params, workflow_id]
    with connect() as conn:
        totals = conn.execute(
            """
            SELECT
                SUM(CASE WHEN expectation IS NOT NULL AND trim(expectation) != '' THEN 1 ELSE 0 END) AS labeled,
                SUM(CASE WHEN expectation IS NULL OR trim(expectation) = '' THEN 1 ELSE 0 END) AS pending
            FROM cases
            WHERE workflow_id = ?
            """,
            (workflow_id,),
        ).fetchone()
        score_version = ""
        score_params: list = []
        if version_id is not None:
            score_version = "AND r.prompt_version_id = ?"
            score_params.append(version_id)
        score_params.append(workflow_id)
        scores = conn.execute(
            f"""
            SELECT
                SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) AS passed,
                SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) AS failed,
                SUM(CASE WHEN passed IS NULL THEN 1 ELSE 0 END) AS unscored
            FROM (
                SELECT (
                    SELECT r.passed FROM runs r
                    WHERE r.case_id = c.id {score_version}
                    ORDER BY r.id DESC LIMIT 1
                ) AS passed
                FROM cases c
                WHERE c.workflow_id = ?
                  AND c.expectation IS NOT NULL AND trim(c.expectation) != ''
            )
            """,
            score_params,
        ).fetchone()
        count = conn.execute(
            f"SELECT COUNT(*) AS total FROM ({scored_sql}) AS scored WHERE 1 = 1 {result_sql}",
            scored_params,
        ).fetchone()
        rows = conn.execute(
            f"""
            SELECT * FROM ({scored_sql}) AS scored
            WHERE 1 = 1 {result_sql}
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            [*scored_params, page_size, (page - 1) * page_size],
        ).fetchall()
    def num(value) -> int:
        return int(value or 0)

    return {
        "page": page,
        "page_size": page_size,
        "total": num(count["total"]),
        "counts": {
            "labeled": num(totals["labeled"]),
            "pending": num(totals["pending"]),
            "pass": num(scores["passed"]),
            "fail": num(scores["failed"]),
            "unscored": num(scores["unscored"]),
        },
        "rows": [
            {
                "id": row["id"],
                "title": row["title"],
                "expectation": row["expectation"] or "",
                "source_name": row["source_name"] or "",
                "has_source": bool(row["has_source"]),
                "run_id": row["run_id"],
                "passed": None if row["passed"] is None else bool(row["passed"]),
                "error": row["error"] or "",
                "product": _parsed_product(row["parsed_json"]),
                "prompt_version_id": row["prompt_version_id"],
                "kind": row["kind"] or "",
            }
            for row in rows
        ],
    }


def get_case_file(case_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT source_name, source_mime, source_bytes FROM cases WHERE id = ?",
            (case_id,),
        ).fetchone()
    if not row or row["source_bytes"] is None:
        return None
    return {
        "name": row["source_name"] or "case",
        "mime": row["source_mime"] or "application/octet-stream",
        "bytes": row["source_bytes"],
    }


def get_run(run_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    return _run_public(row) if row else None


def delete_case(case_id: int) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM cases WHERE id = ?", (case_id,))


def cases_for_scope(prompt_id: int, version_id: int | None, scope: str) -> list[dict]:
    if scope not in {"all", "fail", "unscored"}:
        raise ValueError("scope must be all, fail, or unscored")
    cases = labeled_cases(prompt_id)
    if scope == "all":
        return cases
    with connect() as conn:
        step = conn.execute(
            "SELECT workflow_id FROM workflow_steps WHERE prompt_id = ? AND position = 1",
            (prompt_id,),
        ).fetchone()
        if not step:
            return []
        version_sql = ""
        params: list = []
        if version_id is not None:
            version_sql = "AND r.prompt_version_id = ?"
            params.append(version_id)
        params.append(step["workflow_id"])
        rows = conn.execute(
            f"""
            SELECT c.id, (
                SELECT r.passed FROM runs r
                WHERE r.case_id = c.id {version_sql}
                ORDER BY r.id DESC
                LIMIT 1
            ) AS passed
            FROM cases c
            WHERE c.workflow_id = ?
              AND c.expectation IS NOT NULL AND trim(c.expectation) != ''
            """,
            params,
        ).fetchall()
    if scope == "fail":
        wanted = {row["id"] for row in rows if row["passed"] == 0}
    else:
        wanted = {row["id"] for row in rows if row["passed"] is None}
    return [case for case in cases if case["id"] in wanted]


def update_version_remark(version_id: int, remark: str) -> None:
    with connect() as conn:
        updated = conn.execute(
            "UPDATE prompt_versions SET remark = ? WHERE id = ?",
            (remark.strip(), version_id),
        )
        if updated.rowcount == 0:
            raise KeyError("version")


def publish_version(prompt_id: int, remark: str = "") -> dict:
    with connect() as conn:
        prompt = conn.execute("SELECT * FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
        if not prompt:
            raise KeyError("prompt")
        body = prompt["draft"]
        if not body.strip():
            raise ValueError("Draft is empty")
        number = conn.execute(
            "SELECT COALESCE(MAX(number), 0) + 1 FROM prompt_versions WHERE prompt_id = ?",
            (prompt_id,),
        ).fetchone()[0]
        created_at = _now()
        conn.execute(
            """
            INSERT INTO prompt_versions (prompt_id, number, body, remark, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (prompt_id, number, body, remark.strip(), created_at),
        )
        version_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        step = conn.execute(
            "SELECT * FROM workflow_steps WHERE prompt_id = ? AND position = 1",
            (prompt_id,),
        ).fetchone()
        if step and step["pinned_version_id"] is None:
            conn.execute(
                """
                UPDATE workflow_steps
                SET pinned_version_id = ?, pinned_target_id = COALESCE(pinned_target_id, ?)
                WHERE workflow_id = ? AND position = 1
                """,
                (version_id, prompt["default_target_id"], step["workflow_id"]),
            )
        return {
            "id": version_id,
            "number": number,
            "body": body,
            "remark": remark.strip(),
            "created_at": created_at,
            "prompt_id": prompt_id,
        }


def pin_step(prompt_id: int, version_id: int | None, target_id: int | None) -> None:
    with connect() as conn:
        step = conn.execute(
            "SELECT * FROM workflow_steps WHERE prompt_id = ? AND position = 1",
            (prompt_id,),
        ).fetchone()
        if not step:
            raise KeyError("workflow")
        conn.execute(
            """
            UPDATE workflow_steps
            SET pinned_version_id = ?, pinned_target_id = ?
            WHERE workflow_id = ? AND position = 1
            """,
            (
                version_id if version_id else step["pinned_version_id"],
                target_id if target_id else step["pinned_target_id"],
                step["workflow_id"],
            ),
        )


def labeled_cases(prompt_id: int) -> list[dict]:
    with connect() as conn:
        step = conn.execute(
            "SELECT workflow_id FROM workflow_steps WHERE prompt_id = ? AND position = 1",
            (prompt_id,),
        ).fetchone()
        if not step:
            return []
        rows = conn.execute(
            """
            SELECT id, workflow_id, title, input_text, expectation FROM cases
            WHERE workflow_id = ? AND expectation IS NOT NULL AND trim(expectation) != ''
            ORDER BY id
            """,
            (step["workflow_id"],),
        ).fetchall()
    return [dict(row) for row in rows]


def get_target(target_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM api_targets WHERE id = ?", (target_id,)).fetchone()
    return dict(row) if row else None


def get_prompt(prompt_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
    return dict(row) if row else None


def get_version(version_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM prompt_versions WHERE id = ?", (version_id,)
        ).fetchone()
    return dict(row) if row else None


def set_mismatch_review(prompt_id: int, text: str) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE prompts SET mismatch_review = ? WHERE id = ?",
            (text, prompt_id),
        )


def get_runs_for_prompt(prompt_id: int, run_ids: list[int]) -> list[dict]:
    if not run_ids:
        return []
    placeholders = ",".join("?" for _ in run_ids)
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT * FROM runs
            WHERE prompt_id = ? AND id IN ({placeholders})
            """,
            [prompt_id, *run_ids],
        ).fetchall()
    order = {run_id: index for index, run_id in enumerate(run_ids)}
    runs = [_run_public(row) for row in rows]
    runs.sort(key=lambda item: order.get(item["id"], 0))
    return runs


def get_case(case_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
    return dict(row) if row else None


def insert_run(fields: dict) -> dict:
    created_at = _now()
    passed = fields.get("passed")
    passed_value = None if passed is None else int(bool(passed))
    parsed = fields.get("parsed")
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO runs (
                prompt_id, prompt_version_id, body, api_target_id, case_id,
                input_text, output_text, reasoning_text, parsed_json, expectation,
                passed, error, kind, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fields["prompt_id"],
                fields.get("prompt_version_id"),
                fields["body"],
                fields.get("api_target_id"),
                fields.get("case_id"),
                fields.get("input_text") or "",
                fields.get("output_text") or "",
                fields.get("reasoning_text") or "",
                json.dumps(parsed, ensure_ascii=False) if parsed is not None else None,
                fields.get("expectation") or None,
                passed_value,
                fields.get("error") or None,
                fields["kind"],
                created_at,
            ),
        )
        run_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    return _run_public(row)
