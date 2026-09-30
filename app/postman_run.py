import asyncio
import json

import websockets

from app.postman_sync import PostmanSession, PostmanUnavailable, debugger_url

REQUEST_MARK = "chat/completions"
ENV_NAME = "Product Classifier"
USER_KEY = "rawUser1Prompt"


def split_chat_body(body: str) -> tuple[str, str]:
    data = json.loads(body)
    if not isinstance(data, dict):
        raise ValueError("Postman 回傳的不是 JSON 物件。")
    if data.get("error") and "choices" not in data:
        raise ValueError(str(data["error"]))
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("Postman 回傳裡沒有 choices。")
    message = choices[0].get("message") or {}
    output = message.get("content") or ""
    reasoning = message.get("reasoning_content") or message.get("reasoning") or ""
    return output, reasoning


def _script(text: str) -> str:
    payload = json.dumps(text)
    return f"""
(async () => {{
  const text = {payload};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function openDb(name) {{
    return new Promise((resolve, reject) => {{
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(String(request.error));
    }});
  }}
  function getAll(db, store) {{
    return new Promise((resolve, reject) => {{
      const request = db.transaction(store, "readonly").objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(String(request.error));
    }});
  }}
  function putAll(db, store, rows) {{
    return new Promise((resolve, reject) => {{
      const tx = db.transaction(store, "readwrite");
      const objectStore = tx.objectStore(store);
      rows.forEach((row) => objectStore.put(row));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(String(tx.error));
    }});
  }}

  const databases = await indexedDB.databases();
  const envDbName = (databases.find((db) => (db.name || "").endsWith("-environments")) || {{}}).name;
  if (!envDbName) return {{ ok: false, error: "Postman 裡沒有 Environment。" }};
  const envDb = await openDb(envDbName);
  const environments = await getAll(envDb, "environments");
  const environment = environments.find((row) => ((row.value && row.value.name) || row.name) === {json.dumps(ENV_NAME)});
  if (!environment) {{
    envDb.close();
    return {{ ok: false, error: "Postman 裡沒有名為 Product Classifier 的 Environment。" }};
  }}
  const envId = (environment.value && environment.value.id) || environment.id;
  const values = (environment.value && environment.value.values) || [];
  let wroteInitial = false;
  values.forEach((variable) => {{
    if (variable && variable.key === {json.dumps(USER_KEY)}) {{
      variable.value = text;
      wroteInitial = true;
    }}
  }});
  if (!wroteInitial) values.push({{ key: {json.dumps(USER_KEY)}, value: text, enabled: true, type: "default" }});
  if (environment.value) environment.value.values = values;
  await putAll(envDb, "environments", [environment]);
  envDb.close();

  const appDb = await openDb("postman-app");
  const sessions = await getAll(appDb, "variable_sessions");
  const session = sessions.find((row) => row.model === "environment" && row.modelId === envId);
  if (session) {{
    const sessionValues = session.values || [];
    let wroteSession = false;
    sessionValues.forEach((variable) => {{
      if (variable && variable.key === {json.dumps(USER_KEY)}) {{
        variable.value = text;
        variable.enabled = true;
        wroteSession = true;
      }}
    }});
    if (!wroteSession) sessionValues.push({{ key: {json.dumps(USER_KEY)}, value: text, enabled: true, type: "default" }});
    session.values = sessionValues;
    await putAll(appDb, "variable_sessions", [session]);
  }}
  const before = await getAll(appDb, "console_events");
  appDb.close();
  const beforeIds = before.map((row) => row.id);

  const envOpen = [...document.querySelectorAll('td[data-column-id="key"]')]
    .some((cell) => (cell.innerText || "").trim() === {json.dumps(USER_KEY)});
  if (!envOpen) {{
    const envRow = [...document.querySelectorAll('[data-testid="sidebar-panel-environment"] [data-testid="sidebar-row-name"]')]
      .find((el) => (el.innerText || "").trim() === {json.dumps(ENV_NAME)});
    if (envRow) {{
      envRow.click();
      await sleep(700);
    }}
  }}

  const keyCell = [...document.querySelectorAll('td[data-column-id="key"]')]
    .find((cell) => (cell.innerText || "").trim() === {json.dumps(USER_KEY)});
  let live = false;
  if (keyCell) {{
    const editable = keyCell.parentElement.querySelector('td[data-column-id="sessionValue"] .editable-cell');
    const fiberKey = editable && Object.keys(editable).find((key) => key.startsWith("__reactFiber"));
    let fiber = fiberKey ? editable[fiberKey] : null;
    for (let i = 0; i < 25 && fiber; i += 1) {{
      const props = fiber.memoizedProps || {{}};
      if (typeof props.customOnChange === "function") {{
        props.customOnChange(text);
        live = true;
        break;
      }}
      fiber = fiber.return;
    }}
  }}

  function visible(selector) {{
    return [...document.querySelectorAll(selector)].find((el) => {{
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }});
  }}
  const requestRow = [...document.querySelectorAll('[data-testid="sidebar-row-name"]')]
    .find((el) => {{
      const label = (el.innerText || "").trim();
      return label.startsWith("https://") && label.includes({json.dumps(REQUEST_MARK)});
    }});
  if (!requestRow) return {{ ok: false, error: "側欄裡找不到要送出的 chat/completions 請求。", beforeIds, live }};
  let urlBar = visible('[data-testid="http-request-url-bar"]');
  let urlText = urlBar ? (urlBar.innerText || "") : "";
  if (!urlText.includes(requestRow.innerText.trim())) {{
    requestRow.click();
    await sleep(800);
    urlBar = visible('[data-testid="http-request-url-bar"]');
    urlText = urlBar ? (urlBar.innerText || "") : "";
  }}
  if (!urlText.includes({json.dumps(REQUEST_MARK)})) {{
    return {{ ok: false, error: "沒有切到 chat/completions 請求，所以沒有送出。", beforeIds, live, urlText }};
  }}
  const envTrigger = document.querySelector('[data-testid^="env-filter-select-trigger"]');
  const envSelected = envTrigger ? (envTrigger.innerText || "") : "";
  if (!envSelected.includes({json.dumps(ENV_NAME)})) {{
    return {{ ok: false, error: "請先在 Postman 右上角把 Environment 選成 Product Classifier。", beforeIds, live }};
  }}
  const send = visible('[data-testid="http-send-request-button"]');
  if (!send) return {{ ok: false, error: "畫面上沒有 Send。", beforeIds, live }};
  const rect = send.getBoundingClientRect();
  return {{
    ok: true,
    beforeIds,
    live,
    send: {{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }},
  }};
}})()
"""


def _poll_script(before_ids: list[str]) -> str:
    encoded = json.dumps(before_ids)
    mark = json.dumps(REQUEST_MARK)
    return f"""
(async () => {{
  const before = new Set({encoded});
  const db = await new Promise((resolve, reject) => {{
    const request = indexedDB.open("postman-app");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(String(request.error));
  }});
  const rows = await new Promise((resolve, reject) => {{
    const request = db.transaction("console_events", "readonly").objectStore("console_events").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(String(request.error));
  }});
  const blobs = await new Promise((resolve, reject) => {{
    const request = db.transaction("console_blob", "readonly").objectStore("console_blob").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(String(request.error));
  }});
  db.close();
  function blobText(id) {{
    const row = blobs.find((item) => item.id === id);
    return row ? row.data : "";
  }}
  const fresh = rows.filter((row) => row && row.type === "network" && !before.has(row.id));
  for (let index = fresh.length - 1; index >= 0; index -= 1) {{
    const event = fresh[index];
    const details = event.details || {{}};
    let requestText = JSON.stringify(details.request || {{}});
    if (!requestText.includes({mark})) requestText = String(blobText(event.id + "-req") || "");
    if (!requestText.includes({mark})) continue;
    const response = details.response || {{}};
    if (response.code == null && !response.body) continue;
    let body = response.body;
    if (body && typeof body === "object") {{
      body = blobText(body.blobId) || blobText(event.id + "-res") || body.text || body.content || "";
    }}
    if (body && typeof body === "object") body = JSON.stringify(body);
    return {{ code: response.code, status: response.status || "", body: body == null ? "" : String(body) }};
  }}
  return null;
}})()
"""


async def send_user_prompt(text: str) -> dict:
    try:
        url = debugger_url()
    except PostmanUnavailable:
        raise
    try:
        async with websockets.connect(url, max_size=50_000_000, open_timeout=5) as socket:
            page = PostmanSession(socket)
            started = await page.evaluate(_script(text))
            if not isinstance(started, dict) or not started.get("ok"):
                message = (started or {}).get("error") if isinstance(started, dict) else "Postman 沒有送出請求。"
                raise PostmanUnavailable(message or "Postman 沒有送出請求。")
            before_ids = started.get("beforeIds") or []
            point = started.get("send") or {}
            x = float(point.get("x") or 0)
            y = float(point.get("y") or 0)
            if x <= 0 or y <= 0:
                raise PostmanUnavailable("畫面上找不到可以點的 Send。")
            await page.call("Input.dispatchMouseEvent", {
                "type": "mousePressed",
                "x": x,
                "y": y,
                "button": "left",
                "clickCount": 1,
            })
            await page.call("Input.dispatchMouseEvent", {
                "type": "mouseReleased",
                "x": x,
                "y": y,
                "button": "left",
                "clickCount": 1,
            })
            for _ in range(90):
                await asyncio.sleep(2)
                found = await page.evaluate(_poll_script(before_ids))
                if not found:
                    continue
                code = int(found.get("code") or 0)
                body = found.get("body") or ""
                if code >= 400:
                    detail = body.replace("\n", " ")[:180]
                    raise PostmanUnavailable(f"Postman 收到 HTTP {code}。{detail}")
                try:
                    output, reasoning = split_chat_body(body)
                except (json.JSONDecodeError, ValueError, KeyError, TypeError) as exc:
                    raise PostmanUnavailable(f"Postman 的回應解析不了：{exc}") from exc
                return {"output_text": output, "reasoning_text": reasoning}
    except PostmanUnavailable:
        raise
    except (OSError, asyncio.TimeoutError, websockets.WebSocketException) as exc:
        raise PostmanUnavailable("連到 Postman 後中斷了。") from exc
    raise PostmanUnavailable("Postman 送出後 3 分鐘內沒有回應。")
