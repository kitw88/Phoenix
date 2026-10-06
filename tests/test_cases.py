import json

from app import store


def test_pdf_is_stored_and_failures_page_without_the_file(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "phoenix.sqlite")
    store.init_db()
    prompt = store.snapshot()["prompts"][0]
    workflow_id = prompt["workflow"]["id"]
    kept = store.save_case(
        workflow_id,
        None,
        "kept",
        "kept text",
        "FCN",
        source_name="kept.pdf",
        source_mime="application/pdf",
        source_bytes=b"%PDF-kept",
    )
    missed = store.save_case(
        workflow_id,
        None,
        "missed",
        "missed text",
        "AQ",
        source_name="missed.pdf",
        source_mime="application/pdf",
        source_bytes=b"%PDF-missed",
    )
    version = store.publish_version(prompt["id"])
    store.insert_run(
        {
            "prompt_id": prompt["id"],
            "prompt_version_id": version["id"],
            "body": version["body"],
            "case_id": kept,
            "input_text": "kept text",
            "expectation": "FCN",
            "kind": "regression",
            "output_text": '{"product":"FCN"}',
            "reasoning_text": "ok",
            "parsed": {"product": "FCN"},
            "passed": True,
        }
    )
    store.insert_run(
        {
            "prompt_id": prompt["id"],
            "prompt_version_id": version["id"],
            "body": version["body"],
            "case_id": missed,
            "input_text": "missed text",
            "expectation": "AQ",
            "kind": "regression",
            "output_text": '{"product":"DCN"}',
            "reasoning_text": "read the coupon as a note",
            "parsed": {"product": "DCN"},
            "passed": False,
        }
    )

    page = store.case_page(
        workflow_id,
        suite="test",
        result="fail",
        page=1,
        page_size=50,
        version_id=version["id"],
    )

    assert page["total"] == 1
    assert page["counts"]["fail"] == 1
    assert page["counts"]["pass"] == 1
    row = page["rows"][0]
    assert row["id"] == missed
    assert row["product"] == "DCN"
    assert row["has_source"] is True
    assert version["remark"] == ""
    store.update_version_remark(version["id"], "只改 AQ 的定義")
    saved = store.snapshot()["prompts"][0]["versions"][0]
    assert saved["remark"] == "只改 AQ 的定義"
    open_case = store.save_case(workflow_id, None, "open", "open text", "DCN")
    fail_ids = [case["id"] for case in store.cases_for_scope(prompt["id"], version["id"], "fail")]
    open_ids = [case["id"] for case in store.cases_for_scope(prompt["id"], version["id"], "unscored")]
    assert fail_ids == [missed]
    assert open_ids == [open_case]
    assert "source_bytes" not in row
    blob = json.dumps(page)
    assert "%PDF" not in blob
    assert store.get_case_file(kept)["bytes"] == b"%PDF-kept"
    detail = store.get_run(row["run_id"])
    assert "coupon" in detail["reasoning_text"]


def test_same_filename_updates_the_existing_case(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "phoenix.sqlite")
    store.init_db()
    prompt = store.snapshot()["prompts"][0]
    workflow_id = prompt["workflow"]["id"]
    first = store.save_case(
        workflow_id,
        None,
        "snowball",
        "old text",
        "Step-down SCN",
        source_name="snowball.pdf",
        source_mime="application/pdf",
        source_bytes=b"old",
    )
    found = store.find_case_id_by_title(workflow_id, "snowball")
    assert found == first
    store.save_case(
        workflow_id,
        found,
        "snowball",
        "new text",
        None,
        source_name="snowball.pdf",
        source_mime="application/pdf",
        source_bytes=b"new",
    )
    other = store.save_case(workflow_id, None, "other", "other text", "")
    case = store.get_case(first)
    assert case["input_text"] == "new text"
    assert case["expectation"] == "Step-down SCN"
    assert store.get_case_file(first)["bytes"] == b"new"
    assert store.get_case(other)["id"] == other
    page = store.case_page(workflow_id, suite="test", result="all", page=1, page_size=50, version_id=None)
    assert page["counts"]["labeled"] == 1
    store.save_case(
        workflow_id,
        found,
        "snowball",
        "newer text",
        "Phoenix",
        source_name="snowball.pdf",
        source_mime="application/pdf",
        source_bytes=b"newer",
    )
    assert store.get_case(first)["expectation"] == "Phoenix"


def test_create_target_keeps_url_key_and_model(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "phoenix.sqlite")
    store.init_db()
    target_id = store.create_target(
        "",
        "https://uat.example:8082",
        "secret-key",
        "deepseek-flash",
    )
    target = store.get_target(target_id)
    assert target["name"] == "uat.example:8082 · deepseek-flash"
    assert target["base_url"] == "https://uat.example:8082"
    assert target["model"] == "deepseek-flash"
    assert target["api_key"] == "secret-key"
    assert target["seen"] == 1
    try:
        store.create_target("x", "not-a-url", "key", "model")
    except ValueError as exc:
        assert str(exc) == "base_url"
    else:
        raise AssertionError("expected a url error")
