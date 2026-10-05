import os
import tempfile
import threading

import cursor_sdk._bridge as bridge
from cursor_sdk import Agent, AgentOptions, LocalAgentOptions, SandboxOptions
from cursor_sdk.errors import CursorSDKError

MODEL = "grok-4.7"


def _read_discovery_windows(process, timeout):
    if process.stderr is None:
        raise CursorSDKError("Bridge process stderr is unavailable")
    holder: dict = {"lines": []}

    def reader() -> None:
        assert process.stderr is not None
        for line in process.stderr:
            holder["lines"].append(line)
            try:
                discovery = bridge.parse_discovery_line(
                    line if line.endswith("\n") else line + "\n"
                )
            except CursorSDKError as exc:
                holder["error"] = exc
                return
            if discovery is not None:
                holder["discovery"] = discovery
                return

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()
    thread.join(timeout)
    if holder.get("error"):
        raise holder["error"]
    if "discovery" in holder:
        return holder["discovery"]
    raise CursorSDKError(
        "Cursor 沒有準備好：" + "".join(holder["lines"])[-500:]
    )


bridge._read_discovery = _read_discovery_windows


def _clip(text: str, limit: int) -> str:
    cleaned = (text or "").strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit] + "\n…（後面略去）"


def analyze(prompt_text: str, cases: list[dict]) -> str:
    if not os.environ.get("CURSOR_API_KEY", "").strip():
        return (
            "1）原因\n"
            "結果和期望不一致，但評測系統沒有 CURSOR_API_KEY，所以 reasoning 沒有送到 Cursor。\n\n"
            "2）建議修改\n"
            "沒有提出修改。Prompt 保持原樣。"
        )
    message = _message(prompt_text, cases)
    cwd = tempfile.mkdtemp(prefix="phoenix-review-")
    try:
        result = Agent.prompt(
            message,
            AgentOptions(
                model=MODEL,
                local=LocalAgentOptions(
                    cwd=cwd,
                    setting_sources=[],
                    sandbox_options=SandboxOptions(enabled=True),
                ),
            ),
        )
    except Exception as exc:
        return (
            "1）原因\n"
            f"reasoning 沒有送到 Cursor。{exc}\n\n"
            "2）建議修改\n"
            "沒有提出修改。Prompt 保持原樣。"
        )
    if result.status != "finished":
        return (
            "1）原因\n"
            f"Cursor 分析沒有完成（{result.status}）。\n\n"
            "2）建議修改\n"
            "沒有提出修改。Prompt 保持原樣。"
        )
    text = (result.result or "").strip()
    if not text:
        return (
            "1）原因\n"
            "Cursor 沒有返回分析。\n\n"
            "2）建議修改\n"
            "沒有提出修改。Prompt 保持原樣。"
        )
    return text


def _message(prompt_text: str, cases: list[dict]) -> str:
    blocks = []
    for index, case in enumerate(cases, start=1):
        blocks.append(
            "\n".join(
                [
                    f"Case {index}: {case['title']}",
                    f"Human label: {case['expectation']}",
                    "The human label is not ground truth. Do not assume it is correct.",
                    f"Model product: {case['product'] or '（沒有）'}",
                    "Term sheet clauses:",
                    _clip(case.get("input") or "", 6000),
                    "Model output:",
                    _clip(case["output"], 2500),
                    "Reasoning:",
                    _clip(case["reasoning"], 6000) or "（沒有 reasoning）",
                ]
            )
        )
    return f"""You judge a structured-product classifier. A person attached a label. The model returned another label. The person's label is a hypothesis, not the answer.

Do not create, edit, rename, or delete any file. Do not change the stored prompt. Reply with text only.

For each case, read the term sheet clauses and the model reasoning yourself. Decide which one is unsupported:
- the model misread a clause that the prompt already states
- the prompt wording made the model ignore a clause that is in the term sheet
- the human label is not supported by the term sheet clauses

Do not argue that the model is wrong merely because it disagreed with the human label.

Reply in Traditional Chinese, with exactly these two sections and no other preface:

1）原因
For each case separately: file name, human label, model label, and what the clauses actually say. State whether the miss comes from the reasoning, the prompt, or the human label.

2）建議修改
One combined proposal after every case. Quote prompt sentences and replacements only when the prompt wording caused a reading the clauses do not support. If the human label is the part that the clauses do not support, say 不建議修改 prompt. The classifier prompt stays English. Do not apply any edit.

Classifier prompt:
{_clip(prompt_text, 20000)}

Cases:
{chr(10).join(blocks)}
"""
