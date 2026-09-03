// ─────────────────────────────────────────────────────────────
//  Main App Logic  –  Legal Document Scanner
// ─────────────────────────────────────────────────────────────

// ── State ──────────────────────────────────────────────────────
const state = {
  docText: "",
  docName: "",
  clauses: [],
  translatedClauses: null,
  currentLang: "English",
  chatHistory: [],
  doc2Text: "",
  doc2Name: "",
  compareResults: [],
  activeFilter: "All",
  apiKeySet: false,
};

// ── Helpers ────────────────────────────────────────────────────
function showToast(msg, type = "info") {
  const c = document.getElementById("toast-container");
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  t.innerHTML = `<span>${icons[type] || "ℹ️"}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function setLoading(btnId, isLoading, label = "") {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = isLoading;
  btn.innerHTML = isLoading
    ? `<span class="spinner"></span> ${label || "Processing…"}`
    : btn.dataset.originalLabel || label;
}

function saveOriginalLabel(btnId) {
  const btn = document.getElementById(btnId);
  if (btn && !btn.dataset.originalLabel) btn.dataset.originalLabel = btn.innerHTML;
}

function setProgress(pct) {
  document.getElementById("progress-bar").style.width = `${pct}%`;
  document.getElementById("progress-wrap").style.display = pct < 100 ? "block" : "none";
}

// ── API Key ────────────────────────────────────────────────────
function initApiKey() {
  const saved = localStorage.getItem("groq_api_key") || "";
  const input = document.getElementById("api-key-input");
  input.value = saved;
  if (saved) {
    state.apiKeySet = true;
    document.getElementById("api-status").textContent = "✅ API key saved";
    document.getElementById("api-status").style.color = "var(--success)";
  }
}

function saveApiKey() {
  const val = document.getElementById("api-key-input").value.trim();
  if (!val) { showToast("Please enter your API key", "error"); return; }
  localStorage.setItem("groq_api_key", val);
  state.apiKeySet = true;
  document.getElementById("api-status").textContent = "✅ API key saved";
  document.getElementById("api-status").style.color = "var(--success)";
  showToast("API key saved!", "success");
}

// ── Tab Navigation ─────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelector(`[data-tab="${tabId}"]`).classList.add("active");
  document.getElementById(tabId).classList.add("active");
}

// ── File Upload ────────────────────────────────────────────────
function setupDropZone(zoneId, inputId, labelId, onFile) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", e => {
    e.preventDefault(); zone.classList.remove("dragover");
    if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
  });
  input.addEventListener("change", () => { if (input.files[0]) onFile(input.files[0]); });
}

async function handleDoc1Upload(file) {
  const err = validatePDFFile(file);
  if (err) { showToast(err, "error"); return; }

  document.getElementById("doc1-name").textContent = `📄 ${file.name}`;
  setLoading("analyze-btn", true, "Extracting PDF…");
  setProgress(10);

  try {
    const { text, numPages } = await extractTextFromPDF(file);
    state.docText = text;
    state.docName = file.name;
    setProgress(30);
    showToast(`Extracted ${numPages} pages from "${file.name}"`, "success");
    document.getElementById("analyze-section").style.display = "block";
    document.getElementById("doc1-info").textContent = `${numPages} pages · ${(file.size/1024).toFixed(0)} KB`;
  } catch (e) {
    showToast("Failed to parse PDF: " + e.message, "error");
    setProgress(0);
  } finally {
    setLoading("analyze-btn", false, "🔍 Analyze Document");
    document.getElementById("analyze-btn").disabled = false;
    setProgress(100);
    setTimeout(() => setProgress(0), 800);
  }
}

async function handleDoc2Upload(file) {
  const err = validatePDFFile(file);
  if (err) { showToast(err, "error"); return; }
  document.getElementById("doc2-name").textContent = `📄 ${file.name}`;
  try {
    const { text } = await extractTextFromPDF(file);
    state.doc2Text = text;
    state.doc2Name = file.name;
    showToast(`Loaded "${file.name}" for comparison`, "success");
    document.getElementById("compare-btn").disabled = false;
  } catch (e) {
    showToast("Failed to parse PDF: " + e.message, "error");
  }
}

// ── Analyze Document ───────────────────────────────────────────
async function runAnalysis() {
  if (!state.docText) { showToast("Upload a document first", "error"); return; }
  if (!getApiKey()) { showToast("Set your Groq API key first", "error"); return; }

  saveOriginalLabel("analyze-btn");
  setLoading("analyze-btn", true, "Analyzing clauses…");
  setProgress(20);

  try {
    const clauses = await analyzeDocument(state.docText);
    if (!Array.isArray(clauses) || clauses.length === 0) {
      showToast("No clauses detected. Try a different document.", "error");
      return;
    }
    state.clauses = clauses;
    state.translatedClauses = null;
    setProgress(60);

    const summary = await summarizeDocument(clauses);
    setProgress(90);

    renderResults(clauses, summary);
    switchTab("tab-results");
    showToast(`Found ${clauses.length} clauses!`, "success");
  } catch (e) {
    if (e.message === "NO_API_KEY") showToast("Please set your Groq API key", "error");
    else showToast("Analysis failed: " + e.message, "error");
  } finally {
    setLoading("analyze-btn", false, "🔍 Analyze Document");
    setProgress(100);
    setTimeout(() => setProgress(0), 600);
  }
}

// ── Render Results ─────────────────────────────────────────────
function getDisplayClauses() {
  return state.translatedClauses
    ? state.clauses.map((c, i) => {
        const t = state.translatedClauses.find(x => String(x.id) === String(c.id)) || {};
        return { ...c, title: t.title || c.title, plain: t.plain || c.plain,
          riskReason: t.riskReason || c.riskReason, deviation: t.deviation || c.deviation };
      })
    : state.clauses;
}

function renderResults(rawClauses, summary) {
  const high   = rawClauses.filter(c => c.risk === "High").length;
  const medium = rawClauses.filter(c => c.risk === "Medium").length;
  const low    = rawClauses.filter(c => c.risk === "Low").length;

  document.getElementById("stat-total").textContent  = rawClauses.length;
  document.getElementById("stat-high").textContent   = high;
  document.getElementById("stat-medium").textContent = medium;
  document.getElementById("stat-low").textContent    = low;

  if (summary) {
    document.getElementById("doc-summary").textContent = summary;
    document.getElementById("summary-box").style.display = "block";
  }

  document.getElementById("results-area").style.display = "block";
  renderClauses();
}

function renderClauses() {
  const display = getDisplayClauses();
  const filter  = state.activeFilter;
  const filtered = filter === "All" ? display : display.filter(c => c.risk === filter);

  const container = document.getElementById("clauses-list");
  container.innerHTML = "";

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>No clauses match this filter.</p></div>`;
    return;
  }

  filtered.forEach(clause => {
    const card = document.createElement("div");
    card.className = "clause-card";
    const riskClass = `risk-${clause.risk.toLowerCase()}`;
    card.innerHTML = `
      <div class="clause-header" onclick="toggleClause(this)">
        <span class="risk-badge ${riskClass}">${getRiskIcon(clause.risk)} ${clause.risk}</span>
        <span class="clause-title">${escHtml(clause.title)}</span>
        <span class="clause-category">${escHtml(clause.category || "")}</span>
        <span style="color:var(--text-muted); font-size:1.1rem;">▾</span>
      </div>
      <div class="clause-body">
        <div class="section-label">📜 Original Text</div>
        <div class="original-text">${escHtml(clause.original || "")}</div>

        <div class="section-label">✅ Plain Language</div>
        <div class="plain-text">${escHtml(clause.plain || "")}</div>

        <div class="section-label">⚠️ Risk Reason</div>
        <div class="risk-reason">${escHtml(clause.riskReason || "")}</div>

        <div class="section-label">📊 vs Standard Contract</div>
        <div class="deviation-text">${escHtml(clause.deviation || "")}</div>
      </div>`;
    container.appendChild(card);
  });
}

function toggleClause(header) {
  const body = header.nextElementSibling;
  body.classList.toggle("open");
  const arrow = header.querySelector("span:last-child");
  arrow.textContent = body.classList.contains("open") ? "▴" : "▾";
}

function getRiskIcon(risk) {
  return { High: "🔴", Medium: "🟡", Low: "🟢" }[risk] || "⚪";
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function filterClauses(risk) {
  state.activeFilter = risk;
  document.querySelectorAll(".chip").forEach(c => {
    c.classList.toggle("active", c.dataset.filter === risk);
  });
  renderClauses();
}

// ── Translation ────────────────────────────────────────────────
async function translateTo(lang) {
  if (!state.clauses.length) { showToast("Analyze a document first", "error"); return; }
  if (lang === "English") {
    state.translatedClauses = null;
    state.currentLang = "English";
    renderClauses();
    showToast("Reset to English", "info");
    return;
  }
  const btn = document.getElementById("translate-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Translating…`;
  try {
    const translated = await translateAnalysis(state.clauses, lang);
    state.translatedClauses = translated;
    state.currentLang = lang;
    renderClauses();
    showToast(`Translated to ${lang}!`, "success");
  } catch (e) {
    showToast("Translation failed: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "🌐 Translate";
  }
}

// ── Chat / RAG ─────────────────────────────────────────────────
function appendMessage(role, text) {
  const messages = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = `msg msg-${role}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function appendSystemMsg(text) {
  const messages = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "msg msg-system";
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const q = input.value.trim();
  if (!q) return;
  if (!state.docText) { showToast("Upload and analyze a document first", "error"); return; }
  if (!getApiKey()) { showToast("Set your Groq API key first", "error"); return; }

  input.value = "";
  appendMessage("user", q);
  state.chatHistory.push({ role: "user", text: q });

  const btn = document.getElementById("send-chat-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>`;

  try {
    const answer = await askQuestion(q, state.docText, state.chatHistory.slice(-6));
    appendMessage("ai", answer);
    state.chatHistory.push({ role: "ai", text: answer });
  } catch (e) {
    appendMessage("ai", "Sorry, I encountered an error: " + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Send ➤";
  }
}

// ── Compare Two Versions ───────────────────────────────────────
async function compareVersions() {
  if (!state.docText)  { showToast("Upload Version 1 first", "error"); return; }
  if (!state.doc2Text) { showToast("Upload Version 2 first", "error"); return; }
  if (!getApiKey())    { showToast("Set your Groq API key first", "error"); return; }

  const btn = document.getElementById("compare-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Comparing…`;

  try {
    const results = await compareDocuments(state.docText, state.doc2Text);
    state.compareResults = results;
    renderComparison(results);
    showToast(`Found ${results.length} changes!`, "success");
  } catch (e) {
    showToast("Comparison failed: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "⚖️ Compare Versions";
  }
}

function renderComparison(results) {
  const container = document.getElementById("compare-results");
  container.innerHTML = "";

  if (!results || results.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon">✅</div><p>No significant differences detected.</p></div>`;
    return;
  }

  const favCount  = results.filter(r => r.impact === "Favorable").length;
  const unfavCount= results.filter(r => r.impact === "Unfavorable").length;
  const neutralCount = results.filter(r => r.impact === "Neutral").length;

  container.innerHTML = `
    <div class="stats-row" style="margin-bottom:24px">
      <div class="stat-card"><div class="stat-number" style="color:var(--text)">${results.length}</div><div class="stat-label">Total Changes</div></div>
      <div class="stat-card"><div class="stat-number" style="color:var(--success)">${favCount}</div><div class="stat-label">Favorable</div></div>
      <div class="stat-card"><div class="stat-number" style="color:var(--danger)">${unfavCount}</div><div class="stat-label">Unfavorable</div></div>
      <div class="stat-card"><div class="stat-number" style="color:var(--text-muted)">${neutralCount}</div><div class="stat-label">Neutral</div></div>
    </div>
  `;

  results.forEach(r => {
    const typeClass   = `diff-${(r.changeType||"modified").toLowerCase()}`;
    const badgeClass  = `badge-${(r.changeType||"modified").toLowerCase()}`;
    const impactClass = `impact-${(r.impact||"neutral").toLowerCase()}`;

    const div = document.createElement("div");
    div.className = `diff-card ${typeClass}`;
    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span class="diff-badge ${badgeClass}">${r.changeType || "Modified"}</span>
        <strong>${escHtml(r.clauseTitle || "")}</strong>
        <span class="${impactClass}" style="margin-left:auto;font-size:0.85rem;font-weight:600">
          ${r.impact === "Favorable" ? "▲" : r.impact === "Unfavorable" ? "▼" : "→"} ${r.impact}
        </span>
      </div>
      <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px">${escHtml(r.summary||"")}</p>
      <div class="compare-grid">
        <div>
          <div class="section-label" style="color:var(--danger)">📄 Version 1</div>
          <div class="original-text">${escHtml(r.original||"")}</div>
        </div>
        <div>
          <div class="section-label" style="color:var(--success)">📄 Version 2</div>
          <div class="plain-text">${escHtml(r.revised||"")}</div>
        </div>
      </div>`;
    container.appendChild(div);
  });
}

// ── Export ─────────────────────────────────────────────────────
function exportReport() {
  if (!state.clauses.length) { showToast("No analysis to export", "error"); return; }
  const display = getDisplayClauses();
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Legal Analysis Report – ${escHtml(state.docName)}</title>
<style>
body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#1e293b;}
h1{color:#4f46e5;} h2{border-bottom:2px solid #e2e8f0;padding-bottom:8px;}
.high{color:#ef4444;} .medium{color:#f59e0b;} .low{color:#10b981;}
.clause{border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;}
.label{font-size:0.75rem;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px;}
.box{background:#f8fafc;padding:10px;border-radius:4px;margin-bottom:10px;font-size:0.9rem;}
</style></head><body>
<h1>⚖️ Legal Document Analysis Report</h1>
<p><strong>Document:</strong> ${escHtml(state.docName)}</p>
<p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
<p><strong>Language:</strong> ${state.currentLang}</p>
<hr>`;

  display.forEach(c => {
    html += `<div class="clause">
<h2><span class="${c.risk.toLowerCase()}">${getRiskIcon(c.risk)} ${escHtml(c.title)}</span> <small>[${c.risk} Risk]</small></h2>
<div class="label">Original</div><div class="box">${escHtml(c.original||"")}</div>
<div class="label">Plain Language</div><div class="box">${escHtml(c.plain||"")}</div>
<div class="label">Risk Reason</div><div class="box">${escHtml(c.riskReason||"")}</div>
<div class="label">vs Standard Contract</div><div class="box">${escHtml(c.deviation||"")}</div>
</div>`;
  });

  html += `</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `legal-analysis-${Date.now()}.html`;
  a.click();
  showToast("Report exported!", "success");
}

// ── Init ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  initApiKey();
  setProgress(0);
  document.getElementById("progress-wrap").style.display = "none";

  // Tab buttons
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Upload zones
  setupDropZone("upload-zone-1", "file-input-1", "doc1-name", handleDoc1Upload);
  setupDropZone("upload-zone-2", "file-input-2", "doc2-name", handleDoc2Upload);

  // Analyze button
  document.getElementById("analyze-btn").addEventListener("click", runAnalysis);

  // Compare button
  document.getElementById("compare-btn").addEventListener("click", compareVersions);

  // Chat send
  document.getElementById("send-chat-btn").addEventListener("click", sendChatMessage);
  document.getElementById("chat-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  // Filter chips
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => filterClauses(chip.dataset.filter));
  });

  // Translate
  document.getElementById("translate-btn").addEventListener("click", () => {
    const lang = document.getElementById("lang-select").value;
    translateTo(lang);
  });

  // Export
  document.getElementById("export-btn").addEventListener("click", exportReport);

  // API key save
  document.getElementById("save-key-btn").addEventListener("click", saveApiKey);
  document.getElementById("api-key-input").addEventListener("keydown", e => {
    if (e.key === "Enter") saveApiKey();
  });

  // Chat default message
  appendSystemMsg("📄 Upload and analyze a document to start asking questions.");
});
