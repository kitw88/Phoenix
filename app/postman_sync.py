import json
import subprocess
from urllib.request import urlopen

import websockets

EXTRACT_TARGETS = r"""
(async () => {
  const databases = await indexedDB.databases();
  const envName = (databases.find((db) => (db.name || "").endsWith("-environments")) || {}).name;
  const collectionName = (databases.find((db) => (db.name || "").endsWith("-v3-collections")) || {}).name;
  if (!collectionName) return [];

  function openDb(name) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(String(request.error));
    });
  }
  function getAll(db, store) {
    return new Promise((resolve, reject) => {
      const request = db.transaction(store, "readonly").objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(String(request.error));
    });
  }
  function concrete(value) {
    const text = value == null ? "" : String(value).trim();
    if (!text || text.includes("{{")) return "";
    return text;
  }

  const baseUrls = [];
  if (envName) {
    const envDb = await openDb(envName);
    const environments = await getAll(envDb, "environments");
    envDb.close();
    environments.forEach((row) => {
      const values = (row.value && row.value.values) || [];
      values.forEach((variable) => {
        if (!variable || variable.key !== "base_url" || variable.type === "secret") return;
        const value = concrete(variable.value);
        if (value.startsWith("http")) baseUrls.push(value.replace(/\/$/, ""));
      });
    });
  }

  const collectionDb = await openDb(collectionName);
  const collections = await getAll(collectionDb, "v3-collections");
  collectionDb.close();

  const models = [];
  const requests = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (Array.isArray(node.variables)) {
      node.variables.forEach((variable) => {
        if (variable && variable.key === "model") {
          const value = concrete(variable.value);
          if (value) models.push(value);
        }
      });
    }
    if (node.body && node.body.content && node.url) {
      const raw = typeof node.url === "string" ? node.url : (node.url.raw || "");
      const match = String(node.body.content).match(/"model"\s*:\s*"([^"]+)"/);
      requests.push({ name: node.name || raw, url: raw, model: match ? match[1] : "" });
    }
    Object.values(node).forEach(walk);
  }
  collections.forEach(walk);

  const found = [];
  const seen = new Set();
  function add(name, base, model) {
    if (!base.startsWith("http") || !model || model.includes("{{")) return;
    const key = base + "\n" + model;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ name, base_url: base, model });
  }

  requests.forEach((request) => {
    const model = request.model.includes("{{") ? (models[0] || "") : request.model;
    let url = request.url;
    if (url.includes("{{base_url}}")) {
      baseUrls.forEach((base) => {
        add(request.name, base, model);
      });
      return;
    }
    const cleaned = url.split("?")[0].replace(/\/$/, "");
    const suffix = "/chat/completions";
    const base = cleaned.endsWith(suffix) ? cleaned.slice(0, -suffix.length) : cleaned;
    add(request.name, base, model);
  });
  return found;
})()
"""


class PostmanUnavailable(Exception):
    pass


def _postman_ports() -> list[int]:
    script = (
        "$pids = @(Get-Process Postman -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id); "
        "if (-not $pids) { return }; "
        "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | "
        "Where-Object { $pids -contains $_.OwningProcess -and $_.LocalAddress -eq '127.0.0.1' } | "
        "Select-Object -ExpandProperty LocalPort"
    )
    try:
        output = subprocess.check_output(
            ["powershell", "-NoProfile", "-Command", script],
            text=True,
            timeout=15,
        )
    except (subprocess.SubprocessError, OSError):
        return []
    ports = []
    for line in output.splitlines():
        line = line.strip()
        if line.isdigit():
            ports.append(int(line))
    return ports


def _debugger_pages(port: int) -> list[dict]:
    try:
        with urlopen(f"http://127.0.0.1:{port}/json/list", timeout=1) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, json.JSONDecodeError, TimeoutError):
        return []
    return [item for item in payload if item.get("type") == "page" and item.get("webSocketDebuggerUrl")]


async def _evaluate(websocket_url: str) -> list[dict]:
    async with websockets.connect(websocket_url, max_size=50_000_000, open_timeout=3) as socket:
        await socket.send(json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": EXTRACT_TARGETS,
                "returnByValue": True,
                "awaitPromise": True,
            },
        }))
        while True:
            message = json.loads(await socket.recv())
            if message.get("id") != 1:
                continue
            result = message.get("result", {})
            if result.get("exceptionDetails"):
                raise PostmanUnavailable("Postman 已打開，但讀不到其中的請求。")
            value = result.get("result", {}).get("value")
            return value if isinstance(value, list) else []


def discover() -> list[dict]:
    import asyncio

    ports = _postman_ports()
    if not ports:
        raise PostmanUnavailable("Postman 沒有在本機運行，沿用系統裡已識別的 API Target。")
    for port in ports:
        pages = _debugger_pages(port)
        if not pages:
            continue
        try:
            return asyncio.run(_evaluate(pages[0]["webSocketDebuggerUrl"]))
        except (OSError, asyncio.TimeoutError, websockets.WebSocketException):
            continue
    raise PostmanUnavailable("Postman 正在運行，但評測系統連不進它的本機資料。沿用已保存的 API Target。")


class PostmanSession:
    def __init__(self, socket) -> None:
        self._socket = socket
        self._call_id = 0

    async def call(self, method: str, params: dict | None = None):
        self._call_id += 1
        current = self._call_id
        await self._socket.send(json.dumps({
            "id": current,
            "method": method,
            "params": params or {},
        }))
        while True:
            message = json.loads(await self._socket.recv())
            if message.get("id") != current:
                continue
            if message.get("error"):
                raise PostmanUnavailable(str(message["error"].get("message") or message["error"]))
            return message.get("result", {})

    async def evaluate(self, expression: str):
        result = await self.call("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True,
        })
        if result.get("exceptionDetails"):
            detail = result["exceptionDetails"].get("exception", {}).get("description")
            text = result["exceptionDetails"].get("text") or detail or "Postman 腳本執行失敗"
            raise PostmanUnavailable(str(text))
        return result.get("result", {}).get("value")


def debugger_url() -> str:
    ports = _postman_ports()
    if not ports:
        raise PostmanUnavailable("Postman 沒有在本機運行。打開 Postman 後再跑 Case。")
    for port in ports:
        pages = _debugger_pages(port)
        if pages:
            return pages[0]["webSocketDebuggerUrl"]
    raise PostmanUnavailable("Postman 正在運行，但評測系統連不進它。")
