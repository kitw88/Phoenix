import json
import re

PRODUCT_LABELS = [
    "AQ",
    "DQ",
    "CFF",
    "Sharkfin",
    "ELN",
    "Step-down FCN",
    "FCN",
    "Step-down SCN",
    "Phoenix",
    "WRA",
    "BEN",
    "DCN",
    "outside",
]


def parse_output(text: str) -> dict | None:
    trimmed = (text or "").strip()
    if not trimmed:
        return None
    candidates = [trimmed]
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", trimmed)
    if fenced:
        candidates.append(fenced.group(1).strip())
    start = trimmed.find("{")
    end = trimmed.rfind("}")
    if start >= 0 and end > start:
        candidates.append(trimmed[start : end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def judge(parsed: dict | None, field: str, expected: str | None) -> bool | None:
    if expected is None or expected == "":
        return None
    if not parsed or field not in parsed:
        return False
    return str(parsed[field]) == expected
