from app import store


def test_only_easyview_mail_can_sign_in(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "phoenix.sqlite")
    store.init_db()
    email = "kitty.huang@easyview.com.hk"
    code = store.issue_otp(email)
    user = store.consume_otp(email, code)
    assert user["name"] == "kitty.huang"
    assert store.consume_otp(email, code) is None


def test_prompt_publish_records_the_name_after_the_time(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "phoenix.sqlite")
    store.init_db()
    email = "kitty.huang@easyview.com.hk"
    code = store.issue_otp(email)
    user = store.consume_otp(email, code)
    token = store.actor.set(user)
    try:
        prompt = store.snapshot()["prompts"][0]
        store.update_draft(prompt["id"], "classify this")
        store.add_activity("prompt_draft")
        version = store.publish_version(prompt["id"], "note")
        store.add_activity("prompt_publish", str(version["number"]))
    finally:
        store.actor.reset(token)
    state = store.snapshot()
    assert version["author_name"] == "kitty.huang"
    assert state["prompts"][0]["versions"][0]["author_name"] == "kitty.huang"
    kinds = [item["kind"] for item in state["activity"]]
    assert "prompt_publish" in kinds
    assert "prompt_draft" in kinds
    assert all(item["actor"] == "kitty.huang" for item in state["activity"])


def test_otp_expires(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "phoenix.sqlite")
    store.init_db()
    email = "ada.wong@easyview.com.hk"
    code = store.issue_otp(email)
    with store.connect() as conn:
        conn.execute(
            "UPDATE otp_codes SET expires_at = ?",
            ("2000-01-01T00:00:00+00:00",),
        )
    assert store.consume_otp(email, code) is None
