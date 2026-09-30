import httpx

from app.evaluate import judge, parse_output
from app import postman_run, store
from app.postman_sync import PostmanUnavailable


async def execute(
    *,
    prompt_id: int,
    body: str,
    target_id: int,
    input_text: str,
    case_id: int | None,
    version_id: int | None,
    expectation: str | None,
    kind: str,
) -> dict:
    prompt = store.get_prompt(prompt_id)
    target = store.get_target(target_id)
    field = prompt["expectation_field"] if prompt else "product"
    base = {
        "prompt_id": prompt_id,
        "prompt_version_id": version_id,
        "body": body,
        "api_target_id": target_id,
        "case_id": case_id,
        "input_text": input_text,
        "expectation": expectation or "",
        "kind": kind,
    }
    if not target or not target["model"] or not target["api_key"]:
        return store.insert_run(
            {
                **base,
                "output_text": "",
                "reasoning_text": "",
                "parsed": None,
                "passed": False if expectation else None,
                "error": "This API Target needs a model id and an API key before it can run.",
            }
        )
    if not input_text.strip():
        return store.insert_run(
            {
                **base,
                "output_text": "",
                "reasoning_text": "",
                "parsed": None,
                "passed": False if expectation else None,
                "error": "This case has no input text.",
            }
        )

    url = target["base_url"].rstrip("/") + "/chat/completions"
    payload = {
        "model": target["model"],
        "messages": [
            {"role": "system", "content": body},
            {"role": "user", "content": input_text},
        ],
        "response_format": {"type": "json_object"},
        "stream": False,
    }
    if target["reasoning_effort"]:
        payload["reasoning_effort"] = target["reasoning_effort"]
    headers = {
        "Authorization": f"Bearer {target['api_key']}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(url, json=payload, headers=headers)
        data = response.json()
    except Exception as exc:
        return store.insert_run(
            {
                **base,
                "output_text": "",
                "reasoning_text": "",
                "parsed": None,
                "passed": False if expectation else None,
                "error": str(exc),
            }
        )
    if response.status_code >= 400:
        message = data.get("error", data) if isinstance(data, dict) else data
        return store.insert_run(
            {
                **base,
                "output_text": "",
                "reasoning_text": "",
                "parsed": None,
                "passed": False if expectation else None,
                "error": f"HTTP {response.status_code}: {message}",
            }
        )
    message = ((data.get("choices") or [{}])[0].get("message") or {})
    output_text = message.get("content") or ""
    reasoning_text = message.get("reasoning_content") or message.get("reasoning") or ""
    parsed = parse_output(output_text)
    passed = judge(parsed, field, expectation)
    error = ""
    if parsed is None:
        error = "The answer was not a JSON object."
        if expectation:
            passed = False
    return store.insert_run(
        {
            **base,
            "output_text": output_text,
            "reasoning_text": reasoning_text,
            "parsed": parsed,
            "passed": passed,
            "error": error,
        }
    )


async def execute_via_postman(
    *,
    prompt_id: int,
    body: str,
    target_id: int | None,
    input_text: str,
    case_id: int | None,
    version_id: int | None,
    expectation: str | None,
    kind: str,
) -> dict:
    prompt = store.get_prompt(prompt_id)
    field = prompt["expectation_field"] if prompt else "product"
    base = {
        "prompt_id": prompt_id,
        "prompt_version_id": version_id,
        "body": body,
        "api_target_id": target_id,
        "case_id": case_id,
        "input_text": input_text,
        "expectation": expectation or "",
        "kind": kind,
    }
    if not input_text.strip():
        return store.insert_run(
            {
                **base,
                "output_text": "",
                "reasoning_text": "",
                "parsed": None,
                "passed": False if expectation else None,
                "error": "這個 Case 沒有文字。",
            }
        )
    try:
        result = await postman_run.send_user_prompt(input_text)
    except PostmanUnavailable as exc:
        return store.insert_run(
            {
                **base,
                "output_text": "",
                "reasoning_text": "",
                "parsed": None,
                "passed": False if expectation else None,
                "error": str(exc),
            }
        )
    output_text = result["output_text"]
    reasoning_text = result["reasoning_text"]
    parsed = parse_output(output_text)
    passed = judge(parsed, field, expectation)
    error = ""
    if parsed is None:
        error = "回答不是 JSON。"
        if expectation:
            passed = False
    return store.insert_run(
        {
            **base,
            "output_text": output_text,
            "reasoning_text": reasoning_text,
            "parsed": parsed,
            "passed": passed,
            "error": error,
        }
    )
