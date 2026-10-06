const app = document.querySelector("#app");
let state = null;
let view = { mode: "draft", versionId: null };
let caseDraft = { case_id: null, title: "", input_text: "", expectation: "" };
let batchExpectation = "";
let status = "";
let health = { ok: null, issues: [] };
let laneError = "";
let busy = false;
let lastRun = null;
let draftBuffer = null;
let draftRemark = "";
let versionRemarkEdits = {};
let versionQuery = "";
let selectedTargetId = null;
let targetMenuOpen = false;
let targetEditorId = null;
let addingTarget = false;
let targetCloseTimer = 0;
let targetOutsideBound = false;
let renderedView = { mode: "draft", versionId: null };
let focusSearch = false;
let versionScrollTop = 0;
let lastUploadKey = "";
let lastUploadAt = 0;
let sessionUser = null;
let loginEmail = "";
let loginCode = "";
let loginNotice = "";
let loginError = "";
let picked = new Set();
let expectFocus = false;
let expectOutside = false;
let labelOutside = false;
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
  expectFilter: [],
  expectOpen: false,
  expectQuery: "",
  labelOpenId: null,
};
let lang = localStorage.getItem("phoenix-lang") || "en";
if (!["hant", "hans", "en"].includes(lang)) lang = "hant";

const COPY = {
  hant: {
    langLabel: "語言",
    drop: "拖曳或上傳 PDF / DOCX",
    title: "標題",
    paste: "或直接貼文字",
    input: "條款",
    noLabel: "不上標籤，上傳後再確認",
    updateCase: "更新 Case",
    addCase: "加入 Case",
    cancelEdit: "取消編輯",
    apiTarget: "API Target",
    addTarget: "新增 API Target",
    resync: "重新識別 Postman",
    noKeyed: "沒有已留下 key 的 API Target。",
    searchVersions: "搜尋版本",
    draft: "草稿",
    unpublished: "尚未發布",
    emptyDraft: "空白草稿",
    latest: "最新",
    pinned: "釘選",
    noRemark: "（沒有備註）",
    pinWorkflow: "釘到 Workflow",
    remark: "備註",
    remarkPh: "這版主要改動",
    saveDraft: "保存草稿",
    publish: "發布並回歸",
    runAll: "全部跑",
    runFail: "跑未通過",
    runUnscored: "跑未回歸",
    runSelected: "跑已選",
    keyKept: "Key · 已留在評測系統",
    keyPh: "已保存，留空則不更改",
    updateKey: "更新 key",
    enterKey: "輸入 key",
    nickname: "暱稱",
    url: "URL",
    modelId: "模型",
    saveTarget: "保存",
    targetAdded: "已新增 API Target。",
    targetNeed: "請填 URL、模型和 key。",
    deleteTarget: "刪除",
    noTarget: "沒有已連接的 API Target",
    targetSaved: "API Target 已保存",
    targetDeleted: "API Target 已刪除",
    setDefault: "設為預設",
    cursorAnalysis: "Cursor 分析",
    resizePanes: "調整草稿與分析高度",
    reviewing: "正在把 reasoning 交給 Cursor 分析",
    working: "正在處理",
    signIn: "登錄",
    signOut: "登出",
    loginEmail: "公司郵箱",
    loginEmailPh: "name@easyview.com.hk",
    sendOtp: "發送驗證碼",
    otpCode: "驗證碼",
    otpPh: "6 位驗證碼",
    activity: "紀錄",
    activityMore: "more",
    log_prompt_publish: "發布了 #{detail}",
    log_prompt_draft: "保存了草稿",
    log_prompt_remark: "改了版本備註",
    log_upload: "上傳了 {detail}",
    log_case: "更新了 {detail}",
    log_delete: "刪除了 {detail}",
    log_run: "跑了 {detail}",
    result: "結果",
    unselected: "未選擇",
    targetsFound: "從 Postman 識別到 {n} 個 API Target。key 存在評測系統裡。",
    ranBack: "已跑回 {product}。",
    checking: "正在檢查 API Target",
    linkOpen: "鏈路暢通。",
    healthNone: "還沒有 API Target。",
    healthNoKey: "{name} 還沒有 key。",
    healthUnreachable: "連不到 {name}。",
    healthRejected: "{name} 拒絕了這個 key。",
    healthHttp: "{name} 回應 HTTP {status}。",
    healthDown: "評測系統的健康檢查沒有回應。",
    all: "全部",
    failCount: "未通過 {n}",
    passCount: "通過 {n}",
    unscoredCount: "未回歸 {n}",
    suiteTest: "資料集 {n}",
    selectAll: "全選",
    filterExpect: "篩選期望",
    addExpect: "加入期望",
    clearExpect: "清除選擇",
    searchExpect: "搜尋",
    filterNone: "沒有相符",
    suitePending: "待確認 {n}",
    pageSummary: "共 {n} 筆，每頁 50。",
    colName: "檔名",
    colExpect: "期望",
    colModel: "模型",
    colScore: "回歸",
    emptyPage: "這一頁沒有 Case。",
    prev: "上一頁",
    next: "下一頁",
    pending: "待確認",
    unscored: "未回歸",
    pass: "通過",
    fail: "未通過",
    sourceFile: "原檔",
    untitled: "未命名",
    collapse: "收起",
    openResult: "結果",
    rerun: "再跑",
    edit: "編輯",
    delete: "刪除",
    noOutput: "（沒有 Output）",
    none: "（無）",
    noReasoning: "（這次沒有 Reasoning）",
    detailLine: "期望 {expect} · 模型 {model}",
    expectResult: "期望結果 {value}",
    output: "Output",
    reasoning: "Reasoning",
    chooseProduct: "選擇期望的產品",
    confirmAdd: "確認並加入測試集",
    noSaved: "草稿還沒保存，也沒有已發布版本。",
    regressing: "正在回歸，等模型回覆",
    draftFallback: "草稿未保存，已改跑 v{n}。",
    runDone: "跑完 {scope}，{total} 筆，未通過 {fail} 筆",
    scopeAll: "全部",
    scopeFail: "未通過",
    scopeUnscored: "未回歸",
    scopeSelected: "已選",
    keySaved: "key 已留在評測系統",
    keyUnchanged: "未輸入新 key，評測系統裡的 key 保持不變",
    defaultChanged: "已改預設 API Target。已釘選的 Workflow 不會跟著改。",
    remarkSaved: "備註已保存",
    draftSaved: "草稿已保存",
    publishing: "正在發布並回歸，等模型回覆",
    published: "已發布 v{n}，回歸 {total} 筆，未通過 {fail} 筆",
    publishedEmpty: "已發布 v{n}。沒有已標籤 Case，所以沒有回歸。",
    pinnedVersion: "Workflow 已改釘這個版本",
    sending: "正在送出，等模型回覆",
    pickFirst: "先選期望的產品",
    addedSuite: "已加入測試集，期望結果是 {label}",
    needText: "先輸入文字，或上傳 PDF / DOCX。",
    manual: "手動輸入",
    addedExpect: "已加入測試集，期望 {label}。",
    savedUnlabeled: "Case 已保存，尚未標籤。",
    deleted: "Case 已刪除",
    confirmBatchTitle: "確認這批產品",
    confirmBatchBody: "這 {n} 份都會標成 {label}，並直接加入測試集。請確認它們都屬於這個產品。",
    confirmBatchYes: "確認，全部歸屬 {label}",
    cancel: "取消",
    pdfOnly: "只接受 PDF 或 DOCX。",
    uploadCancelled: "已取消這批上傳，沒有加入 Case。",
    extracting: "正在抽出 {name}，期望 {label}，寫進 Postman 並送出…",
    extractingPlain: "正在抽出 {name}，寫進 Postman 並送出…",
    fileFailed: "這份檔沒有跑成",
    requestFailed: "請求失敗",
    updatedExpect: "{name} 已更新，期望 {label}。",
    addedFile: "{name} 已加入測試集，期望 {label}。",
    replacedRerun: "{name} 與已有 Case 同名，已更新原文並重跑。",
    replacedConfirm: "{name} 與已有 Case 同名，已更新原文。請確認期望結果。",
    ranConfirm: "{name} 已跑完。請確認期望結果，確認後會進入測試集。",
    skipped: " 已略過 {n} 個非 PDF / DOCX。",
  },
  hans: {
    langLabel: "语言",
    drop: "拖曳或上传 PDF / DOCX",
    title: "标题",
    paste: "或直接贴文字",
    input: "条款",
    noLabel: "不上标签，上传后再确认",
    updateCase: "更新 Case",
    addCase: "加入 Case",
    cancelEdit: "取消编辑",
    apiTarget: "API Target",
    addTarget: "新增 API Target",
    resync: "重新识别 Postman",
    noKeyed: "没有已留下 key 的 API Target。",
    searchVersions: "搜索版本",
    draft: "草稿",
    unpublished: "尚未发布",
    emptyDraft: "空白草稿",
    latest: "最新",
    pinned: "钉选",
    noRemark: "（没有备注）",
    pinWorkflow: "钉到 Workflow",
    remark: "备注",
    remarkPh: "这版主要改动",
    saveDraft: "保存草稿",
    publish: "发布并回归",
    runAll: "全部跑",
    runFail: "跑未通过",
    runUnscored: "跑未回归",
    runSelected: "跑已选",
    keyKept: "Key · 已留在评测系统",
    keyPh: "已保存，留空则不更改",
    updateKey: "更新 key",
    enterKey: "输入 key",
    nickname: "昵称",
    url: "URL",
    modelId: "模型",
    saveTarget: "保存",
    targetAdded: "已新增 API Target。",
    targetNeed: "请填 URL、模型和 key。",
    deleteTarget: "删除",
    noTarget: "没有已连接的 API Target",
    targetSaved: "API Target 已保存",
    targetDeleted: "API Target 已删除",
    setDefault: "设为预设",
    cursorAnalysis: "Cursor 分析",
    resizePanes: "调整草稿与分析高度",
    reviewing: "正在把 reasoning 交给 Cursor 分析",
    working: "正在处理",
    signIn: "登录",
    signOut: "登出",
    loginEmail: "公司邮箱",
    loginEmailPh: "name@easyview.com.hk",
    sendOtp: "发送验证码",
    otpCode: "验证码",
    otpPh: "6 位验证码",
    activity: "记录",
    activityMore: "more",
    log_prompt_publish: "发布了 #{detail}",
    log_prompt_draft: "保存了草稿",
    log_prompt_remark: "改了版本备注",
    log_upload: "上传了 {detail}",
    log_case: "更新了 {detail}",
    log_delete: "删除了 {detail}",
    log_run: "跑了 {detail}",
    result: "结果",
    unselected: "未选择",
    targetsFound: "从 Postman 识别到 {n} 个 API Target。key 存在评测系统里。",
    ranBack: "已跑回 {product}。",
    checking: "正在检查 API Target",
    linkOpen: "链路畅通。",
    healthNone: "还没有 API Target。",
    healthNoKey: "{name} 还没有 key。",
    healthUnreachable: "连不到 {name}。",
    healthRejected: "{name} 拒绝了这个 key。",
    healthHttp: "{name} 回应 HTTP {status}。",
    healthDown: "评测系统的健康检查没有回应。",
    all: "全部",
    failCount: "未通过 {n}",
    passCount: "通过 {n}",
    unscoredCount: "未回归 {n}",
    suiteTest: "数据集 {n}",
    selectAll: "全选",
    filterExpect: "筛选期望",
    addExpect: "加入期望",
    clearExpect: "清除选择",
    searchExpect: "搜索",
    filterNone: "没有相符",
    suitePending: "待确认 {n}",
    pageSummary: "共 {n} 笔，每页 50。",
    colName: "文件名",
    colExpect: "期望",
    colModel: "模型",
    colScore: "回归",
    emptyPage: "这一页没有 Case。",
    prev: "上一页",
    next: "下一页",
    pending: "待确认",
    unscored: "未回归",
    pass: "通过",
    fail: "未通过",
    sourceFile: "原档",
    untitled: "未命名",
    collapse: "收起",
    openResult: "结果",
    rerun: "再跑",
    edit: "编辑",
    delete: "删除",
    noOutput: "（没有 Output）",
    none: "（无）",
    noReasoning: "（这次没有 Reasoning）",
    detailLine: "期望 {expect} · 模型 {model}",
    expectResult: "期望结果 {value}",
    output: "Output",
    reasoning: "Reasoning",
    chooseProduct: "选择期望的产品",
    confirmAdd: "确认并加入测试集",
    noSaved: "草稿还没保存，也没有已发布版本。",
    regressing: "正在回归，等模型回复",
    draftFallback: "草稿未保存，已改跑 v{n}。",
    runDone: "跑完 {scope}，{total} 笔，未通过 {fail} 笔",
    scopeAll: "全部",
    scopeFail: "未通过",
    scopeUnscored: "未回归",
    scopeSelected: "已选",
    keySaved: "key 已留在评测系统",
    keyUnchanged: "未输入新 key，评测系统里的 key 保持不变",
    defaultChanged: "已改预设 API Target。已钉选的 Workflow 不会跟着改。",
    remarkSaved: "备注已保存",
    draftSaved: "草稿已保存",
    publishing: "正在发布并回归，等模型回复",
    published: "已发布 v{n}，回归 {total} 笔，未通过 {fail} 笔",
    publishedEmpty: "已发布 v{n}。没有已标签 Case，所以没有回归。",
    pinnedVersion: "Workflow 已改钉这个版本",
    sending: "正在送出，等模型回复",
    pickFirst: "先选期望的产品",
    addedSuite: "已加入测试集，期望结果是 {label}",
    needText: "先输入文字，或上传 PDF / DOCX。",
    manual: "手动输入",
    addedExpect: "已加入测试集，期望 {label}。",
    savedUnlabeled: "Case 已保存，尚未标签。",
    deleted: "Case 已删除",
    confirmBatchTitle: "确认这批产品",
    confirmBatchBody: "这 {n} 份都会标成 {label}，并直接加入测试集。请确认它们都属于这个产品。",
    confirmBatchYes: "确认，全部归属 {label}",
    cancel: "取消",
    pdfOnly: "只接受 PDF 或 DOCX。",
    uploadCancelled: "已取消这批上传，没有加入 Case。",
    extracting: "正在抽出 {name}，期望 {label}，写进 Postman 并送出…",
    extractingPlain: "正在抽出 {name}，写进 Postman 并送出…",
    fileFailed: "这份文件没有跑成",
    requestFailed: "请求失败",
    updatedExpect: "{name} 已更新，期望 {label}。",
    addedFile: "{name} 已加入测试集，期望 {label}。",
    replacedRerun: "{name} 与已有 Case 同名，已更新原文并重跑。",
    replacedConfirm: "{name} 与已有 Case 同名，已更新原文。请确认期望结果。",
    ranConfirm: "{name} 已跑完。请确认期望结果，确认后会进入测试集。",
    skipped: " 已略过 {n} 个非 PDF / DOCX。",
  },
  en: {
    langLabel: "Language",
    drop: "Drop or upload PDF / DOCX",
    title: "Title",
    paste: "Or paste text",
    input: "Clauses",
    noLabel: "No label yet; confirm after upload",
    updateCase: "Update case",
    addCase: "Add case",
    cancelEdit: "Cancel edit",
    apiTarget: "API Target",
    addTarget: "Add API Target",
    resync: "Identify Postman again",
    noKeyed: "No API target has a saved key.",
    searchVersions: "Search versions",
    draft: "Draft",
    unpublished: "Not published",
    emptyDraft: "Empty draft",
    latest: "Latest",
    pinned: "Pinned",
    noRemark: "(no note)",
    pinWorkflow: "Pin to workflow",
    remark: "Note",
    remarkPh: "What changed in this version",
    saveDraft: "Save draft",
    publish: "Publish and regress",
    runAll: "Run all",
    runFail: "Run fail",
    runUnscored: "Run not regressed",
    runSelected: "Run selected",
    keyKept: "Key · saved in the desk",
    keyPh: "Saved. Leave blank to keep it",
    updateKey: "Update key",
    enterKey: "Enter key",
    nickname: "Nickname",
    url: "URL",
    modelId: "Model",
    saveTarget: "Save",
    targetAdded: "Added the API target.",
    targetNeed: "Enter a URL, a model, and a key.",
    deleteTarget: "Delete",
    noTarget: "No connected API target",
    targetSaved: "API Target saved",
    targetDeleted: "API Target deleted",
    setDefault: "Set as default",
    cursorAnalysis: "Cursor analysis",
    resizePanes: "Resize draft and analysis",
    reviewing: "Sending the reasoning to Cursor",
    working: "Working",
    signIn: "Sign in",
    signOut: "Sign out",
    loginEmail: "Work email",
    loginEmailPh: "name@easyview.com.hk",
    sendOtp: "Send Code",
    otpCode: "Code",
    otpPh: "6-digit code",
    activity: "Activity",
    activityMore: "more",
    log_prompt_publish: "Published #{detail}",
    log_prompt_draft: "Saved the draft",
    log_prompt_remark: "Edited the version note",
    log_upload: "Uploaded {detail}",
    log_case: "Updated {detail}",
    log_delete: "Deleted {detail}",
    log_run: "Ran {detail}",
    result: "Result",
    unselected: "Not selected",
    targetsFound: "Identified {n} API target(s) from Postman. The key is stored in the desk.",
    ranBack: "Ran {product}. ",
    checking: "Checking the API target",
    linkOpen: "Link is open. ",
    healthNone: "No API target yet.",
    healthNoKey: "{name} has no key.",
    healthUnreachable: "{name} did not respond.",
    healthRejected: "{name} rejected the key.",
    healthHttp: "{name} returned HTTP {status}.",
    healthDown: "The desk health check did not respond.",
    all: "All",
    failCount: "Fail {n}",
    passCount: "Pass {n}",
    unscoredCount: "Not regressed {n}",
    suiteTest: "Dataset {n}",
    selectAll: "Select all",
    filterExpect: "Filter expectation",
    addExpect: "Add expectation",
    clearExpect: "Clear selection",
    searchExpect: "Search",
    filterNone: "No match",
    suitePending: "To confirm {n}",
    pageSummary: "{n} cases, 50 per page.",
    colName: "File name",
    colExpect: "Expectation",
    colModel: "Model",
    colScore: "Regression",
    emptyPage: "No cases on this page.",
    prev: "Previous",
    next: "Next",
    pending: "To confirm",
    unscored: "Not regressed",
    pass: "Pass",
    fail: "Fail",
    sourceFile: "Source",
    untitled: "Untitled",
    collapse: "Hide",
    openResult: "Result",
    rerun: "Run again",
    edit: "Edit",
    delete: "Delete",
    noOutput: "(no output)",
    none: "(none)",
    noReasoning: "(no reasoning this time)",
    detailLine: "Expected {expect} · Model {model}",
    expectResult: "Expected {value}",
    output: "Output",
    reasoning: "Reasoning",
    chooseProduct: "Choose the expected product",
    confirmAdd: "Confirm and add to the test set",
    noSaved: "The draft is unsaved, and there is no published version.",
    regressing: "Regressing, waiting for the model",
    draftFallback: "Draft was unsaved, so this ran v{n}. ",
    runDone: "Ran {scope}: {total} cases, {fail} fail",
    scopeAll: "all",
    scopeFail: "fail",
    scopeUnscored: "not regressed",
    scopeSelected: "selected",
    keySaved: "Key saved in the desk",
    keyUnchanged: "No new key entered. The saved key stays.",
    defaultChanged: "Default API target updated. A pinned workflow stays where it is.",
    remarkSaved: "Note saved",
    draftSaved: "Draft saved",
    publishing: "Publishing and regressing, waiting for the model",
    published: "Published v{n}. Regressed {total}, {fail} fail",
    publishedEmpty: "Published v{n}. No labeled cases, so nothing was regressed.",
    pinnedVersion: "Workflow now pins this version",
    sending: "Sending, waiting for the model",
    pickFirst: "Choose the expected product first",
    addedSuite: "Added to the test set. Expected result is {label}",
    needText: "Enter text, or upload a PDF / DOCX.",
    manual: "Typed in",
    addedExpect: "Added to the test set. Expected {label}.",
    savedUnlabeled: "Case saved, still unlabeled.",
    deleted: "Case deleted",
    confirmBatchTitle: "Confirm this batch",
    confirmBatchBody: "All {n} files will be labeled {label} and added to the test set. Confirm they all belong to this product.",
    confirmBatchYes: "Confirm, all are {label}",
    cancel: "Cancel",
    pdfOnly: "Only PDF or DOCX is accepted.",
    uploadCancelled: "Upload cancelled. No case was added.",
    extracting: "Extracting {name}, expected {label}, writing into Postman and sending…",
    extractingPlain: "Extracting {name}, writing into Postman and sending…",
    fileFailed: "This file did not run",
    requestFailed: "Request failed",
    updatedExpect: "{name} updated. Expected {label}.",
    addedFile: "{name} added to the test set. Expected {label}.",
    replacedRerun: "{name} matched an existing case. The text was updated and ran again.",
    replacedConfirm: "{name} matched an existing case. The text was updated. Confirm the expected result.",
    ranConfirm: "{name} ran. Confirm the expected result to add it to the test set.",
    skipped: " Skipped {n} file(s) that were not PDF / DOCX.",
  },
};

function t(key, vars) {
  const table = COPY[lang] || COPY.hant;
  let text = table[key] ?? COPY.hant[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value ?? ""));
    }
  }
  return text;
}

function applyLang() {
  document.documentElement.lang = lang === "en" ? "en" : lang === "hans" ? "zh-Hans" : "zh-Hant";
}

function langSwitch() {
  const options = [
    ["hant", "繁"],
    ["hans", "简"],
    ["en", "EN"],
  ];
  return `
    <div class="lang-switch" role="group" aria-label="${esc(t("langLabel"))}">
      ${options.map(([id, label]) => `
        <button type="button" data-lang="${id}" aria-pressed="${lang === id}">${label}</button>
      `).join("")}
    </div>
  `;
}

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
  const response = await fetch("/api/state");
  if (response.status === 401) {
    sessionUser = null;
    renderLogin();
    return;
  }
  state = await response.json();
  status = "";
  const newest = prompt().runs[0];
  if (!lastRun) lastRun = newest || null;
  else if (newest && newest.id > lastRun.id) lastRun = newest;
  if (lastRun && lastRun.id && lastRun.output_text == null && !lastRun.product) {
    const detail = await fetch(`/api/runs/${lastRun.id}`);
    if (detail.ok) lastRun = await detail.json();
  }
  noteLane(lastRun);
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
  for (const value of table.expectFilter) params.append("expectation", value);
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
  return state.targets.find((target) => target.id === id)?.name || t("unselected");
}

function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 16).replace("T", " ");
  const locale = lang === "en" ? "en" : lang === "hans" ? "zh-Hans" : "zh-Hant";
  return date.toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function versionWhen(version) {
  const when = formatWhen(version.created_at);
  return version.author_name ? `${when} by ${version.author_name}` : when;
}

function activityLine(item) {
  const when = formatWhen(item.created_at);
  const text = t(`log_${item.kind}`, { detail: item.detail || "" }).trim();
  return item.actor ? `${when} ${text} by ${item.actor}` : `${when} ${text}`;
}

function activityHtml() {
  const items = (state && state.activity) || [];
  const shown = items.slice(0, 3);
  if (!shown.length) return "";
  const more = items.length > shown.length
    ? `<button type="button" class="activity-more" id="activity-more">${esc(t("activityMore"))}</button>`
    : "";
  return `
    <div class="activity" aria-label="${esc(t("activity"))}">
      ${shown.map((item, index) => `<p>${esc(activityLine(item))}${index === shown.length - 1 ? more : ""}</p>`).join("")}
    </div>
  `;
}

function openActivityLog() {
  const items = (state && state.activity) || [];
  const dialog = document.createElement("dialog");
  dialog.className = "activity-log";
  dialog.innerHTML = items.map((item) => `<p>${esc(activityLine(item))}</p>`).join("");
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.appendChild(dialog);
  dialog.showModal();
}

function renderLogin() {
  applyLang();
  app.innerHTML = `
    <div class="page-tools">${langSwitch()}</div>
    <form class="login-card" id="login-form">
      <h2>${esc(t("signIn"))}</h2>
      <label for="login-email">${esc(t("loginEmail"))}</label>
      <input id="login-email" type="email" autocomplete="username" placeholder="${esc(t("loginEmailPh"))}" value="${esc(loginEmail)}" />
      <label for="login-code">${esc(t("otpCode"))}</label>
      <input id="login-code" inputmode="numeric" autocomplete="one-time-code" placeholder="${esc(t("otpPh"))}" value="${esc(loginCode)}" />
      ${loginNotice ? `<p class="note">${esc(loginNotice)}</p>` : ""}
      ${loginError ? `<p class="row-error">${esc(loginError)}</p>` : ""}
      <div class="row">
        <button type="button" id="send-code">${esc(t("sendOtp"))}</button>
        <button type="submit" class="primary">${esc(t("signIn"))}</button>
      </div>
    </form>
  `;
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.onclick = () => {
      keepLoginFields();
      lang = button.dataset.lang;
      localStorage.setItem("phoenix-lang", lang);
      renderLogin();
    };
  });
  document.querySelector("#send-code").onclick = () => sendLoginCode();
  document.querySelector("#login-form").onsubmit = async (event) => {
    event.preventDefault();
    keepLoginFields();
    loginError = "";
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail, code: loginCode }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      loginError = payload.detail || t("requestFailed");
      renderLogin();
      return;
    }
    sessionUser = payload;
    loginCode = "";
    loginNotice = "";
    loginError = "";
    await load();
    refreshHealth();
  };
}

function keepLoginFields() {
  const email = document.querySelector("#login-email");
  const code = document.querySelector("#login-code");
  if (email) loginEmail = email.value.trim();
  if (code) loginCode = code.value.trim();
}

function systemLocale() {
  return (navigator.languages && navigator.languages[0]) || navigator.language || "en";
}

async function sendLoginCode() {
  keepLoginFields();
  loginError = "";
  const response = await fetch("/api/auth/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: loginEmail, locale: systemLocale() }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) loginError = payload.detail || t("requestFailed");
  renderLogin();
}

function excerpt(text) {
  const line = String(text || "").replace(/\s+/g, " ").trim();
  if (!line) return "";
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

function captureEditor() {
  const draftEl = document.querySelector("#draft");
  if (draftEl) draftBuffer = draftEl.value;
  const remarkEl = document.querySelector("#version-remark");
  if (remarkEl && renderedView.mode === "draft") draftRemark = remarkEl.value;
  if (remarkEl && renderedView.mode === "version" && renderedView.versionId) {
    versionRemarkEdits[renderedView.versionId] = remarkEl.value;
  }
  const target = document.querySelector("#try-target");
  if (target) selectedTargetId = Number(target.value);
  const search = document.querySelector("#version-search");
  if (search) versionQuery = search.value;
  focusSearch = search != null && document.activeElement === search;
  const expectSearch = document.querySelector("#expect-search");
  if (expectSearch) table.expectQuery = expectSearch.value;
  expectFocus = expectSearch != null && document.activeElement === expectSearch;
  const batch = document.querySelector("#batch-expectation");
  if (batch) batchExpectation = batch.value;
  const scroll = document.querySelector(".version-scroll");
  if (scroll) versionScrollTop = scroll.scrollTop;
}

function visibleVersions(current) {
  const query = versionQuery.trim().toLowerCase();
  if (!query) return current.versions;
  return current.versions.filter((version) => (
    `v${version.number} #${version.number} ${version.remark} ${version.body}`.toLowerCase().includes(query)
  ));
}

async function send(url, options) {
  busy = true;
  laneError = "";
  status = options.status || t("working");
  render();
  const response = await fetch(url, {
    method: options.method,
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  busy = false;
  status = "";
  if (response.status === 401) {
    sessionUser = null;
    renderLogin();
    return null;
  }
  if (!response.ok) {
    laneError = payload.detail || t("requestFailed");
    render();
    return null;
  }
  if (payload.state) state = payload.state;
  else state = payload;
  if (payload.run) lastRun = payload.run;
  await loadTable();
  if (payload.runs && payload.runs.length) lastRun = payload.runs[payload.runs.length - 1];
  noteLane(lastRun);
  return payload;
}

function render() {
  captureEditor();
  const current = prompt();
  const workflow = current.workflow;
  const viewing = view.mode === "version"
    ? current.versions.find((item) => item.id === view.versionId)
    : null;
  const draftText = draftBuffer === null ? current.draft : draftBuffer;
  applyLang();
  app.innerHTML = `
    <div class="page-tools">
      ${sessionUser ? `<span class="who">${esc(sessionUser.name)}</span><button type="button" id="logout">${esc(t("signOut"))}</button>` : ""}
      ${langSwitch()}
    </div>
    <section class="sheet intake-bar case-pane">
      <form id="case-form" class="intake-row">
        <label class="dropzone" id="dropzone">
          <strong>${esc(t("drop"))}</strong>
          <input id="case-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple />
        </label>
        <input name="title" value="${esc(caseDraft.title)}" placeholder="${esc(t("title"))}" aria-label="${esc(t("title"))}" />
        <textarea id="case-input" name="input_text" rows="1" placeholder="${esc(t("paste"))}" aria-label="${esc(t("input"))}">${esc(caseDraft.input_text)}</textarea>
        <select id="batch-expectation" aria-label="${esc(t("colExpect"))}">
          <option value="">${esc(t("noLabel"))}</option>
          ${current.expectation_options.map((label) => `
            <option value="${esc(label)}" ${batchExpectation === label ? "selected" : ""}>${esc(label)}</option>
          `).join("")}
        </select>
        <button type="submit" class="primary" ${busy ? "disabled" : ""}>${caseDraft.case_id ? esc(t("updateCase")) : esc(t("addCase"))}</button>
        ${caseDraft.case_id ? `<button type="button" id="clear-case">${esc(t("cancelEdit"))}</button>` : ""}
      </form>
    </section>
    ${healthLineHtml()}
    ${status && !busy ? `<p class="status">${esc(status)}</p>` : ""}
    ${renderRun()}
    <section class="sheet manuscript">
      ${renderVersions(current, workflow, viewing, draftText)}
    </section>
    <section class="sheet suite">
      ${renderTable()}
    </section>
    ${activityHtml()}
  `;
  bind();
  renderedView = { mode: view.mode, versionId: view.versionId };
  const scroll = document.querySelector(".version-scroll");
  if (scroll) scroll.scrollTop = versionScrollTop;
  if (focusSearch) {
    const search = document.querySelector("#version-search");
    search.focus();
    const end = search.value.length;
    search.setSelectionRange(end, end);
  }
  if (expectFocus) {
    const search = document.querySelector("#expect-search");
    if (search) {
      search.focus();
      const end = search.value.length;
      search.setSelectionRange(end, end);
    }
  }
  placeExpectMenu();
  placeLabelMenu();
}

function renderVersions(current, workflow, viewing, draftText) {
  const newestId = current.versions[0]?.id;
  const targets = connectedTargets();
  const targetId = chosenTargetId(current);
  const remark = viewing
    ? (versionRemarkEdits[viewing.id] ?? viewing.remark ?? "")
    : draftRemark;
  return `
    <div class="version-toolbar">
      <h2>${esc(current.name)}</h2>
    </div>
    <div class="version-layout">
      <aside>
        <div class="version-search">
          <input id="version-search" placeholder="${esc(t("searchVersions"))}" value="${esc(versionQuery)}" />
        </div>
        <div class="version-scroll">
          <button type="button" class="version-item" data-view="draft" aria-pressed="${view.mode === "draft"}">
            <span class="ver-no">${esc(t("draft"))}</span>
            <span class="ver-remark">${esc(draftRemark || t("unpublished"))}</span>
            <span class="ver-preview">${esc(excerpt(draftText) || t("emptyDraft"))}</span>
          </button>
          ${visibleVersions(current).map((version) => `
            <button type="button" class="version-item" data-view="version" data-version="${version.id}" aria-pressed="${view.versionId === version.id}">
              <span class="ver-no">
                #${version.number}
                ${version.id === newestId ? `<span class="stamp">${esc(t("latest"))}</span>` : ""}
                ${workflow.pinned_version_id === version.id ? `<span class="stamp">${esc(t("pinned"))}</span>` : ""}
              </span>
              <span class="ver-remark">${esc(version.remark || t("noRemark"))}</span>
              <span class="ver-preview">${esc(excerpt(version.body))}</span>
              <span class="ver-meta">${esc(versionWhen(version))}</span>
            </button>
          `).join("")}
        </div>
      </aside>
      <div class="version-body">
        <div class="version-head">
          <h2>${viewing ? `#${viewing.number}` : esc(t("draft"))}</h2>
          <div class="row">
            ${viewing ? `<p class="note">${esc(versionWhen(viewing))}</p>` : ""}
            ${viewing ? `<button type="button" id="pin-version" ${busy ? "disabled" : ""}>${esc(t("pinWorkflow"))}</button>` : ""}
          </div>
        </div>
        <input id="version-remark" value="${esc(remark)}" placeholder="${esc(t("remarkPh"))}" aria-label="${esc(t("remark"))}" />
        <div class="split-stack" style="--draft-grow:${cursorSplit()}fr;--review-grow:${100 - cursorSplit()}fr">
          <div class="split-draft">
            ${viewing ? `<div class="readonly">${esc(viewing.body)}</div>` : `<textarea id="draft">${esc(draftText)}</textarea>`}
          </div>
          ${reviewSplit(current)}
        </div>
        <div class="row version-actions">
          <button type="button" id="save-draft" ${!viewing && !busy ? "" : "disabled"}>${esc(t("saveDraft"))}</button>
          <button type="button" class="primary" id="publish" ${!viewing && !busy ? "" : "disabled"}>${esc(t("publish"))}</button>
          <button type="button" data-scope="all" ${busy ? "disabled" : ""}>${esc(t("runAll"))}</button>
          <button type="button" data-scope="fail" ${busy ? "disabled" : ""}>${esc(t("runFail"))}</button>
          <button type="button" data-scope="unscored" ${busy ? "disabled" : ""}>${esc(t("runUnscored"))}</button>
          <button type="button" id="run-selected" ${busy || !picked.size ? "disabled" : ""}>${esc(t("runSelected"))}</button>
          ${targetPicker(targets, targetId)}
        </div>
      </div>
    </div>
  `;
}

function connectedTargets() {
  return (state && state.targets) || [];
}

function chosenTargetId(current) {
  const targets = connectedTargets();
  const preferred = selectedTargetId || current.default_target_id;
  if (targets.some((target) => target.id === preferred)) return preferred;
  return (targets.find((target) => target.is_default) || targets[0] || {}).id || "";
}

function targetPicker(targets, targetId) {
  const current = targets.find((target) => target.id === targetId);
  return `
    <div class="target-picker">
      <button type="button" class="target-picker-btn" aria-haspopup="listbox" aria-expanded="${targetMenuOpen ? "true" : "false"}">
        <span>${esc(current ? current.name : t("noTarget"))}</span>
      </button>
      <div class="target-menu" role="listbox" ${targetMenuOpen ? "" : "hidden"}>
        ${targets.map((target) => `
          <button type="button" class="target-option" role="option" data-target-pick="${target.id}" aria-selected="${target.id === targetId}">${esc(target.name)}</button>
        `).join("")}
        <button type="button" class="target-option target-add" id="add-target">${esc(t("addTarget"))}</button>
      </div>
      <input type="hidden" id="try-target" value="${targetId}">
    </div>
    ${targetEditorHtml(targets)}
  `;
}

function addTargetHtml() {
  return `
    <dialog class="target-editor" id="target-editor">
      <form>
        <h2>${esc(t("addTarget"))}</h2>
        <label for="target-name">${esc(t("nickname"))}</label>
        <input id="target-name" name="name" value="" />
        <label for="target-url">${esc(t("url"))}</label>
        <input id="target-url" name="base_url" value="" placeholder="https://" />
        <label for="target-model">${esc(t("modelId"))}</label>
        <input id="target-model" name="model" value="" />
        <label for="target-key">${esc(t("enterKey"))}</label>
        <input id="target-key" name="api_key" type="password" autocomplete="off" />
        <p class="row-error" id="target-form-error" hidden></p>
        <div class="row">
          <button type="submit" class="primary">${esc(t("saveTarget"))}</button>
        </div>
      </form>
    </dialog>
  `;
}

function targetEditorHtml(targets) {
  if (addingTarget) return addTargetHtml();
  const target = targets.find((item) => item.id === targetEditorId);
  if (!target) return "";
  const keyLabel = target.has_key ? t("updateKey") : t("enterKey");
  return `
    <dialog class="target-editor" id="target-editor">
      <form>
        <h2>${esc(t("apiTarget"))}</h2>
        <label for="target-name">${esc(t("nickname"))}</label>
        <input id="target-name" name="name" value="${esc(target.name)}" />
        <label for="target-url">${esc(t("url"))}</label>
        <input id="target-url" name="base_url" value="${esc(target.base_url)}" />
        <label for="target-key">${esc(keyLabel)}</label>
        <input id="target-key" name="api_key" type="password" placeholder="${esc(target.has_key ? t("keyPh") : "")}" autocomplete="off" />
        <div class="row">
          <button type="submit" class="primary">${esc(t("saveTarget"))}</button>
          <button type="button" data-delete-target>${esc(t("deleteTarget"))}</button>
        </div>
      </form>
    </dialog>
  `;
}

function closeTargetMenu() {
  clearTimeout(targetCloseTimer);
  targetMenuOpen = false;
  const menu = document.querySelector(".target-menu");
  const button = document.querySelector(".target-picker-btn");
  if (menu) menu.hidden = true;
  if (button) button.setAttribute("aria-expanded", "false");
}

function placeTargetMenu() {
  const button = document.querySelector(".target-picker-btn");
  const menu = document.querySelector(".target-menu");
  if (!button || !menu || menu.hidden) return;
  const rect = button.getBoundingClientRect();
  menu.style.left = `${rect.left}px`;
  menu.style.width = `${rect.width}px`;
  const below = window.innerHeight - rect.bottom;
  const height = menu.offsetHeight;
  if (below < height + 8 && rect.top > height + 8) menu.style.top = `${rect.top - height - 4}px`;
  else menu.style.top = `${rect.bottom + 4}px`;
}

function bindTargetPicker() {
  if (!targetOutsideBound) {
    targetOutsideBound = true;
    document.addEventListener("mousedown", (event) => {
      if (!targetMenuOpen) return;
      const picker = document.querySelector(".target-picker");
      if (picker && picker.contains(event.target)) return;
      closeTargetMenu();
    });
    window.addEventListener("resize", () => {
      if (targetMenuOpen) placeTargetMenu();
    });
    document.addEventListener("scroll", () => {
      if (targetMenuOpen) placeTargetMenu();
    }, true);
  }
  const picker = document.querySelector(".target-picker");
  const button = document.querySelector(".target-picker-btn");
  const menu = document.querySelector(".target-menu");
  if (picker && button && menu) {
    button.onclick = () => {
      clearTimeout(targetCloseTimer);
      targetMenuOpen = !targetMenuOpen;
      menu.hidden = !targetMenuOpen;
      button.setAttribute("aria-expanded", targetMenuOpen ? "true" : "false");
      if (targetMenuOpen) placeTargetMenu();
    };
    menu.querySelectorAll("[data-target-pick]").forEach((option) => {
      option.onclick = (event) => {
        const id = Number(option.dataset.targetPick);
        selectedTargetId = id;
        const hidden = document.querySelector("#try-target");
        if (hidden) hidden.value = String(id);
        const label = button.querySelector("span");
        if (label) label.textContent = option.textContent;
        menu.querySelectorAll("[data-target-pick]").forEach((item) => {
          item.setAttribute("aria-selected", item === option ? "true" : "false");
        });
        if (event.detail >= 2) {
          closeTargetMenu();
          targetEditorId = id;
          render();
          return;
        }
        clearTimeout(targetCloseTimer);
        targetCloseTimer = setTimeout(() => {
          closeTargetMenu();
          refreshHealth();
        }, 280);
      };
    });
    const add = document.querySelector("#add-target");
    if (add) {
      add.onclick = () => {
        closeTargetMenu();
        addingTarget = true;
        render();
      };
    }
    if (targetMenuOpen) placeTargetMenu();
  }
  const dialog = document.querySelector("#target-editor");
  if (!dialog) return;
  if (!dialog.open) dialog.showModal();
  dialog.onclick = (event) => {
    if (event.target === dialog) dialog.close();
  };
  dialog.onclose = () => {
    targetEditorId = null;
    addingTarget = false;
  };
  if (addingTarget) {
    dialog.querySelector("form").onsubmit = async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      const base = (data.base_url || "").trim();
      const key = (data.api_key || "").trim();
      const model = (data.model || "").trim();
      const error = dialog.querySelector("#target-form-error");
      if (!base.startsWith("http") || !key || !model) {
        error.hidden = false;
        error.textContent = t("targetNeed");
        return;
      }
      dialog.onclose = null;
      addingTarget = false;
      const payload = await send("/api/targets", {
        method: "POST",
        body: { name: data.name || "", base_url: base, api_key: key, model },
      });
      if (!payload) {
        addingTarget = true;
        render();
        return;
      }
      selectedTargetId = payload.id;
      status = t("targetAdded");
      render();
      refreshHealth();
    };
    return;
  }
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const id = targetEditorId;
    targetEditorId = null;
    const payload = await send(`/api/targets/${id}`, {
      method: "PUT",
      body: { name: data.name, base_url: data.base_url, api_key: data.api_key },
    });
    if (!payload) {
      targetEditorId = id;
      render();
      return;
    }
    status = data.api_key ? t("keySaved") : t("targetSaved");
    render();
    refreshHealth();
  };
  dialog.querySelector("[data-delete-target]").onclick = async () => {
    const id = targetEditorId;
    targetEditorId = null;
    const payload = await send(`/api/targets/${id}`, { method: "DELETE" });
    if (!payload) {
      targetEditorId = id;
      render();
      return;
    }
    if (selectedTargetId === id) selectedTargetId = null;
    status = t("targetDeleted");
    render();
    refreshHealth();
  };
}

function clampSplit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.min(80, Math.max(20, Math.round(n)));
}

function cursorSplit() {
  try {
    const raw = localStorage.getItem("phoenix-cursor-split");
    if (raw === null || raw === "") return 50;
    return clampSplit(raw);
  } catch {
    return 50;
  }
}

function rememberSplit(value) {
  const next = clampSplit(value);
  try { localStorage.setItem("phoenix-cursor-split", String(next)); } catch { /* keep the ratio for this view */ }
  return next;
}

function applySplit(value) {
  const stack = document.querySelector(".split-stack");
  const handle = document.querySelector(".split-handle");
  if (!stack) return;
  const next = clampSplit(value);
  stack.style.setProperty("--draft-grow", `${next}fr`);
  stack.style.setProperty("--review-grow", `${100 - next}fr`);
  if (handle) handle.setAttribute("aria-valuenow", String(next));
}

function reviewSplit(current) {
  const text = current.mismatch_review || "";
  if (!text) return "";
  const split = cursorSplit();
  return `
    <div class="split-handle" role="separator" aria-orientation="horizontal" aria-valuemin="20" aria-valuemax="80" aria-valuenow="${split}" aria-label="${esc(t("resizePanes"))}" tabindex="0"></div>
    <section class="review-pane" aria-label="${esc(t("cursorAnalysis"))}">
      <h2>${esc(t("cursorAnalysis"))}</h2>
      <pre>${esc(text)}</pre>
    </section>
  `;
}

function bindSplit() {
  const handle = document.querySelector(".split-handle");
  const stack = document.querySelector(".split-stack");
  if (!handle || !stack) return;
  const ratioFromPointer = (clientY) => {
    const rect = stack.getBoundingClientRect();
    if (!rect.height) return cursorSplit();
    return ((clientY - rect.top) / rect.height) * 100;
  };
  handle.onpointerdown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    try { handle.setPointerCapture(event.pointerId); } catch { /* drag still follows the handle */ }
    const move = (pointer) => applySplit(ratioFromPointer(pointer.clientY));
    const stop = (pointer) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      rememberSplit(ratioFromPointer(pointer.clientY));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };
  handle.onkeydown = (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const delta = event.key === "ArrowUp" ? -4 : 4;
    applySplit(rememberSplit(cursorSplit() + delta));
  };
}

function mismatchIds(runs) {
  return (runs || []).filter((run) => {
    if (!run || run.passed !== false || !run.id) return false;
    const error = run.error || "";
    return error === "" || error === "回答不是 JSON。";
  }).map((run) => run.id);
}

async function reviewFailures(runs) {
  const runIds = mismatchIds(runs);
  if (!runIds.length) return;
  await send(`/api/prompts/${prompt().id}/review`, {
    method: "POST",
    status: t("reviewing"),
    body: { run_ids: runIds },
  });
}

function cameBack(run) {
  if (!run) return false;
  if (run.output_text && String(run.output_text).trim()) return true;
  if (run.parsed && run.parsed.product) return true;
  if (run.product) return true;
  return false;
}

function resultLabel(run) {
  if (run.parsed && run.parsed.product) return String(run.parsed.product);
  if (run.product) return String(run.product);
  return t("result");
}

function noteLane(run) {
  if (!run) return;
  laneError = !cameBack(run) && run.error ? run.error : "";
}

function healthIssueText() {
  const name = health.name || "";
  const status = health.status || "";
  if (health.code === "no_target") return t("healthNone");
  if (health.code === "no_key") return t("healthNoKey", { name });
  if (health.code === "unreachable") return t("healthUnreachable", { name });
  if (health.code === "rejected") return t("healthRejected", { name });
  if (health.code === "http") return t("healthHttp", { name, status });
  const issues = (health.issues || []).filter(Boolean);
  return issues.join(" ");
}

function healthView() {
  if (busy) return { tone: "yellow", text: status || t("working") };
  if (health.ok === false) return { tone: "red", text: healthIssueText() };
  if (laneError) return { tone: "red", text: laneError };
  if (cameBack(lastRun)) return { tone: "green", text: t("ranBack", { product: resultLabel(lastRun) }) };
  if (health.ok === null) return { tone: "yellow", text: t("checking") };
  return { tone: "green", text: t("linkOpen") };
}

function healthLineHtml() {
  const current = healthView();
  return `<p class="health-line" role="status"><span class="lamp ${current.tone}" aria-hidden="true"></span><span>${esc(current.text)}</span></p>`;
}

async function refreshHealth() {
  if (busy || !sessionUser || !state) return;
  const id = chosenTargetId(prompt());
  const query = id ? `?target_id=${encodeURIComponent(id)}` : "";
  try {
    const response = await fetch(`/api/health${query}`);
    if (response.status === 401) {
      sessionUser = null;
      renderLogin();
      return;
    }
    health = await response.json();
  } catch (err) {
    health = { ok: false, issues: [t("healthDown")] };
  }
  const node = document.querySelector(".health-line");
  if (node) node.outerHTML = healthLineHtml();
}

function renderTable() {
  const counts = table.counts;
  const pages = Math.max(1, Math.ceil(table.total / 50));
  const filters = table.suite === "test" ? `
    <button type="button" data-result="all" aria-pressed="${table.result === "all"}">${esc(t("all"))}</button>
    <button type="button" data-result="fail" aria-pressed="${table.result === "fail"}">${esc(t("failCount", { n: counts.fail }))}</button>
    <button type="button" data-result="pass" aria-pressed="${table.result === "pass"}">${esc(t("passCount", { n: counts.pass }))}</button>
    <button type="button" data-result="unscored" aria-pressed="${table.result === "unscored"}">${esc(t("unscoredCount", { n: counts.unscored }))}</button>
  ` : "";
  return `
    <div class="row">
      <button type="button" data-suite="test" aria-pressed="${table.suite === "test"}">${esc(t("suiteTest", { n: counts.labeled }))}</button>
      <button type="button" data-suite="pending" aria-pressed="${table.suite === "pending"}">${esc(t("suitePending", { n: counts.pending }))}</button>
      ${filters}
    </div>
    <p class="note">${esc(t("pageSummary", { n: table.total }))}</p>
    <table class="suite-table">
      <thead>
        <tr>
          <th class="pick"><input type="checkbox" class="pick-box" id="pick-all" aria-label="${esc(t("selectAll"))}"></th>
          <th class="name">${esc(t("colName"))}</th>
          <th class="label expect-head">
            <span class="expect-label">
              ${esc(t("colExpect"))}
              <button type="button" class="icon-hit funnel ${table.expectFilter.length ? "on" : ""}" id="expect-filter" aria-label="${esc(t("filterExpect"))}" aria-expanded="${table.expectOpen ? "true" : "false"}">${lineIcon("funnel")}</button>
            </span>
            <div class="expect-menu" id="expect-menu" ${table.expectOpen ? "" : "hidden"}>
              <div class="expect-options">${expectChoices()}</div>
              <div class="expect-search-row">
                <input id="expect-search" value="${esc(table.expectQuery)}" placeholder="${esc(t("searchExpect"))}" aria-label="${esc(t("searchExpect"))}">
                <button type="button" class="icon-hit expect-clear" id="expect-clear" aria-label="${esc(t("clearExpect"))}" ${table.expectFilter.length ? "" : "disabled"}>${lineIcon("brush")}</button>
              </div>
            </div>
          </th>
          <th class="label">${esc(t("colModel"))}</th>
          <th class="verdict">${esc(t("colScore"))}</th>
          <th class="actions"></th>
        </tr>
      </thead>
      <tbody>
        ${table.rows.map(suiteRow).join("") || `<tr><td colspan="6">${esc(t("emptyPage"))}</td></tr>`}
      </tbody>
    </table>
    <div class="row">
      <button type="button" id="page-prev" ${table.page <= 1 ? "disabled" : ""}>${esc(t("prev"))}</button>
      <span class="note">${table.page} / ${pages}</span>
      <button type="button" id="page-next" ${table.page >= pages ? "disabled" : ""}>${esc(t("next"))}</button>
    </div>
  `;
}

function placeExpectMenu() {
  const button = document.querySelector("#expect-filter");
  const menu = document.querySelector("#expect-menu");
  if (!button || !menu || menu.hidden) return;
  const margin = 8;
  const gap = 4;
  const rect = button.getBoundingClientRect();
  menu.style.maxHeight = `${Math.max(0, rect.top - gap - margin)}px`;
  const width = menu.offsetWidth;
  let left = rect.left;
  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - margin - width);
  }
  menu.style.left = `${left}px`;
  const height = menu.offsetHeight;
  menu.style.top = `${Math.max(margin, rect.top - gap - height)}px`;
}

function bindPicks() {
  const ids = table.rows.map((row) => row.id);
  const all = document.querySelector("#pick-all");
  if (all) {
    const selected = ids.filter((id) => picked.has(id)).length;
    all.checked = ids.length > 0 && selected === ids.length;
    all.indeterminate = selected > 0 && selected < ids.length;
    all.onchange = () => {
      if (all.checked) ids.forEach((id) => picked.add(id));
      else ids.forEach((id) => picked.delete(id));
      render();
    };
  }
  document.querySelectorAll("[data-pick]").forEach((box) => {
    box.onchange = () => {
      const id = Number(box.dataset.pick);
      if (box.checked) picked.add(id);
      else picked.delete(id);
      render();
    };
  });
}

function bindExpectFilter() {
  if (!expectOutside) {
    expectOutside = true;
    document.addEventListener("mousedown", (event) => {
      if (!table.expectOpen) return;
      const menu = document.querySelector("#expect-menu");
      const button = document.querySelector("#expect-filter");
      if (menu && menu.contains(event.target)) return;
      if (button && button.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest("[data-add-expect], #label-menu")) return;
      table.expectOpen = false;
      render();
    });
    window.addEventListener("resize", () => {
      if (table.expectOpen) placeExpectMenu();
    });
    window.addEventListener("scroll", () => {
      if (table.expectOpen) placeExpectMenu();
    }, true);
  }
  const opener = document.querySelector("#expect-filter");
  if (opener) {
    opener.onclick = () => {
      table.expectOpen = !table.expectOpen;
      if (table.expectOpen) table.labelOpenId = null;
      render();
    };
  }
  const search = document.querySelector("#expect-search");
  if (search) {
    search.oninput = () => {
      table.expectQuery = search.value;
      render();
    };
  }
  const clear = document.querySelector("#expect-clear");
  if (clear) {
    clear.onclick = async () => {
      if (!table.expectFilter.length) return;
      table.expectFilter = [];
      table.page = 1;
      await loadTable();
      render();
    };
  }
  document.querySelectorAll("[data-expect]").forEach((button) => {
    button.onclick = async () => {
      const label = button.dataset.expect;
      table.expectFilter = table.expectFilter.includes(label)
        ? table.expectFilter.filter((item) => item !== label)
        : [...table.expectFilter, label];
      table.page = 1;
      await loadTable();
      render();
    };
  });
}

function labelMenu() {
  const options = prompt().expectation_options || [];
  const items = options.length
    ? options.map((label) => `<button type="button" data-set-expect="${esc(label)}">${esc(label)}</button>`).join("")
    : `<p class="note">${esc(t("filterNone"))}</p>`;
  return `<div class="expect-menu label-menu" id="label-menu">${items}</div>`;
}

function expectationCell(row) {
  if (row.expectation) return esc(row.expectation);
  const open = table.labelOpenId === row.id;
  return `<button type="button" class="expect-add" data-add-expect="${row.id}" aria-expanded="${open ? "true" : "false"}" aria-label="${esc(t("addExpect"))}" title="${esc(t("addExpect"))}">—</button>${open ? labelMenu() : ""}`;
}

function placeLabelMenu() {
  const button = document.querySelector(`[data-add-expect="${table.labelOpenId}"]`);
  const menu = document.querySelector("#label-menu");
  if (!button || !menu) return;
  const margin = 8;
  const gap = 4;
  const rect = button.getBoundingClientRect();
  const spaceAbove = rect.top - gap - margin;
  const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
  const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
  menu.style.maxHeight = `${Math.max(0, openUp ? spaceAbove : spaceBelow)}px`;
  const width = menu.offsetWidth;
  let left = rect.left;
  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - margin - width);
  }
  menu.style.left = `${left}px`;
  const height = menu.offsetHeight;
  menu.style.top = openUp
    ? `${Math.max(margin, rect.top - gap - height)}px`
    : `${rect.bottom + gap}px`;
}

function bindLabelMenu() {
  if (!labelOutside) {
    labelOutside = true;
    document.addEventListener("mousedown", (event) => {
      if (table.labelOpenId == null) return;
      const menu = document.querySelector("#label-menu");
      if (menu && menu.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest("[data-add-expect], #expect-filter")) return;
      table.labelOpenId = null;
      render();
    });
    window.addEventListener("resize", () => {
      if (table.labelOpenId != null) placeLabelMenu();
    });
    window.addEventListener("scroll", () => {
      if (table.labelOpenId != null) placeLabelMenu();
    }, true);
  }
  document.querySelectorAll("[data-add-expect]").forEach((button) => {
    button.onclick = () => {
      const id = Number(button.dataset.addExpect);
      table.labelOpenId = table.labelOpenId === id ? null : id;
      table.expectOpen = false;
      render();
    };
  });
  document.querySelectorAll("[data-set-expect]").forEach((button) => {
    button.onclick = async () => {
      const label = button.dataset.setExpect;
      const caseId = table.labelOpenId;
      const row = table.rows.find((item) => item.id === caseId);
      table.labelOpenId = null;
      const payload = await send(`/api/workflows/${prompt().workflow.id}/cases`, {
        method: "POST",
        body: {
          case_id: caseId,
          title: row ? row.title : null,
          expectation: label,
        },
      });
      if (!payload) return;
      await loadTable();
      if (!table.rows.length && table.page > 1) {
        table.page -= 1;
        await loadTable();
      }
      status = t("addedSuite", { label });
      render();
    };
  });
}

function verdictOf(row) {
  if (!row.expectation) return { kind: "open", label: t("pending") };
  if (row.passed === true) return { kind: "pass", label: t("pass") };
  if (row.passed === false) return { kind: "fail", label: t("fail") };
  return { kind: "open", label: t("unscored") };
}

function expectChoices() {
  const query = table.expectQuery.trim().toLowerCase();
  const options = (prompt().expectation_options || []).filter((label) => (
    !query || String(label).toLowerCase().includes(query)
  ));
  if (!options.length) return `<p class="note">${esc(t("filterNone"))}</p>`;
  return options.map((label) => `
    <button type="button" data-expect="${esc(label)}" aria-pressed="${table.expectFilter.includes(label)}">${esc(label)}</button>
  `).join("");
}

function lineIcon(name) {
  const paths = {
    file: '<path d="M7 3.5h7.2L19 8.2V20.5H7z"/><path d="M14 3.5v5h5"/>',
    funnel: '<path d="M4 5h16l-6.2 7.2V19l-3.6 2v-8.8z"/>',
    brush: '<path d="M12 2.4v5.2"/><path d="M12 7.6C9.2 7.6 7.2 9.4 6.2 11.4L4.6 20.6h14.8l-1.6-9.2C16.8 9.4 14.8 7.6 12 7.6z"/><path d="M9 13.2v5.2M12 13.2v5.2M15 13.2v5.2"/>',
    result: '<path d="M5 7h14M5 12h14M5 17h9"/>',
    collapse: '<path d="M6 14.5 12 8.5l6 6"/>',
    rerun: '<path d="M19.5 12a7.5 7.5 0 1 1-2.1-5.2"/><path d="M19.5 4.5v4.2h-4.2"/>',
    edit: '<path d="M4 20h4L19.2 8.8 15.2 4.8 4 16z"/><path d="M13 7.2 16.8 11"/>',
    delete: '<path d="M5 7.5h14"/><path d="M9.5 7.5V5h5v2.5"/><path d="M8.2 7.5 9 19.5h6l.8-12"/>',
  };
  return `<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

function suiteRow(row) {
  const verdict = verdictOf(row);
  const open = table.openId === row.id && table.detail;
  return `
    <tr class="${row.passed === false ? "fail" : ""}">
      <td class="pick"><input type="checkbox" class="pick-box" data-pick="${row.id}" ${picked.has(row.id) ? "checked" : ""} aria-label="${esc(row.title || t("untitled"))}"></td>
      <td class="name" title="${esc(row.title || t("untitled"))}">
        <span class="name-text">${esc(row.title || t("untitled"))}</span>
        ${row.has_source ? `<a class="icon-hit" href="/api/cases/${row.id}/file" data-tip="${esc(t("sourceFile"))}" aria-label="${esc(t("sourceFile"))}">${lineIcon("file")}</a>` : ""}
      </td>
      <td class="label" data-label="${esc(t("colExpect"))}">${expectationCell(row)}</td>
      <td class="label" data-label="${esc(t("colModel"))}">${esc(row.product || "—")}</td>
      <td class="verdict" data-label="${esc(t("colScore"))}">
        <span class="stamp ${verdict.kind}">${esc(verdict.label)}</span>
        ${row.error ? `<p class="row-error">${esc(row.error)}</p>` : ""}
      </td>
      <td class="actions">
        <div class="icon-row">
          ${row.run_id ? `<button type="button" class="icon-hit" data-open="${row.id}" data-run="${row.run_id}" data-tip="${esc(table.openId === row.id ? t("collapse") : t("openResult"))}" aria-label="${esc(table.openId === row.id ? t("collapse") : t("openResult"))}">${lineIcon(table.openId === row.id ? "collapse" : "result")}</button>` : `<span class="icon-slot"></span>`}
          <button type="button" class="icon-hit" data-rerun="${row.id}" data-tip="${esc(t("rerun"))}" aria-label="${esc(t("rerun"))}">${lineIcon("rerun")}</button>
          <button type="button" class="icon-hit" data-edit-case="${row.id}" data-tip="${esc(t("edit"))}" aria-label="${esc(t("edit"))}">${lineIcon("edit")}</button>
          <button type="button" class="icon-hit" data-delete-case="${row.id}" data-tip="${esc(t("delete"))}" aria-label="${esc(t("delete"))}">${lineIcon("delete")}</button>
        </div>
      </td>
    </tr>
    ${open ? detailCells(table.detail, row) : ""}
  `;
}

function detailCells(detail, row) {
  const parsed = detail.parsed
    ? JSON.stringify(detail.parsed, null, 2)
    : detail.output_text || t("noOutput");
  const model = detail.parsed && detail.parsed.product ? detail.parsed.product : row.product || t("none");
  return `
    <tr class="detail-row ${row.passed === false ? "fail" : ""}">
      <td colspan="6">
        <p class="note">${esc(t("detailLine", { expect: row.expectation || t("none"), model }))} ${esc(detail.error || "")}</p>
        <div class="results">
          <article class="result-pane">
            <h2>${esc(t("output"))}</h2>
            <pre>${esc(parsed)}</pre>
          </article>
          <article class="result-pane reason">
            <h2>${esc(t("reasoning"))}</h2>
            <pre>${esc(detail.reasoning_text || t("noReasoning"))}</pre>
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
    : lastRun.output_text || t("noOutput");
  const verdict = verdictOf(lastRun);
  const caseTitle = table.rows.find((item) => item.id === lastRun.case_id)?.title || "";
  const product = lastRun.parsed && lastRun.parsed.product ? String(lastRun.parsed.product) : "";
  const judging = !lastRun.expectation && lastRun.case_id;
  const options = prompt().expectation_options;
  const selected = options.includes(product) ? product : "";
  return `
    <section class="results">
      <article class="result-pane">
        <h2>${esc(t("output"))} ${caseTitle ? `· ${esc(caseTitle)}` : ""} <span class="stamp ${verdict.kind}">${esc(verdict.label)}</span></h2>
        ${lastRun.error || lastRun.expectation ? `<p class="note">${esc(lastRun.error || t("expectResult", { value: lastRun.expectation }))}</p>` : ""}
        <pre>${esc(parsed)}</pre>
        ${judging ? `
          <div class="row" style="margin-top:12px">
            <select id="judge-label">
              <option value="">${esc(t("chooseProduct"))}</option>
              ${options.map((label) => `<option value="${esc(label)}" ${label === selected ? "selected" : ""}>${esc(label)}</option>`).join("")}
            </select>
            <button type="button" class="primary" id="confirm-expectation" ${busy ? "disabled" : ""}>${esc(t("confirmAdd"))}</button>
          </div>
        ` : ""}
      </article>
      <article class="result-pane reason">
        <h2>${esc(t("reasoning"))}</h2>
        <pre>${esc(lastRun.reasoning_text || t("noReasoning"))}</pre>
      </article>
    </section>
  `;
}

function resolveRunSource() {
  if (view.mode === "version" && view.versionId) {
    return { source: "version", versionId: view.versionId, fallback: false };
  }
  const draft = document.querySelector("#draft");
  const text = draft ? draft.value : prompt().draft;
  if (text === prompt().draft) {
    return { source: "draft", versionId: null, fallback: false };
  }
  const latest = prompt().versions[0];
  if (!latest) return null;
  return { source: "version", versionId: latest.id, fallback: true, number: latest.number };
}

async function runScope(scope) {
  const resolved = resolveRunSource();
  if (!resolved) {
    status = t("noSaved");
    render();
    return;
  }
  const payload = await send(`/api/prompts/${prompt().id}/run`, {
    method: "POST",
    status: t("regressing"),
    body: {
      source: resolved.source,
      version_id: resolved.versionId,
      target_id: Number(document.querySelector("#try-target").value),
      scope,
      case_ids: scope === "selected" ? [...picked] : [],
    },
  });
  if (!payload) return;
  const failed = (payload.runs || []).filter((run) => run.passed === false);
  table.suite = "test";
  table.versionId = resolved.versionId;
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
  const note = resolved.fallback ? t("draftFallback", { n: resolved.number }) : "";
  const scopeName = { all: t("scopeAll"), fail: t("scopeFail"), unscored: t("scopeUnscored"), selected: t("scopeSelected") }[scope];
  status = `${note}${t("runDone", { scope: scopeName, total: (payload.runs || []).length, fail: failed.length })}`;
  await reviewFailures(payload.runs);
  render();
}

function bind() {
  bindSplit();
  bindTargetPicker();
  const logout = document.querySelector("#logout");
  if (logout) {
    logout.onclick = async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      sessionUser = null;
      state = null;
      renderLogin();
    };
  }
  const activityMore = document.querySelector("#activity-more");
  if (activityMore) activityMore.onclick = openActivityLog;
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.onclick = () => {
      lang = button.dataset.lang;
      localStorage.setItem("phoenix-lang", lang);
      render();
    };
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = () => {
      view = button.dataset.view === "draft"
        ? { mode: "draft", versionId: null }
        : { mode: "version", versionId: Number(button.dataset.version) };
      render();
    };
  });
  const search = document.querySelector("#version-search");
  if (search) {
    search.oninput = () => {
      versionQuery = search.value;
      render();
    };
  }
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = async () => {
      if (button.dataset.view === "draft") {
        view = { mode: "draft", versionId: null };
        table.versionId = null;
      } else {
        view = { mode: "version", versionId: Number(button.dataset.version) };
        table.versionId = view.versionId;
      }
      table.page = 1;
      table.openId = null;
      table.detail = null;
      table.result = "all";
      await loadTable();
      render();
    };
  });
  const remark = document.querySelector("#version-remark");
  if (remark && view.mode === "version") {
    remark.onchange = async () => {
      const versionId = view.versionId;
      const payload = await send(`/api/versions/${versionId}/remark`, {
        method: "PUT",
        body: { remark: remark.value },
      });
      if (!payload) return;
      delete versionRemarkEdits[versionId];
      status = t("remarkSaved");
      render();
    };
  }
  const saveDraft = document.querySelector("#save-draft");
  if (saveDraft) {
    saveDraft.onclick = async () => {
      const payload = await send(`/api/prompts/${prompt().id}/draft`, {
        method: "PUT",
        body: { draft: document.querySelector("#draft").value },
      });
      if (payload) status = t("draftSaved");
      render();
    };
  }
  const publish = document.querySelector("#publish");
  if (publish) {
    publish.onclick = async () => {
      const draft = document.querySelector("#draft").value;
      const note = document.querySelector("#version-remark").value;
      await send(`/api/prompts/${prompt().id}/draft`, {
        method: "PUT",
        body: { draft },
      });
      const payload = await send(`/api/prompts/${prompt().id}/publish`, {
        method: "POST",
        status: t("publishing"),
        body: { remark: note },
      });
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
        ? t("published", { n: payload.version.number, total: payload.runs.length, fail: failed.length })
        : t("publishedEmpty", { n: payload.version.number });
      await reviewFailures(payload.runs);
      draftRemark = "";
      view = { mode: "version", versionId: payload.version.id };
      render();
    };
  }
  document.querySelectorAll("[data-scope]").forEach((button) => {
    button.onclick = () => runScope(button.dataset.scope);
  });
  const runSelected = document.querySelector("#run-selected");
  if (runSelected) runSelected.onclick = () => runScope("selected");
  const pin = document.querySelector("#pin-version");
  if (pin) {
    pin.onclick = async () => {
      const payload = await send(`/api/prompts/${prompt().id}/pin`, {
        method: "PUT",
        body: { version_id: view.versionId },
      });
      if (payload) status = t("pinnedVersion");
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
        status: t("sending"),
        body: {
          source: kind,
          version_id: id ? Number(id) : null,
          target_id: Number(document.querySelector("#try-target").value),
          case_id: Number(document.querySelector("#try-case").value),
        },
      });
      if (payload) status = "";
      await reviewFailures(payload ? [payload.run] : []);
      render();
    };
  }
  const casePane = document.querySelector(".case-pane");
  const fileInput = document.querySelector("#case-file");
  if (casePane && fileInput) {
    const startUpload = (fileList) => {
      const files = [...(fileList || [])];
      const key = files.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join("|");
      const now = Date.now();
      if (!key || (key === lastUploadKey && now - lastUploadAt < 800)) return;
      lastUploadKey = key;
      lastUploadAt = now;
      uploadCases(files);
    };
    casePane.ondragover = (event) => {
      event.preventDefault();
      casePane.classList.add("over");
    };
    casePane.ondragleave = (event) => {
      if (!casePane.contains(event.relatedTarget)) casePane.classList.remove("over");
    };
    casePane.ondrop = (event) => {
      event.preventDefault();
      casePane.classList.remove("over");
      startUpload(event.dataTransfer.files);
    };
    fileInput.onchange = () => {
      startUpload(fileInput.files);
      fileInput.value = "";
    };
  }
  const confirm = document.querySelector("#confirm-expectation");
  if (confirm) {
    confirm.onclick = async () => {
      const label = document.querySelector("#judge-label").value;
      if (!label) {
        status = t("pickFirst");
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
      status = t("addedSuite", { label });
      render();
    };
  }
  const form = document.querySelector("#case-form");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const expectation = document.querySelector("#batch-expectation")?.value || "";
    batchExpectation = expectation;
    const text = data.input_text || "";
    if (!caseDraft.case_id && !text.trim()) {
      status = t("needText");
      render();
      return;
    }
    const title = (data.title || "").trim()
      || text.split("\n").map((line) => line.trim()).find(Boolean)?.slice(0, 80)
      || t("manual");
    const payload = await send(`/api/workflows/${prompt().workflow.id}/cases`, {
      method: "POST",
      body: {
        case_id: caseDraft.case_id,
        title,
        input_text: text,
        expectation,
      },
    });
    if (payload) {
      caseDraft = { case_id: null, title: "", input_text: "", expectation: "" };
      table.suite = expectation ? "test" : "pending";
      table.page = 1;
      await loadTable();
      status = expectation ? t("addedExpect", { label: expectation }) : t("savedUnlabeled");
    }
    render();
  };
  document.querySelectorAll("[data-suite]").forEach((button) => {
    button.onclick = async () => {
      table.suite = button.dataset.suite;
      table.page = 1;
      table.openId = null;
      table.detail = null;
      table.expectFilter = [];
      table.expectOpen = false;
      table.expectQuery = "";
      table.labelOpenId = null;
      await loadTable();
      render();
    };
  });
  bindPicks();
  bindExpectFilter();
  bindLabelMenu();
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
      table.labelOpenId = null;
      await loadTable();
      render();
    };
  }
  if (next) {
    next.onclick = async () => {
      table.page += 1;
      table.openId = null;
      table.labelOpenId = null;
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
      const resolved = resolveRunSource();
      if (!resolved) {
        status = t("noSaved");
        render();
        return;
      }
      const payload = await send(`/api/prompts/${prompt().id}/try`, {
        method: "POST",
        status: t("sending"),
        body: {
          source: resolved.source,
          version_id: resolved.versionId,
          target_id: Number(document.querySelector("#try-target").value),
          case_id: Number(button.dataset.rerun),
        },
      });
      if (!payload) return;
      table.openId = Number(button.dataset.rerun);
      table.detail = payload.run;
      status = resolved.fallback ? t("draftFallback", { n: resolved.number }) : "";
      await reviewFailures([payload.run]);
      render();
    };
  });
  document.querySelectorAll("[data-edit-case]").forEach((button) => {
    button.onclick = async () => {
      const response = await fetch(`/api/cases/${button.dataset.editCase}`);
      if (!response.ok) return;
      const item = await response.json();
      caseDraft = { ...item, case_id: item.id };
      const batch = document.querySelector("#batch-expectation");
      if (batch) batch.value = item.expectation || "";
      render();
      document.querySelector(".intake-bar")?.scrollIntoView({ block: "start" });
    };
  });
  document.querySelectorAll("[data-delete-case]").forEach((button) => {
    button.onclick = async () => {
      const payload = await send(`/api/cases/${button.dataset.deleteCase}`, { method: "DELETE" });
      if (payload) status = t("deleted");
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

function confirmBatchExpectation(files, expectation) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "confirm-batch";
    const items = files.map((file) => `<li>${esc(file.name)}</li>`).join("");
    dialog.innerHTML = `
      <form method="dialog">
        <h2>${esc(t("confirmBatchTitle"))}</h2>
        <p>${t("confirmBatchBody", { n: files.length, label: `<strong>${esc(expectation)}</strong>` })}</p>
        <ul>${items}</ul>
        <div class="row">
          <button type="submit" class="primary" value="yes">${esc(t("confirmBatchYes", { label: expectation }))}</button>
          <button type="submit" value="no">${esc(t("cancel"))}</button>
        </div>
      </form>
    `;
    dialog.addEventListener("close", () => {
      const accepted = dialog.returnValue === "yes";
      dialog.remove();
      resolve(accepted);
    }, { once: true });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close("no");
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

function termSheetFiles(fileList) {
  const all = [...(fileList || [])];
  const files = all.filter((file) => /\.(pdf|docx)$/i.test(file.name));
  return { files, skipped: all.length - files.length };
}

async function uploadCases(fileList) {
  const { files, skipped } = termSheetFiles(fileList);
  if (!files.length) {
    if (skipped) {
      status = t("pdfOnly");
      render();
    }
    return;
  }
  const batchSelect = document.querySelector("#batch-expectation");
  if (batchSelect) batchExpectation = batchSelect.value;
  const expectation = batchExpectation;
  if (expectation && files.length > 1) {
    const accepted = await confirmBatchExpectation(files, expectation);
    if (!accepted) {
      status = t("uploadCancelled");
      render();
      return;
    }
  }
  for (const file of files) {
    busy = true;
    status = expectation
      ? t("extracting", { name: file.name, label: expectation })
      : t("extractingPlain", { name: file.name });
    render();
    const body = new FormData();
    body.append("file", file);
    body.append("expectation", expectation);
    const response = await fetch(`/api/workflows/${prompt().workflow.id}/drop`, {
      method: "POST",
      body,
    });
    const payload = await response.json();
    busy = false;
    if (!response.ok) {
      laneError = payload.detail || t("fileFailed");
      status = "";
      render();
      continue;
    }
    state = payload.state;
    lastRun = payload.run;
    noteLane(payload.run);
    await reviewFailures([payload.run]);
    table.suite = payload.expectation ? "test" : "pending";
    table.page = 1;
    await loadTable();
    table.openId = payload.case_id;
    table.detail = payload.run;
    if (!cameBack(payload.run) && payload.run.error) status = "";
    else if (expectation && payload.replaced) status = t("updatedExpect", { name: file.name, label: expectation });
    else if (expectation) status = t("addedFile", { name: file.name, label: expectation });
    else if (payload.replaced && payload.expectation) status = t("replacedRerun", { name: file.name });
    else if (payload.replaced) status = t("replacedConfirm", { name: file.name });
    else status = t("ranConfirm", { name: file.name });
    render();
  }
  if (skipped) {
    status = `${status}${t("skipped", { n: skipped })}`;
    render();
  }
}

async function boot() {
  const me = await fetch("/api/auth/me");
  if (!me.ok) {
    renderLogin();
    return;
  }
  sessionUser = await me.json();
  await load();
  refreshHealth();
}
boot();
setInterval(refreshHealth, 15000);
