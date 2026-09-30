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
    assert "source_bytes" not in row
    blob = json.dumps(page)
    assert "%PDF" not in blob
    assert store.get_case_file(kept)["bytes"] == b"%PDF-kept"
    detail = store.get_run(row["run_id"])
    assert "coupon" in detail["reasoning_text"]
