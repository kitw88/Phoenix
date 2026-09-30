const app = document.querySelector("#app");
let state = null;
let view = { mode: "draft", versionId: null };
let caseDraft = { case_id: null, title: "", input_text: "", expectation: "" };
let status = "";
let busy = false;
let lastRun = null;
let table = {
  suite: "test",
  result: "all",
  page: 1,
  versionId: null,
  rows: [],
  total: 0,
  counts: { labeled: 0, pending: 0, pass: 0, fail: 0, unscored: 0 },
  openId: null,
  detail: null,
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

async function load() {
  const response = await fetch("/api/postman/sync", { method: "POST" });
  const payload = await response.json();
  state = payload.state;
  status = payload.message || "";
  const newest = prompt().runs[0];
  if (!lastRun) lastRun = newest || null;
  else if (newest && newest.id > lastRun.id) lastRun = newest;
  if (lastRun && lastRun.id && lastRun.output_text == null) {
    const detail = await fetch(`/api/runs/${lastRun.id}`);
    if (detail.ok) lastRun = await detail.json();
  }
  await loadTable();
  render();
}

async function loadTable() {
  const workflow = prompt().workflow;
  if (!workflow) return;
  const params = new URLSearchParams({
    suite: table.suite,
    result: table.suite === "test" ? table.result : "all",
    page: String(table.page),
    page_size: "50",
  });
  if (table.versionId) params.set("version_id", String(table.versionId));
  const response = await fetch(`/api/workflows/${workflow.id}/cases?${params}`);
  if (!response.ok) return;
  const payload = await response.json();
  table.rows = payload.rows;
  table.total = payload.total;
  table.counts = payload.counts;
  table.page = payload.page;
}

function prompt() {
  return state.prompts[0];
}

function targetName(id) {
  return state.targets.find((target) => target.id === id)?.name || "未選擇";
}

function versionLabel(id) {
  const version = prompt().versions.find((item) => item.id === id);
  return version ? `v${version.number}` : "尚未釘選";
}

async function send(url, options) {
  busy = true;
  status = "處理中…";
  render();
  const response = await fetch(url, {
    method: options.method,
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  busy = false;
  if (!response.ok) {
    status = payload.detail || "請求失敗";
    render();
    return null;
  }
  status = "";
  if (payload.state) state = payload.state;
  else state = payload;
  if (payload.run) lastRun = payload.run;
  await loadTable();
  if (payload.runs) lastRun = payload.runs[payload.runs.length - 1] || lastRun;
  return payload;
}

function render() {
  const current = prompt();
  const workflow = current.workflow;
  const viewing = view.mode === "version"
    ? current.versions.find((item) => item.id === view.versionId)
    : null;
  app.innerHTML = `
    <section class="targets">
      <div class="row toolbar">
        <button type="button" id="sync-postman" ${busy ? "disabled" : ""}>重新識別 Postman</button>
      </div>
      ${state.targets.length ? state.targets.map(targetCard).join("") : `<p class="note">還沒有從 Postman 識別到 API Target。</p>`}
    </section>
    <p class="status">${esc(status)}</p>
    ${renderRun()}
    <div class="desk">
      <section class="sheet manuscript">
        <h2>${esc(current.name)}</h2>
        <p class="note">一步 Workflow。釘選 ${esc(versionLabel(workflow.pinned_version_id))} · ${esc(targetName(workflow.pinned_target_id))}。預設回歸目標 ${esc(targetName(current.default_target_id))}。</p>
        <div class="versions">
          <button type="button" data-view="draft" aria-pressed="${view.mode === "draft"}">Draft</button>
          ${current.versions.map((version) => `
            <button type="button" data-view="version" data-version="${version.id}" aria-pressed="${view.versionId === version.id}">v${version.number}</button>
          `).join("")}
        </div>
        ${viewing ? `<div class="readonly">${esc(viewing.body)}</div>` : `<textarea id="draft">${esc(current.draft)}</textarea>`}
        <div class="row" style="margin-top:12px">
          ${viewing ? "" : `<button type="button" id="save-draft">保存草稿</button>`}
          ${viewing ? "" : `<button type="button" class="primary" id="publish" ${busy ? "disabled" : ""}>發布並回歸</button>`}
          ${viewing ? `<button type="button" id="pin-version">把 v${viewing.number} 釘到 Workflow</button>` : ""}
        </div>
        <h2 style="margin-top:22px">再跑一個已保存的 Case</h2>
        <p class="note">一樣交給 Postman：更新 rawUser1Prompt 後 Send。系統提示詞用的是 Postman 裡的 rawSysPrompt。</p>
        <div class="row">
          <select id="try-source">
            <option value="draft">Draft</option>
            ${current.versions.map((version) => `<option value="version:${version.id}">v${version.number}</option>`).join("")}
          </select>
          <select id="try-target">
            ${state.targets.map((target) => `<option value="${target.id}">${esc(target.name)}</option>`).join("")}
          </select>
        </div>
        <p class="note">在下方表格按「再跑」會用選中的版本，交給 Postman 跑那一行。</p>
      </section>
      <section class="sheet">
        <h2>加入 Case</h2>
        <p class="note">pdf、docx 或文字。手機點下面選檔，電腦也可以直接拖進來。抽出的文字寫進 Postman 的 rawUser1Prompt 並送出。確認期望結果後進入測試集。</p>
        <label class="dropzone" id="dropzone">
          <strong>上傳 Term Sheet</strong>
          <span class="note">點這裡從手機選檔，可一次選多份</span>
          <input id="case-file" type="file" accept=".txt,.md,.json,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" multiple />
        </label>
        <form id="case-form">
          <label>標題</label>
          <input name="title" value="${esc(caseDraft.title)}" />
          <label>Expectation · product</label>
          <select name="expectation">
            <option value="">未標籤，不進回歸</option>
            ${current.expectation_options.map((label) => `
              <option value="${esc(label)}" ${caseDraft.expectation === label ? "selected" : ""}>${esc(label)}</option>
            `).join("")}
          </select>
          <label>Input</label>
          <textarea name="input_text">${esc(caseDraft.input_text)}</textarea>
          <div class="row" style="margin-top:10px">
            <button type="submit" class="primary">${caseDraft.case_id ? "更新 Case" : "加入 Case"}</button>
            ${caseDraft.case_id ? `<button type="button" id="clear-case">取消編輯</button>` : ""}
          </div>
        </form>
      </section>
    </div>
    <section class="sheet suite">
      ${renderTable()}
    </section>
  `;
  bind();
}

function targetCard(target) {
  return `
    <form class="card target ${target.is_default ? "default" : ""}" data-target="${target.id}">
      <h2>${esc(target.model)}</h2>
      <p class="note">${esc(target.base_url)}</p>
      <label>Key ${target.has_key ? "· 已留在系統" : "· Postman secret 讀不到"}</label>
      <input name="api_key" type="password" placeholder="${target.has_key ? "已保存，留空則不更改" : "輸入一次"}" autocomplete="off" />
      <div class="row" style="margin-top:10px">
        <button type="submit">${target.has_key ? "更新 key" : "保存 key"}</button>
        ${target.is_default ? "" : `<button type="button" data-default="${target.id}">設為預設</button>`}
      </div>
    </form>
  `;
}

function renderTable() {
  const counts = table.counts;
  const pages = Math.max(1, Math.ceil(table.total / 50));
  const filters = table.suite === "test" ? `
    <button type="button" data-result="all" aria-pressed="${table.result === "all"}">全部</button>
    <button type="button" data-result="fail" aria-pressed="${table.result === "fail"}">未通過 ${counts.fail}</button>
    <button type="button" data-result="pass" aria-pressed="${table.result === "pass"}">通過 ${counts.pass}</button>
    <button type="button" data-result="unscored" aria-pressed="${table.result === "unscored"}">未回歸 ${counts.unscored}</button>
  ` : "";
  return `
    <div class="row">
      <button type="button" data-suite="test" aria-pressed="${table.suite === "test"}">測試集 ${counts.labeled}</button>
      <button type="button" data-suite="pending" aria-pressed="${table.suite === "pending"}">待確認 ${counts.pending}</button>
      ${filters}
    </div>
    <p class="note">${table.versionId ? "這一頁是該次發布的回歸。" : "測試集按最近一次回歸顯示。未通過的列可以展開 reasoning。"} 共 ${table.total} 筆，每頁 50。</p>
    <table class="suite-table">
      <thead>
        <tr>
          <th class="name">檔名</th>
          <th class="label">期望</th>
          <th class="label">模型</th>
          <th class="verdict">回歸</th>
          <th class="actions"></th>
        </tr>
      </thead>
      <tbody>
        ${table.rows.map(suiteRow).join("") || `<tr><td colspan="5">這一頁沒有 Case。</td></tr>`}
      </tbody>
    </table>
    <div class="row">
      <button type="button" id="page-prev" ${table.page <= 1 ? "disabled" : ""}>上一頁</button>
      <span class="note">${table.page} / ${pages}</span>
      <button type="button" id="page-next" ${table.page >= pages ? "disabled" : ""}>下一頁</button>
    </div>
  `;
}

function suiteRow(row) {
  const verdict = !row.expectation
    ? "待確認"
    : row.passed === true
      ? "pass"
      : row.passed === false
        ? "fail"
        : "未回歸";
  const open = table.openId === row.id && table.detail;
  return `
    <tr class="${row.passed === false ? "fail" : ""}">
      <td class="name" title="${esc(row.title || "Untitled case")}">
        ${esc(row.title || "Untitled case")}
        ${row.has_source ? `<a href="/api/cases/${row.id}/file">原檔</a>` : ""}
      </td>
      <td class="label" data-label="期望">${esc(row.expectation || "—")}</td>
      <td class="label" data-label="模型">${esc(row.product || "—")}</td>
      <td class="verdict" data-label="回歸"><span class="stamp ${verdict === "pass" ? "pass" : verdict === "fail" ? "fail" : "open"}">${verdict}</span></td>
      <td class="actions">
        ${row.run_id ? `<button type="button" data-open="${row.id}" data-run="${row.run_id}">${table.openId === row.id ? "收起" : "結果"}</button>` : ""}
        <button type="button" data-rerun="${row.id}">再跑</button>
        <button type="button" data-edit-case="${row.id}">編輯</button>
        <button type="button" data-delete-case="${row.id}">刪除</button>
      </td>
    </tr>
    ${open ? detailCells(table.detail, row) : ""}
  `;
}

function detailCells(detail, row) {
  const parsed = detail.parsed
    ? JSON.stringify(detail.parsed, null, 2)
    : detail.output_text || "（沒有 Output）";
  return `
    <tr class="detail-row ${row.passed === false ? "fail" : ""}">
      <td colspan="5">
        <p class="note">期望 ${esc(row.expectation || "（無）")} · 模型 ${esc(detail.parsed && detail.parsed.product ? detail.parsed.product : row.product || "（無）")} ${esc(detail.error || "")}</p>
        <div class="results">
          <article class="result-pane">
            <h2>Output</h2>
            <pre>${esc(parsed)}</pre>
          </article>
          <article class="result-pane reason">
            <h2>Reasoning</h2>
            <pre>${esc(detail.reasoning_text || "（這次沒有思考過程）")}</pre>
          </article>
        </div>
      </td>
    </tr>
  `;
}

function renderRun() {
  if (!lastRun) return "";
  const parsed = lastRun.parsed
    ? JSON.stringify(lastRun.parsed, null, 2)
    : lastRun.output_text || "（沒有 Output）";
  const verdict = lastRun.passed === true ? "pass" : lastRun.passed === false ? "fail" : "待確認";
  const caseTitle = table.rows.find((item) => item.id === lastRun.case_id)?.title || "";
  const product = lastRun.parsed && lastRun.parsed.product ? String(lastRun.parsed.product) : "";
  const judging = !lastRun.expectation && lastRun.case_id;
  const options = prompt().expectation_options;
  const selected = options.includes(product) ? product : "";
  return `
    <section class="results">
      <article class="result-pane">
        <h2>Output ${caseTitle ? `· ${esc(caseTitle)}` : ""} <span class="stamp ${verdict === "pass" ? "pass" : verdict === "fail" ? "fail" : "open"}">${esc(verdict)}</span></h2>
        <p class="note">${esc(lastRun.error || (lastRun.expectation ? `期望結果 ${lastRun.expectation}` : "首次結果。請判斷這是不是期望結果。"))}</p>
        <pre>${esc(parsed)}</pre>
        ${judging ? `
          <div class="row" style="margin-top:12px">
            <select id="judge-label">
              <option value="">選擇期望的 product</option>
              ${options.map((label) => `<option value="${esc(label)}" ${label === selected ? "selected" : ""}>${esc(label)}</option>`).join("")}
            </select>
            <button type="button" class="primary" id="confirm-expectation" ${busy ? "disabled" : ""}>確認並加入測試集</button>
          </div>
        ` : ""}
      </article>
      <article class="result-pane reason">
        <h2>Reasoning</h2>
        <pre>${esc(lastRun.reasoning_text || "（這次沒有思考過程）")}</pre>
      </article>
    </section>
  `;
}

function bind() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = () => {
      view = button.dataset.view === "draft"
        ? { mode: "draft", versionId: null }
        : { mode: "version", versionId: Number(button.dataset.version) };
      render();
    };
  });
  const sync = document.querySelector("#sync-postman");
  if (sync) {
    sync.onclick = () => load();
  }
  document.querySelectorAll("form.target").forEach((form) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const payload = await send(`/api/targets/${form.dataset.target}/key`, {
        method: "PUT",
        body: { api_key: data.api_key },
      });
      if (payload) status = data.api_key ? "key 已留在評測系統" : "未輸入新 key，系統裡的 key 保持不變";
      render();
    };
  });
  document.querySelectorAll("[data-default]").forEach((button) => {
    button.onclick = async () => {
      const payload = await send("/api/default-target", {
        method: "PUT",
        body: { prompt_id: prompt().id, target_id: Number(button.dataset.default) },
      });
      if (payload) status = "已改預設 API Target。已釘選的 Workflow 不會跟著改。";
      render();
    };
  });
  const saveDraft = document.querySelector("#save-draft");
  if (saveDraft) {
    saveDraft.onclick = async () => {
      const payload = await send(`/api/prompts/${prompt().id}/draft`, {
        method: "PUT",
        body: { draft: document.querySelector("#draft").value },
      });
      if (payload) status = "草稿已保存";
      render();
    };
  }
  const publish = document.querySelector("#publish");
  if (publish) {
    publish.onclick = async () => {
      await send(`/api/prompts/${prompt().id}/draft`, {
        method: "PUT",
        body: { draft: document.querySelector("#draft").value },
      });
      const payload = await send(`/api/prompts/${prompt().id}/publish`, { method: "POST" });
      if (!payload) return;
      const failed = payload.runs.filter((run) => run.passed === false);
      table.suite = "test";
      table.versionId = payload.version.id;
      table.result = failed.length ? "fail" : "all";
      table.page = 1;
      table.openId = null;
      table.detail = null;
      await loadTable();
      const firstFail = table.rows.find((row) => row.passed === false && row.run_id);
      if (firstFail) {
        const detail = await fetch(`/api/runs/${firstFail.run_id}`);
        if (detail.ok) {
          table.openId = firstFail.id;
          table.detail = await detail.json();
        }
      }
      status = payload.runs.length
        ? `已發布 v${payload.version.number}，回歸 ${payload.runs.length} 筆，未通過 ${failed.length} 筆`
        : `已發布 v${payload.version.number}。沒有已標籤 Case，所以沒有回歸。`;
      view = { mode: "version", versionId: payload.version.id };
      render();
    };
  }
  const pin = document.querySelector("#pin-version");
  if (pin) {
    pin.onclick = async () => {
      const payload = await send(`/api/prompts/${prompt().id}/pin`, {
        method: "PUT",
        body: { version_id: view.versionId },
      });
      if (payload) status = "Workflow 已改釘這個版本";
      render();
    };
  }
  const tryButton = document.querySelector("#try");
  if (tryButton) {
    tryButton.onclick = async () => {
      const source = document.querySelector("#try-source").value;
      const [kind, id] = source.split(":");
      if (kind === "draft" && document.querySelector("#draft")) {
        await send(`/api/prompts/${prompt().id}/draft`, {
          method: "PUT",
          body: { draft: document.querySelector("#draft").value },
        });
      }
      const payload = await send(`/api/prompts/${prompt().id}/try`, {
        method: "POST",
        body: {
          source: kind,
          version_id: id ? Number(id) : null,
          target_id: Number(document.querySelector("#try-target").value),
          case_id: Number(document.querySelector("#try-case").value),
        },
      });
      if (payload) status = payload.run.error ? payload.run.error : "Postman 已跑完";
      render();
    };
  }
  const dropzone = document.querySelector("#dropzone");
  const fileInput = document.querySelector("#case-file");
  if (dropzone && fileInput) {
    const arm = (event) => {
      event.preventDefault();
      dropzone.classList.add("over");
    };
    const drop = (event) => {
      event.preventDefault();
      dropzone.classList.remove("over");
      uploadCases(event.dataTransfer.files);
    };
    dropzone.ondragover = arm;
    dropzone.ondragleave = () => dropzone.classList.remove("over");
    dropzone.ondrop = drop;
    fileInput.ondragover = arm;
    fileInput.ondrop = drop;
    fileInput.onchange = () => {
      uploadCases(fileInput.files);
      fileInput.value = "";
    };
  }
  const confirm = document.querySelector("#confirm-expectation");
  if (confirm) {
    confirm.onclick = async () => {
      const label = document.querySelector("#judge-label").value;
      if (!label) {
        status = "先選期望的 product";
        render();
        return;
      }
      const payload = await send(`/api/workflows/${prompt().workflow.id}/cases`, {
        method: "POST",
        body: {
          case_id: lastRun.case_id,
          expectation: label,
        },
      });
      if (!payload) return;
      lastRun = { ...lastRun, expectation: label, passed: lastRun.parsed && lastRun.parsed.product === label };
      table.suite = "test";
      table.page = 1;
      await loadTable();
      status = `已加入測試集，期望結果是 ${label}`;
      render();
    };
  }
  const form = document.querySelector("#case-form");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const payload = await send(`/api/workflows/${prompt().workflow.id}/cases`, {
      method: "POST",
      body: { ...data, case_id: caseDraft.case_id },
    });
    if (payload) {
      caseDraft = { case_id: null, title: "", input_text: "", expectation: "" };
      status = "Case 已保存";
    }
    render();
  };
  document.querySelectorAll("[data-suite]").forEach((button) => {
    button.onclick = async () => {
      table.suite = button.dataset.suite;
      table.page = 1;
      table.openId = null;
      table.detail = null;
      await loadTable();
      render();
    };
  });
  document.querySelectorAll("[data-result]").forEach((button) => {
    button.onclick = async () => {
      table.result = button.dataset.result;
      table.page = 1;
      table.openId = null;
      table.detail = null;
      await loadTable();
      render();
    };
  });
  const prev = document.querySelector("#page-prev");
  const next = document.querySelector("#page-next");
  if (prev) {
    prev.onclick = async () => {
      table.page -= 1;
      table.openId = null;
      await loadTable();
      render();
    };
  }
  if (next) {
    next.onclick = async () => {
      table.page += 1;
      table.openId = null;
      await loadTable();
      render();
    };
  }
  document.querySelectorAll("[data-open]").forEach((button) => {
    button.onclick = async () => {
      const caseId = Number(button.dataset.open);
      if (table.openId === caseId) {
        table.openId = null;
        table.detail = null;
        render();
        return;
      }
      const response = await fetch(`/api/runs/${button.dataset.run}`);
      if (!response.ok) return;
      table.openId = caseId;
      table.detail = await response.json();
      render();
    };
  });
  document.querySelectorAll("[data-rerun]").forEach((button) => {
    button.onclick = async () => {
      const source = document.querySelector("#try-source").value;
      const [kind, id] = source.split(":");
      if (kind === "draft" && document.querySelector("#draft")) {
        await send(`/api/prompts/${prompt().id}/draft`, {
          method: "PUT",
          body: { draft: document.querySelector("#draft").value },
        });
      }
      const payload = await send(`/api/prompts/${prompt().id}/try`, {
        method: "POST",
        body: {
          source: kind,
          version_id: id ? Number(id) : null,
          target_id: Number(document.querySelector("#try-target").value),
          case_id: Number(button.dataset.rerun),
        },
      });
      if (!payload) return;
      table.openId = Number(button.dataset.rerun);
      table.detail = payload.run;
      status = payload.run.error ? payload.run.error : "Postman 已跑完";
      render();
    };
  });
  document.querySelectorAll("[data-edit-case]").forEach((button) => {
    button.onclick = async () => {
      const response = await fetch(`/api/cases/${button.dataset.editCase}`);
      if (!response.ok) return;
      const item = await response.json();
      caseDraft = { ...item, case_id: item.id };
      render();
    };
  });
  document.querySelectorAll("[data-delete-case]").forEach((button) => {
    button.onclick = async () => {
      const payload = await send(`/api/cases/${button.dataset.deleteCase}`, { method: "DELETE" });
      if (payload) status = "Case 已刪除";
      render();
    };
  });
  const clear = document.querySelector("#clear-case");
  if (clear) {
    clear.onclick = () => {
      caseDraft = { case_id: null, title: "", input_text: "", expectation: "" };
      render();
    };
  }
}

async function uploadCases(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  for (const file of files) {
    busy = true;
    status = `正在抽出 ${file.name}，寫進 Postman 並送出…`;
    render();
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`/api/workflows/${prompt().workflow.id}/drop`, {
      method: "POST",
      body,
    });
    const payload = await response.json();
    busy = false;
    if (!response.ok) {
      status = payload.detail || "這份檔沒有跑成";
      render();
      continue;
    }
    state = payload.state;
    lastRun = payload.run;
    table.suite = "pending";
    table.page = 1;
    await loadTable();
    table.openId = payload.case_id;
    table.detail = payload.run;
    status = payload.run.error
      ? payload.run.error
      : `${file.name} 已跑完。請確認期望結果，確認後會進入測試集。`;
    render();
  }
}

load();
