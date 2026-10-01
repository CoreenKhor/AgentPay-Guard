let appState = null;
let eventSource = null;
let activeFilter = "ALL";
let activeTab = "overview";

// Real-Time Waveform Chart Data
const CHART_POINTS = 40;
let chartOutflowData = new Array(CHART_POINTS).fill(0.005);
let chartVelocityData = new Array(CHART_POINTS).fill(1);

// =========================================================================
// Light / Dark Theme Management
// =========================================================================
function initTheme() {
  const saved = localStorage.getItem("apg-theme") || "dark";
  setTheme(saved);
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("apg-theme", theme);

  const sunIcon = document.getElementById("theme-icon-sun");
  const moonIcon = document.getElementById("theme-icon-moon");

  if (theme === "light") {
    sunIcon?.classList.add("hidden");
    moonIcon?.classList.remove("hidden");
  } else {
    sunIcon?.classList.remove("hidden");
    moonIcon?.classList.add("hidden");
  }

  drawVelocityChart();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
}

// =========================================================================
// Tab Navigation Engine
// =========================================================================
function switchTab(tabId) {
  // Gracefully alias legacy or separated tab IDs to the unified cockpit
  if (tabId === "transactions" || tabId === "security-lab") {
    tabId = "lab-ledger";
  }
  activeTab = tabId;

  const navTabs = document.querySelectorAll(".nav-tab");
  navTabs.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  const views = document.querySelectorAll(".tab-view");
  views.forEach((view) => {
    view.classList.toggle("active", view.id === `tab-content-${tabId}`);
  });

  if (tabId === "overview") {
    setTimeout(drawVelocityChart, 50);
  }
}

// =========================================================================
// Toast Notification Engine (High-End Minimalist Micro-Pill)
// =========================================================================
let currentToastTimeout = null;

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  // Single active toast: clear previous toast immediately to prevent stacking clutter
  if (currentToastTimeout) {
    clearTimeout(currentToastTimeout);
    currentToastTimeout = null;
  }
  container.innerHTML = "";

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const dot = document.createElement("span");
  dot.className = "toast-dot";

  const msg = document.createElement("span");
  msg.className = "toast-msg";
  msg.textContent = message;

  toast.appendChild(dot);
  toast.appendChild(msg);
  container.appendChild(toast);

  currentToastTimeout = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(6px)";
    toast.style.transition = "opacity 0.18s ease, transform 0.18s ease";
    setTimeout(() => {
      toast.remove();
      currentToastTimeout = null;
    }, 180);
  }, 2400);
}

// =========================================================================
// Real-Time Threat Diagnostics Updater
// =========================================================================
function updateDiagnostics(vector, layer, action, statusType = "nominal") {
  const vecEl = document.getElementById("diag-vector");
  const layerEl = document.getElementById("diag-layer");
  const actEl = document.getElementById("diag-action");

  if (vecEl) vecEl.textContent = vector;
  if (layerEl) {
    layerEl.textContent = layer;
    layerEl.className = "threat-val " + (
      statusType === "blocked" ? "text-red" :
      statusType === "sentinel" ? "text-amber" :
      statusType === "hitl" ? "text-amber" :
      "text-emerald"
    );
  }
  if (actEl) {
    actEl.textContent = action;
    actEl.className = "threat-val " + (
      statusType === "blocked" ? "text-red" :
      statusType === "sentinel" ? "text-amber" :
      statusType === "hitl" ? "text-amber" :
      "text-emerald"
    );
  }
}

// =========================================================================
// Categorized Activity Log System (Separated Attack vs Kernel Telemetry)
// =========================================================================
let logEntries = [
  {
    id: 1,
    timeStr: new Date().toTimeString().split(" ")[0],
    tag: "ARMED",
    tagType: "settled",
    message: "Security kernel active. Monitoring autonomous transactions on Solana Devnet.",
    category: "SYS",
  }
];
let activeLogCategory = "ALL";

function filterLogCategory(category) {
  activeLogCategory = category;
  const buttons = document.querySelectorAll(".log-cat-btn");
  buttons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.category === category);
  });
  renderLogs();
}

function updateLogCounters() {
  const allEl = document.getElementById("log-count-all");
  const simEl = document.getElementById("log-count-sim");
  const sysEl = document.getElementById("log-count-sys");

  if (allEl) allEl.textContent = logEntries.length;
  if (simEl) simEl.textContent = logEntries.filter((e) => e.category === "SIM").length;
  if (sysEl) sysEl.textContent = logEntries.filter((e) => e.category === "SYS").length;
}

function renderLogs() {
  const terminal = document.getElementById("sim-terminal-log");
  if (!terminal) return;
  terminal.innerHTML = "";

  const filtered = activeLogCategory === "ALL"
    ? logEntries
    : logEntries.filter((e) => e.category === activeLogCategory);

  const visible = filtered.slice(-15);

  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "log-row";
    empty.style.color = "var(--text-subtle)";
    empty.style.fontStyle = "italic";
    empty.textContent = `No logs recorded in ${activeLogCategory === "SIM" ? "Attack Defense" : "Kernel & Sentinel"} view.`;
    terminal.appendChild(empty);
    updateLogCounters();
    return;
  }

  for (const entry of visible) {
    const line = document.createElement("div");
    line.className = "log-row";

    const timeSpan = document.createElement("span");
    timeSpan.className = "log-time";
    timeSpan.textContent = `[${entry.timeStr}]`;

    const tagSpan = document.createElement("span");
    tagSpan.className = `log-tag tag-${entry.tagType}`;
    tagSpan.textContent = entry.tag;

    const msgSpan = document.createElement("span");
    msgSpan.textContent = entry.message;

    line.appendChild(timeSpan);
    line.appendChild(tagSpan);
    line.appendChild(msgSpan);
    terminal.appendChild(line);
  }

  terminal.scrollTop = terminal.scrollHeight;
  updateLogCounters();
}

function logTerminal(message, tag = "INFO", tagType = "settled", category = "SIM") {
  const now = new Date();
  const timeStr = now.toTimeString().split(" ")[0];

  logEntries.push({
    id: Date.now() + Math.random(),
    timeStr,
    tag,
    tagType,
    message,
    category,
  });

  // Retain up to 40 entries in memory across categories
  if (logEntries.length > 40) {
    logEntries.shift();
  }

  renderLogs();
}

function clearTerminal() {
  if (activeLogCategory === "ALL") {
    logEntries = [];
  } else {
    logEntries = logEntries.filter((e) => e.category !== activeLogCategory);
  }
  renderLogs();
}

// Format Lamports to SOL with precise 3-decimal places
function formatSol(lamports) {
  return (Number(lamports) / 1_000_000_000).toFixed(3);
}

// Copy to clipboard helper (decluttered - micro toast only, no terminal spam)
function copyText(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Copied ${text.slice(0, 12)}... to clipboard`, "info");
  }).catch(() => {});
}

// =========================================================================
// Fetch State & SSE Real-time Feed
// =========================================================================
async function fetchState() {
  try {
    const res = await fetch("/api/state");
    appState = await res.json();
    renderAll();
  } catch (err) {
    console.error("Failed to fetch state:", err);
  }
}

function connectSSE() {
  if (eventSource) eventSource.close();

  eventSource = new EventSource("/api/events");

  eventSource.addEventListener("connected", () => {
    // Silent connection to maintain clean high-signal log
  });

  eventSource.addEventListener("transaction", (e) => {
    const tx = JSON.parse(e.data);
    if (!appState) return;
    tx._isNew = true;
    appState.transactions.unshift(tx);
    if (appState.transactions.length > 60) appState.transactions.pop();

    // Push to chart data
    chartOutflowData.shift();
    chartOutflowData.push(Number(tx.amountSol) || 0.01);
    chartVelocityData.shift();
    chartVelocityData.push(tx.status === "SETTLED" ? 2 : 1);
    drawVelocityChart();

    renderTransactions();
    renderOverviewTransactions();
    fetchState();

    if (tx.status === "SETTLED") {
      showToast(`Settled ${tx.amountSol} SOL -> ${tx.recipientLabel}`, "success");
    } else if (tx.status === "REJECTED" || tx.status === "CIRCUIT_TRIPPED" || tx.status === "PAYLOAD_MISMATCH") {
      showToast(`Blocked: ${tx.notes}`, "error");
    } else if (tx.status === "HITL_PENDING") {
      showToast(`Review Required: ${tx.amountSol} SOL exceeds ceiling`, "warning");
    }
  });

  eventSource.addEventListener("sentinel_incident", (e) => {
    const incident = JSON.parse(e.data);
    updateDiagnostics(incident.incidentType || "Sentinel Alert", "Layer 2 Anomaly Sentinel", "CIRCUIT_TRIPPED", "sentinel");
    logTerminal(incident.reason, "SENTINEL", "sentinel");
    fetchState();
  });

  eventSource.addEventListener("hitl_ticket", (e) => {
    const ticket = JSON.parse(e.data);
    if (ticket.status === "PENDING") {
      updateDiagnostics("High-Value Spend", "Layer 3 Out-of-Bounds Policy", "ESCALATED_TO_HITL", "hitl");
      logTerminal(`Ticket ${ticket.ticketId.slice(0, 8)}: Spend ${formatSol(ticket.amountLamports)} SOL pending human sign-off`, "HITL", "hitl");
    }
    fetchState();
  });

  eventSource.addEventListener("state_change", () => {
    fetchState();
  });

  eventSource.onerror = () => {
    setTimeout(connectSSE, 3000);
  };
}

// Transaction Ledger Filter
function filterTransactions(filterKey) {
  activeFilter = filterKey;
  const buttons = document.querySelectorAll(".filter-btn");
  buttons.forEach((btn) => {
    btn.classList.toggle("active", btn.textContent.toUpperCase().includes(filterKey));
  });
  renderTransactions();
}

// =========================================================================
// Main Render All
// =========================================================================
function renderAll() {
  if (!appState) return;

  renderCircuitStatus();
  renderMetrics();
  renderVaultAndPolicies();
  renderTransactions();
  renderOverviewTransactions();
  renderHITLQueue();
  renderIncidents();
  drawVelocityChart();
}

// Render Circuit Status & Emergency Banner
function renderCircuitStatus() {
  const indicator = document.getElementById("system-status-indicator");
  const label = document.getElementById("system-status-text");
  const toggleBtn = document.getElementById("btn-toggle-circuit");
  const toggleLabel = document.getElementById("btn-toggle-text");
  const emergencyBanner = document.getElementById("emergency-banner");

  const isFrozen = appState.vault.isFrozen;

  if (emergencyBanner) {
    emergencyBanner.classList.toggle("hidden", !isFrozen);
  }

  if (isFrozen) {
    indicator.className = "status-badge status-tripped";
    label.textContent = "Circuit Frozen";
    toggleBtn.className = "btn btn-freeze";
    toggleLabel.textContent = "Resume Normal State";
  } else {
    indicator.className = "status-badge status-normal";
    label.textContent = "Kernel Armed";
    toggleBtn.className = "btn btn-freeze";
    toggleLabel.textContent = "Emergency Freeze";
  }
}

// Render Key Metrics Ribbon
function renderMetrics() {
  const { vault, sentinel } = appState;

  // 1. Daily spend
  const spentSol = formatSol(vault.currentDailySpentLamports);
  document.getElementById("metric-daily-spent").textContent = spentSol;
  document.getElementById("metric-daily-lamports").textContent = `${Number(vault.currentDailySpentLamports).toLocaleString()} Lamports`;

  const spentPct = Math.min(100, (Number(vault.currentDailySpentLamports) / Number(vault.dailySpendLimitLamports)) * 100);
  document.getElementById("metric-daily-pct").textContent = `${spentPct.toFixed(1)}%`;
  const dailyBar = document.getElementById("daily-spend-progress");
  dailyBar.style.width = `${spentPct}%`;

  // 2. T1 Burst
  const t1Count = sentinel.telemetry.t1BurstCount;
  const t1Max = sentinel.telemetry.t1BurstMax;
  document.getElementById("metric-t1-count").textContent = t1Count;
  const t1Pct = Math.min(100, Math.round((t1Count / t1Max) * 100));
  const t1Bar = document.getElementById("t1-progress");
  t1Bar.style.width = `${t1Pct}%`;

  // 3. T2 Acceleration
  const t2Count = sentinel.telemetry.t2AccelCount;
  const t2Max = sentinel.telemetry.t2AccelMax;
  document.getElementById("metric-t2-count").textContent = t2Count;
  const t2Pct = Math.min(100, Math.round((t2Count / t2Max) * 100));
  document.getElementById("t2-progress").style.width = `${t2Pct}%`;
  document.getElementById("metric-t2-cadence").textContent = `${(t2Count / 60).toFixed(2)}`;

  // 4. Leaky Bucket
  const leakyLevel = sentinel.telemetry.leakyBucketLevel;
  const leakyCap = sentinel.telemetry.leakyBucketCapacity;
  document.getElementById("metric-leaky-level").textContent = leakyLevel;
  const leakyPct = Math.min(100, Math.round((leakyLevel / leakyCap) * 100));
  const leakyBar = document.getElementById("leaky-progress");
  leakyBar.style.width = `${leakyPct}%`;
}

// Render Vault PDA & Policies
function renderVaultAndPolicies() {
  document.getElementById("vault-pda-text").textContent = appState.vault.agentOwner;
  document.getElementById("sentinel-pda-text").textContent = appState.vault.sentinelKey;

  const allowlistContainer = document.getElementById("allowlist-tags");
  allowlistContainer.innerHTML = "";

  for (const item of appState.policy.allowedRecipients) {
    const pill = document.createElement("div");
    pill.className = "allowlist-pill font-mono";
    pill.innerHTML = `
      <span class="pill-check">✓</span>
      <span class="text-main">${item.label}</span>
      <span class="text-subtle">(${item.pubkey.slice(0, 4)}...${item.pubkey.slice(-4)})</span>
    `;
    allowlistContainer.appendChild(pill);
  }
}

// Render Full Transactions Table
function renderTransactions() {
  const tbody = document.getElementById("tx-table-body");
  const countInfo = document.getElementById("ledger-count-info");
  const tabBadge = document.getElementById("tab-tx-badge");
  if (!tbody) return;

  tbody.innerHTML = "";

  let txs = appState.transactions || [];
  if (tabBadge) tabBadge.textContent = `${txs.length}`;

  if (activeFilter === "SETTLED") {
    txs = txs.filter((t) => t.status === "SETTLED");
  } else if (activeFilter === "HITL_PENDING") {
    txs = txs.filter((t) => t.status === "HITL_PENDING");
  } else if (activeFilter === "BLOCKED") {
    txs = txs.filter((t) => t.status === "REJECTED" || t.status === "CIRCUIT_TRIPPED" || t.status === "PAYLOAD_MISMATCH");
  }

  if (countInfo) {
    countInfo.textContent = `${txs.length} transactions shown (${appState.transactions?.length || 0} total) · Click row to inspect audit`;
  }

  for (const tx of txs) {
    const tr = document.createElement("tr");
    tr.className = "row-clickable";
    tr.title = "Click to inspect 4-layer cryptographic audit";
    tr.onclick = () => openInspector(tx.id);

    if (tx._isNew) {
      if (tx.status === "SETTLED") tr.classList.add("row-flash-green");
      else if (tx.status === "HITL_PENDING") tr.classList.add("row-flash-amber");
      else tr.classList.add("row-flash-red");
      delete tx._isNew;
    }

    let statusPill = "";
    if (tx.status === "SETTLED") {
      statusPill = '<span class="status-pill pill-settled"><span class="pill-dot"></span>Settled</span>';
    } else if (tx.status === "REJECTED") {
      statusPill = '<span class="status-pill pill-blocked"><span class="pill-dot"></span>Blocked</span>';
    } else if (tx.status === "HITL_PENDING") {
      statusPill = '<span class="status-pill pill-review"><span class="pill-dot"></span>Review</span>';
    } else if (tx.status === "CIRCUIT_TRIPPED") {
      statusPill = '<span class="status-pill pill-blocked"><span class="pill-dot"></span>Frozen</span>';
    } else if (tx.status === "PAYLOAD_MISMATCH") {
      statusPill = '<span class="status-pill pill-review"><span class="pill-dot"></span>Mismatch</span>';
    } else {
      statusPill = `<span class="status-pill">${tx.status}</span>`;
    }

    let vectorBadge = "";
    if (tx.id?.startsWith("atk1") || tx.scenario === "ATK-01" || tx.metadata?.threatVector?.includes("Prompt")) {
      vectorBadge = '<span class="vector-badge-pill tag-red font-mono" title="Generated by ATK-01 Prompt Injection">ATK-01</span>';
    } else if (tx.id?.startsWith("atk2") || tx.scenario === "ATK-02" || tx.metadata?.threatVector?.includes("Loop")) {
      vectorBadge = '<span class="vector-badge-pill tag-amber font-mono" title="Generated by ATK-02 Recursive Loop">ATK-02</span>';
    } else if (tx.id?.startsWith("atk3") || tx.scenario === "ATK-03" || tx.metadata?.threatVector?.includes("Substitution") || tx.status === "PAYLOAD_MISMATCH") {
      vectorBadge = '<span class="vector-badge-pill tag-red font-mono" title="Generated by ATK-03 Payload Poisoning">ATK-03</span>';
    } else if (tx.id?.startsWith("hitl") || tx.scenario === "HITL_TRIGGER" || tx.status === "HITL_PENDING") {
      vectorBadge = '<span class="vector-badge-pill tag-amber font-mono" title="Generated by VEC-04 HITL Escalation">VEC-04</span>';
    } else if (tx.id?.startsWith("norm") || tx.scenario === "NORMAL_TX" || tx.status === "SETTLED") {
      vectorBadge = '<span class="vector-badge-pill tag-emerald font-mono" title="Generated by VEC-05 Nominal Settlement">VEC-05</span>';
    }

    const timeStr = new Date(tx.timestamp).toLocaleTimeString();
    const digestPreview = tx.digest ? `${tx.digest.slice(0, 8)}...` : "-";

    tr.innerHTML = `
      <td class="cell-time font-mono">${timeStr}</td>
      <td class="cell-agent font-mono">${tx.agentId}</td>
      <td>
        <div class="cell-recipient">
          <div class="recipient-header-inline">
            <span class="recipient-label">${tx.recipientLabel || "Counterparty"}</span>
            ${vectorBadge}
          </div>
          <span class="recipient-address font-mono">${tx.recipient.slice(0, 12)}...</span>
        </div>
      </td>
      <td class="text-right">
        <div class="amount-box font-mono">
          <span class="amount-sol">${tx.amountSol} SOL</span>
          <span class="amount-lamports">${(Number(tx.amountLamports) / 1000).toLocaleString()}k lamports</span>
        </div>
      </td>
      <td>
        <span class="hash-badge font-mono" title="${tx.digest}">${digestPreview}</span>
      </td>
      <td class="text-right">
        ${statusPill}
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// Render Overview Quick Table (Top 4)
function renderOverviewTransactions() {
  const tbody = document.getElementById("overview-tx-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const txs = (appState.transactions || []).slice(0, 4);
  for (const tx of txs) {
    const tr = document.createElement("tr");
    tr.className = "row-clickable";
    tr.onclick = () => openInspector(tx.id);

    let statusPill = "";
    if (tx.status === "SETTLED") {
      statusPill = '<span class="status-pill pill-settled"><span class="pill-dot"></span>Settled</span>';
    } else if (tx.status === "REJECTED" || tx.status === "CIRCUIT_TRIPPED") {
      statusPill = '<span class="status-pill pill-blocked"><span class="pill-dot"></span>Blocked</span>';
    } else if (tx.status === "HITL_PENDING") {
      statusPill = '<span class="status-pill pill-review"><span class="pill-dot"></span>Review</span>';
    } else {
      statusPill = `<span class="status-pill">${tx.status}</span>`;
    }

    const timeStr = new Date(tx.timestamp).toLocaleTimeString();
    const digestPreview = tx.digest ? `${tx.digest.slice(0, 8)}...` : "-";

    tr.innerHTML = `
      <td class="cell-time font-mono">${timeStr}</td>
      <td class="cell-agent font-mono">${tx.agentId}</td>
      <td><span class="recipient-label">${tx.recipientLabel || "Counterparty"}</span></td>
      <td class="text-right font-mono text-emerald" style="font-weight:600;">${tx.amountSol} SOL</td>
      <td><span class="hash-badge font-mono">${digestPreview}</span></td>
      <td class="text-right">${statusPill}</td>
    `;
    tbody.appendChild(tr);
  }
}

// =========================================================================
// Real-Time Canvas Velocity Chart
// =========================================================================
function drawVelocityChart() {
  const canvas = document.getElementById("velocity-chart");
  if (!canvas || activeTab !== "overview") return;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const gridColor = isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.04)";
  const emeraldColor = isLight ? "#059669" : "#10B981";
  const slateLineColor = isLight ? "rgba(100, 116, 139, 0.6)" : "rgba(148, 163, 184, 0.4)";

  // Grid Lines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let y = 30; y < height; y += 35) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Draw Outflow Waveform (Emerald / Mint)
  const maxVal = Math.max(0.08, ...chartOutflowData);
  const stepX = width / (CHART_POINTS - 1);

  // Gradient under Outflow Curve
  const gradEmerald = ctx.createLinearGradient(0, 0, 0, height);
  gradEmerald.addColorStop(0, isLight ? "rgba(5, 150, 105, 0.18)" : "rgba(16, 185, 129, 0.18)");
  gradEmerald.addColorStop(1, "rgba(16, 185, 129, 0.0)");

  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let i = 0; i < CHART_POINTS; i++) {
    const x = i * stepX;
    const y = height - (chartOutflowData[i] / maxVal) * (height - 40) - 20;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = gradEmerald;
  ctx.fill();

  // Outflow Line
  ctx.beginPath();
  ctx.strokeStyle = emeraldColor;
  ctx.lineWidth = 2;
  for (let i = 0; i < CHART_POINTS; i++) {
    const x = i * stepX;
    const y = height - (chartOutflowData[i] / maxVal) * (height - 40) - 20;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Draw Velocity Frequency Line (Slate)
  ctx.beginPath();
  ctx.strokeStyle = slateLineColor;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  for (let i = 0; i < CHART_POINTS; i++) {
    const x = i * stepX;
    const y = height - (chartVelocityData[i] / 4) * (height - 50) - 15;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// Push periodic simulated jitter to chart if idle
setInterval(() => {
  if (activeTab === "overview") {
    chartOutflowData.shift();
    const last = chartOutflowData[chartOutflowData.length - 1] || 0.01;
    const jitter = Math.max(0.002, Math.min(0.045, last + (Math.random() - 0.5) * 0.005));
    chartOutflowData.push(jitter);

    chartVelocityData.shift();
    chartVelocityData.push(Math.floor(Math.random() * 2) + 1);

    drawVelocityChart();
  }
}, 1500);

// =========================================================================
// HITL Queue & Live Countdown
// =========================================================================
function renderHITLQueue() {
  const container = document.getElementById("hitl-queue-container");
  const badge = document.getElementById("hitl-queue-badge");
  const tabBadge = document.getElementById("tab-hitl-badge");

  const pendingTickets = (appState?.tickets || []).filter((t) => t.status === "PENDING");
  if (badge) badge.textContent = `${pendingTickets.length}`;
  if (tabBadge) tabBadge.textContent = `${pendingTickets.length}`;

  if (!container) return;

  const isFrozen = appState?.vault?.isFrozen;

  if (pendingTickets.length === 0) {
    container.innerHTML = `
      <div class="empty-tray">
        <div class="empty-icon-wrap">⚡</div>
        <p class="empty-title">Approval Queue is Clear</p>
        <p class="empty-desc">
          AgentPay Guard allows autonomous transactions up to <strong>0.050 SOL</strong>.
          When an agent requests an out-of-bounds spend (&gt; 0.050 SOL), it is suspended here for human operator Ed25519 authorization.
        </p>
        ${isFrozen ? `
          <div class="hitl-frozen-alert">
            <span>⚠ Vault is currently frozen by Sentinel.</span>
            <button class="btn-reset-micro" onclick="resetCircuitBreaker()">Reset Circuit</button>
          </div>
        ` : `
          <button class="btn-trigger-hitl" onclick="triggerSimulation('HITL_TRIGGER')">
            ⚡ Trigger Test Escalation (0.085 SOL)
          </button>
        `}
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  for (const ticket of pendingTickets) {
    const now = Math.floor(Date.now() / 1000);
    const remainingSec = Math.max(0, ticket.expiresAtUnix - now);
    const isUrgent = remainingSec > 0 && remainingSec <= 30;
    const progressPct = Math.min(100, Math.max(0, (remainingSec / 180) * 100));

    const card = document.createElement("div");
    card.className = "ticket-card";
    card.innerHTML = `
      <div class="ticket-card-top font-mono">
        <span class="ticket-amount text-emerald">${formatSol(ticket.amountLamports)} SOL</span>
        <span class="ticket-timer ${isUrgent ? 'urgent' : ''}">
          ${remainingSec > 0 ? `Expires in ${remainingSec}s` : 'EXPIRED'}
        </span>
      </div>
      <div class="progress-track" style="height: 3px; margin: 4px 0 6px 0;">
        <div class="progress-fill fill-emerald" style="width: ${progressPct}%;"></div>
      </div>
      <div class="ticket-meta">
        <div>Agent: <span class="text-main font-mono">${ticket.agentId}</span></div>
        <div>Reason: ${ticket.reason}</div>
        <div>Recipient: <code class="font-mono text-muted">${ticket.recipient.slice(0, 16)}...</code></div>
      </div>
      <div class="ticket-buttons">
        <button class="btn-approve" ${remainingSec <= 0 ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''} onclick="approveTicket('${ticket.ticketId}')">
          Approve (Ed25519)
        </button>
        <button class="btn-reject" onclick="rejectTicket('${ticket.ticketId}')">
          Reject
        </button>
      </div>
    `;
    container.appendChild(card);
  }
}

// Render Incidents
function renderIncidents() {
  const container = document.getElementById("overview-incidents-container");
  if (!container) return;
  const incidents = appState.sentinel.incidents || [];

  if (incidents.length === 0) {
    container.innerHTML = `<p class="empty-state-text">No incidents recorded</p>`;
    return;
  }

  container.innerHTML = "";
  for (const inc of incidents.slice(0, 3)) {
    const card = document.createElement("div");
    card.className = "incident-card";
    const timeStr = new Date(inc.timestamp).toLocaleTimeString();

    card.innerHTML = `
      <div class="incident-head">
        <span class="text-red font-mono">${inc.incidentType}</span>
        <span class="text-subtle font-mono text-xs">${timeStr}</span>
      </div>
      <div class="incident-msg">${inc.reason}</div>
    `;
    container.appendChild(card);
  }
}

// =========================================================================
// Transaction Inspector Drawer Engine
// =========================================================================
function openInspector(txId) {
  if (!appState || !appState.transactions) return;
  const tx = appState.transactions.find((t) => t.id === txId);
  if (!tx) return;

  const overlay = document.getElementById("inspector-overlay");
  if (!overlay) return;

  const statusBadge = document.getElementById("insp-status-badge");
  statusBadge.className = `status-pill pill-${tx.status.toLowerCase().replace(/_/g, '-')}`;
  statusBadge.innerHTML = `<span class="pill-dot"></span>${tx.status}`;

  document.getElementById("insp-tx-id").textContent = tx.id;
  document.getElementById("insp-recipient-label").textContent = tx.recipientLabel || "Counterparty";

  const vecBadge = document.getElementById("insp-vector-badge");
  const scenarioHint = document.getElementById("insp-scenario-hint");

  let vectorTag = "TX";
  let vectorTagClass = "tag-settled";
  let vectorDesc = tx.metadata?.threatVector || tx.notes || "Autonomous Agent Transaction";

  if (tx.id?.startsWith("atk1") || tx.scenario === "ATK-01" || tx.metadata?.threatVector?.includes("Prompt")) {
    vectorTag = "ATK-01";
    vectorTagClass = "tag-red";
    vectorDesc = "Adversarial Prompt Injection Treasury Drain (Jailbreak Attempt)";
  } else if (tx.id?.startsWith("atk2") || tx.scenario === "ATK-02" || tx.metadata?.threatVector?.includes("Loop")) {
    vectorTag = "ATK-02";
    vectorTagClass = "tag-amber";
    vectorDesc = "Infinite Reasoning Loop (Tool Recursion Exception)";
  } else if (tx.id?.startsWith("atk3") || tx.scenario === "ATK-03" || tx.status === "PAYLOAD_MISMATCH") {
    vectorTag = "ATK-03";
    vectorTagClass = "tag-red";
    vectorDesc = "Resource Substitution & MITM Compute Poisoning";
  } else if (tx.id?.startsWith("hitl") || tx.scenario === "HITL_TRIGGER" || tx.status === "HITL_PENDING") {
    vectorTag = "VEC-04";
    vectorTagClass = "tag-amber";
    vectorDesc = "High-Value Spend Escalation (Exceeds 0.05 SOL Autonomous Cap)";
  } else if (tx.id?.startsWith("norm") || tx.scenario === "NORMAL_TX" || tx.status === "SETTLED") {
    vectorTag = "VEC-05";
    vectorTagClass = "tag-emerald";
    vectorDesc = "Verified Autonomous Micropayment Settlement via Vault PDA";
  }

  if (vecBadge) {
    vecBadge.className = `vector-badge-pill ${vectorTagClass} font-mono`;
    vecBadge.textContent = vectorTag;
  }
  if (scenarioHint) {
    scenarioHint.textContent = `Origin Vector: ${vectorDesc}`;
  }

  // 4-Layer Security Audit Pipeline Step Cards
  const l1Step = document.getElementById("audit-step-l1");
  const l1Desc = document.getElementById("audit-l1-desc");
  const l1Icon = document.getElementById("audit-l1-icon");

  const l2Step = document.getElementById("audit-step-l2");
  const l2Desc = document.getElementById("audit-l2-desc");
  const l2Icon = document.getElementById("audit-l2-icon");

  const l3Step = document.getElementById("audit-step-l3");
  const l3Desc = document.getElementById("audit-l3-desc");
  const l3Icon = document.getElementById("audit-l3-icon");

  const l4Step = document.getElementById("audit-step-l4");
  const l4Desc = document.getElementById("audit-l4-desc");
  const l4Icon = document.getElementById("audit-l4-icon");

  [l1Step, l2Step, l3Step, l4Step].forEach((s) => s.className = "audit-step");

  if (tx.status === "PAYLOAD_MISMATCH") {
    l1Step.className = "audit-step fail";
    l1Desc.textContent = "Hash Mismatch: Response payload tampered by provider";
    l1Icon.textContent = "✕";

    l2Step.className = "audit-step pass";
    l2Desc.textContent = "Velocity parameters nominal";
    l2Icon.textContent = "✓";

    l3Step.className = "audit-step pass";
    l3Desc.textContent = "Recipient and limit passed";
    l3Icon.textContent = "✓";

    l4Step.className = "audit-step fail";
    l4Desc.textContent = "Settlement aborted to prevent poisoning";
    l4Icon.textContent = "✕";
  } else if (tx.status === "CIRCUIT_TRIPPED") {
    l1Step.className = "audit-step pass";
    l1Desc.textContent = "Intent bound to schema";
    l1Icon.textContent = "✓";

    l2Step.className = "audit-step fail";
    l2Desc.textContent = tx.notes || "Recursive loop detected or velocity breached";
    l2Icon.textContent = "✕";

    l3Step.className = "audit-step fail";
    l3Desc.textContent = "Execution halted by Sentinel";
    l3Icon.textContent = "✕";

    l4Step.className = "audit-step fail";
    l4Desc.textContent = "Vault PDA Frozen on Solana";
    l4Icon.textContent = "✕";
  } else if (tx.status === "REJECTED") {
    l1Step.className = "audit-step pass";
    l1Desc.textContent = "Intent bound";
    l1Icon.textContent = "✓";

    l2Step.className = "audit-step pass";
    l2Desc.textContent = "Velocity nominal";
    l2Icon.textContent = "✓";

    l3Step.className = "audit-step fail";
    l3Desc.textContent = tx.notes || "Policy violation: Recipient not allowed or cap exceeded";
    l3Icon.textContent = "✕";

    l4Step.className = "audit-step fail";
    l4Desc.textContent = "Settlement blocked";
    l4Icon.textContent = "✕";
  } else if (tx.status === "HITL_PENDING") {
    l1Step.className = "audit-step pass";
    l1Desc.textContent = "Intent bound";
    l1Icon.textContent = "✓";

    l2Step.className = "audit-step pass";
    l2Desc.textContent = "Velocity normal";
    l2Icon.textContent = "✓";

    l3Step.className = "audit-step warn";
    l3Desc.textContent = "Exceeds autonomous limit. Escalated to HITL queue.";
    l3Icon.textContent = "!";

    l4Step.className = "audit-step warn";
    l4Desc.textContent = "Awaiting operator Ed25519 authorization signature";
    l4Icon.textContent = "⏳";
  } else {
    // Settled
    l1Step.className = "audit-step pass";
    l1Desc.textContent = "RFC 8785 SHA-256 Digest Verified";
    l1Icon.textContent = "✓";

    l2Step.className = "audit-step pass";
    l2Desc.textContent = "Velocity & Loop Limits Clear";
    l2Icon.textContent = "✓";

    l3Step.className = "audit-step pass";
    l3Desc.textContent = "Allowlist & Spending Ceilings Approved";
    l3Icon.textContent = "✓";

    l4Step.className = "audit-step pass";
    l4Desc.textContent = "Settled via Vault PDA & ExecutionReceipt Logged";
    l4Icon.textContent = "✓";
  }

  // Parameters
  document.getElementById("insp-amount").textContent = `${tx.amountSol} SOL (${Number(tx.amountLamports).toLocaleString()} lamports)`;
  document.getElementById("insp-agent").textContent = tx.agentId;
  document.getElementById("insp-endpoint").textContent = tx.metadata?.endpoint || "/api/service";
  document.getElementById("insp-signature").textContent = tx.signature || "-";

  // PayBind Hashes
  const expectedHash = tx.metadata?.expectedPayloadHash || tx.digest || "e3b0c442...";
  document.getElementById("insp-expected-hash").textContent = expectedHash;

  const deliveredRow = document.getElementById("insp-delivered-hash-row");
  const hashAlert = document.getElementById("insp-hash-diff-alert");

  if (tx.metadata?.deliveredPayloadHash && tx.metadata.deliveredPayloadHash !== expectedHash) {
    deliveredRow.classList.remove("hidden");
    document.getElementById("insp-delivered-hash").textContent = tx.metadata.deliveredPayloadHash;
    hashAlert.className = "hash-alert mismatch font-mono";
    hashAlert.innerHTML = `CRITICAL HASH MISMATCH: Delivered hash diverged from expected payload. Response poisoned!`;
    hashAlert.classList.remove("hidden");
  } else {
    deliveredRow.classList.add("hidden");
    hashAlert.classList.add("hidden");
  }

  // JSON viewer
  const jsonViewer = document.getElementById("insp-json-payload");
  if (tx.metadata?.servicePayload) {
    jsonViewer.textContent = JSON.stringify(tx.metadata.servicePayload, null, 2);
  } else {
    jsonViewer.textContent = JSON.stringify({ recipient: tx.recipient, amountLamports: tx.amountLamports }, null, 2);
  }

  // Notes
  document.getElementById("insp-notes").textContent = tx.notes || "Validated by AgentPay Guard security kernel.";

  overlay.classList.remove("hidden");
}

function closeInspector() {
  const overlay = document.getElementById("inspector-overlay");
  if (overlay) overlay.classList.add("hidden");
}

function handleOverlayClick(event) {
  if (event.target.id === "inspector-overlay") {
    closeInspector();
  }
}

// =========================================================================
// Emergency Circuit Breaker & Operations
// =========================================================================
async function resetCircuitBreaker() {
  try {
    const res = await fetch("/api/action/unfreeze", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      updateDiagnostics("Manual Override", "Sentinel Circuit Breaker", "CIRCUIT_RESTORED", "settled");
      logTerminal("Circuit manually reset by authorized operator. Operations restored.", "RESTORED", "settled", "SYS");
      showToast("Circuit reset. Operations restored.", "success");
      fetchState();
    }
  } catch (err) {
    showToast(`Reset error: ${err.message}`, "error");
  }
}

async function toggleCircuitBreaker() {
  if (!appState) return;
  const isFrozen = appState.vault.isFrozen;
  const endpoint = isFrozen ? "/api/action/unfreeze" : "/api/action/freeze";

  try {
    const res = await fetch(endpoint, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      if (isFrozen) {
        updateDiagnostics("Manual Override", "Sentinel Circuit Breaker", "OPERATIONS_ACTIVE", "settled");
        logTerminal("Vault unfreezed. Autonomous disbursements resumed.", "RESTORED", "settled", "SYS");
        showToast("Vault unfreezed", "success");
      } else {
        updateDiagnostics("Manual Freeze", "Sentinel Circuit Breaker", "ALL_DRAINS_FROZEN", "sentinel");
        logTerminal("Emergency freeze activated by security operator. All PDA outflows halted.", "FROZEN", "sentinel", "SYS");
        showToast("Vault Emergency Frozen", "error");
      }
      fetchState();
    }
  } catch (err) {
    logTerminal(`Error updating circuit state: ${err.message}`, "ERROR", "blocked", "SYS");
  }
}

async function approveTicket(ticketId) {
  try {
    const res = await fetch("/api/action/hitl/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId }),
    });
    const data = await res.json();
    if (data.success) {
      updateDiagnostics("HITL Approval", "Ed25519 Signer Protocol", "SETTLED_ON_CHAIN", "settled");
      logTerminal(`Ticket ${ticketId.slice(0, 8)} approved. Settled: ${data.result.signature?.slice(0, 16)}...`, "SETTLED", "settled", "SYS");
      showToast("Approved & Settled on Solana Devnet!", "success");
      fetchState();
    } else {
      updateDiagnostics("HITL Approval", "Ed25519 Signer Protocol", "APPROVAL_FAILED", "blocked");
      logTerminal(`Approval failed for ticket ${ticketId.slice(0, 8)}: ${data.error}`, "FAILED", "blocked", "SYS");
      showToast(`Approval failed: ${data.error}`, "error");
    }
  } catch (err) {
    logTerminal(`Approval error: ${err.message}`, "ERROR", "blocked", "SYS");
    showToast(`Error: ${err.message}`, "error");
  }
}

async function rejectTicket(ticketId) {
  try {
    const res = await fetch("/api/action/hitl/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, reason: "Manual rejection by operator" }),
    });
    const data = await res.json();
    if (data.success) {
      updateDiagnostics("HITL Rejection", "Operator Intervention", "TICKET_REJECTED", "blocked");
      logTerminal(`Ticket ${ticketId.slice(0, 8)} rejected by operator. Disbursement cancelled.`, "BLOCKED", "blocked", "SYS");
      showToast("Ticket rejected by operator", "info");
      fetchState();
    }
  } catch (err) {
    logTerminal(`Reject error: ${err.message}`, "ERROR", "blocked", "SYS");
  }
}

async function triggerSimulation(scenario) {
  try {
    const res = await fetch("/api/action/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario }),
    });
    const data = await res.json();

    if (scenario === "ATK-01") {
      updateDiagnostics("ATK-01 (Prompt Injection)", "Layer 3 Deterministic Allowlist", "DISBURSEMENT_BLOCKED", "blocked");
      logTerminal("Prompt injection drain intercepted. Attacker wallet not in allowlist.", "BLOCKED", "blocked", "SIM");
      showToast("ATK-01 Intercepted: Allowlist violation blocked", "error");
    } else if (scenario === "ATK-02") {
      updateDiagnostics("ATK-02 (Reasoning Loop)", "Layer 2 LRU Ring Buffer", "CIRCUIT_TRIPPED", "sentinel");
      logTerminal("Recursive tool execution loop tripped LRU threshold (3 rep / 30s). Vault frozen.", "SENTINEL", "sentinel", "SIM");
      showToast("ATK-02 Intercepted: Sentinel tripped circuit breaker", "warning");
    } else if (scenario === "ATK-03") {
      updateDiagnostics("ATK-03 (Payload Tampering)", "Layer 1 PayBind RFC 8785", "SETTLEMENT_REJECTED", "blocked");
      logTerminal("PayBind SHA-256 digest mismatch. Tampered weights rejected before release.", "BLOCKED", "blocked", "SIM");
      showToast("ATK-03 Intercepted: PayBind hash mismatch", "error");
    } else if (scenario === "HITL_TRIGGER") {
      updateDiagnostics("VEC-04 (High-Value Spend)", "Layer 3 Out-of-Bounds Policy", "ESCALATED_TO_HITL", "hitl");
      logTerminal("0.085 SOL spend exceeds 0.050 SOL autonomous cap. Escalated to HITL queue.", "HITL", "hitl", "SIM");
      showToast("VEC-04 Escalated: Requires operator signature in HITL tab", "warning");
    } else if (scenario === "NORMAL_TX") {
      updateDiagnostics("VEC-05 (Oracle Query)", "Layer 4 Solana Financial Hub", "SETTLED_ON_CHAIN", "settled");
      logTerminal("0.005 SOL micropayment verified and settled atomically via Vault PDA.", "SETTLED", "settled", "SIM");
      showToast("VEC-05 Settled: Micropayment confirmed on Solana Devnet", "success");
    }

    await fetchState();
    setTimeout(() => {
      const firstRow = document.querySelector("#tx-table-body tr:first-child");
      if (firstRow) {
        firstRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 120);
  } catch (err) {
    updateDiagnostics("Simulation Error", "Kernel Exception", "FAILED", "blocked");
    logTerminal(`Simulation error: ${err.message}`, "ERROR", "blocked", "SIM");
    showToast(`Simulation error: ${err.message}`, "error");
  }
}

// Auto-refresh countdown timers every second
setInterval(() => {
  if (appState && appState.tickets?.length > 0) {
    renderHITLQueue();
  }
}, 1000);

// Initialize on page load
window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  renderLogs();
  fetchState();
  connectSSE();
});
