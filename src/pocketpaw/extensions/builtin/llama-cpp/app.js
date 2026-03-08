/* ── Llama.cpp Plugin – App Logic ──
 *
 * Handles:
 *  - GGUF model downloads from Hugging Face
 *  - Server install / start / stop via PocketPaw plugin APIs
 *  - Log streaming
 */

// ── SDK bootstrap (PocketPaw extension SDK is injected by the host) ──
let sdk = null;
let API_BASE = "";
let PLUGIN_ID = "llama-cpp";

// Quick-pick models: small GGUF files for easy testing
const QUICK_MODELS = [
  {
    name: "Qwen2.5-0.5B (Q4_K_M)",
    repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    file: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    size: "397 MB",
    desc: "Tiny but capable – great for testing",
  },
  {
    name: "SmolLM2-360M (Q8_0)",
    repo: "HuggingFaceTB/SmolLM2-360M-Instruct-GGUF",
    file: "smollm2-360m-instruct-q8_0.gguf",
    size: "386 MB",
    desc: "Very small, fast inference",
  },
  {
    name: "TinyLlama-1.1B (Q4_K_M)",
    repo: "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF",
    file: "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
    size: "669 MB",
    desc: "Popular tiny model, good balance",
  },
  {
    name: "Phi-3.5-mini-3.8B (Q4_K_M)",
    repo: "bartowski/Phi-3.5-mini-instruct-GGUF",
    file: "Phi-3.5-mini-instruct-Q4_K_M.gguf",
    size: "2.2 GB",
    desc: "Microsoft small powerhouse",
  },
];

let downloadedModels = [];
let pollTimer = null;

// ── Init ──
window.addEventListener("message", (e) => {
  if (e.data && e.data.type === "pocketpaw-extension:init") {
    sdk = e.data;
    API_BASE = sdk.api_base || `/api/v1/extensions/runtime/${PLUGIN_ID}`;
    init();
  }
});

// If running standalone (not in iframe), init anyway
setTimeout(() => {
  if (!sdk) init();
}, 500);

async function init() {
  renderModelGrid();
  await Promise.all([
    detectCuda(),
    checkPluginStatus(),
    loadDownloadedModels(),
  ]);
  // Poll status every 3s
  pollTimer = setInterval(checkPluginStatus, 3000);
}

// ── Tab switching ──
function switchTab(name) {
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document
    .querySelectorAll(".tab-content")
    .forEach((tc) => tc.classList.toggle("active", tc.id === `tab-${name}`));
  if (name === "logs") refreshLogs();
  if (name === "models") loadDownloadedModels();
}

// ── API helpers ──
function apiHeaders() {
  const h = { "Content-Type": "application/json" };
  if (sdk && sdk.token) h["Authorization"] = `Bearer ${sdk.token}`;
  return h;
}

async function apiFetch(path, opts = {}) {
  opts.headers = { ...apiHeaders(), ...(opts.headers || {}) };
  const resp = await fetch(path, opts);
  if (!resp.ok) {
    const detail = await resp.text().catch(() => resp.statusText);
    throw new Error(`API ${resp.status}: ${detail}`);
  }
  return resp.json();
}

// ── CUDA detection ──
async function detectCuda() {
  try {
    const info = await apiFetch("/api/v1/plugins/cuda");
    const banner = document.getElementById("gpuBanner");
    const gpuInfo = document.getElementById("gpuInfo");
    if (info.available) {
      banner.style.display = "flex";
      gpuInfo.textContent =
        info.summary ||
        `${info.device_name} · ${info.vram_gb} GB · CUDA ${info.cuda_version}`;
    } else {
      banner.style.display = "flex";
      banner.style.background = "rgba(251, 191, 36, 0.1)";
      banner.style.borderColor = "rgba(251, 191, 36, 0.25)";
      banner.querySelector(".gpu-icon").textContent = "⚠️";
      gpuInfo.textContent =
        "No CUDA GPU detected — llama.cpp will run on CPU only";
    }
  } catch (err) {
    console.warn("CUDA detect failed:", err);
  }
}

// ── Plugin status ──
async function checkPluginStatus() {
  try {
    const status = await apiFetch(`/api/v1/plugins/${PLUGIN_ID}/status`);
    updateStatusUI(status);
  } catch {
    updateStatusUI({ status: "stopped", is_installed: false });
  }
}

function updateStatusUI(s) {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  const btnStart = document.getElementById("btnStart");
  const btnStop = document.getElementById("btnStop");
  const btnInstall = document.getElementById("btnInstall");

  dot.className = "status-dot " + s.status;
  const labels = {
    stopped: "Stopped",
    running: "Running",
    starting: "Starting…",
    installing: "Installing…",
    error: "Error",
    stopping: "Stopping…",
  };
  text.textContent = labels[s.status] || s.status;

  // Setup tab checks
  const checkVenv = document.getElementById("checkVenv");
  const checkLlama = document.getElementById("checkLlama");
  if (s.is_installed) {
    checkVenv.textContent = "✓";
    checkVenv.style.color = "var(--green)";
    checkLlama.textContent = "✓";
    checkLlama.style.color = "var(--green)";
  } else {
    checkVenv.textContent = "○";
    checkVenv.style.color = "";
    checkLlama.textContent = "○";
    checkLlama.style.color = "";
  }

  // Button states
  if (btnStart) {
    btnStart.disabled =
      s.status === "running" ||
      s.status === "starting" ||
      s.status === "installing";
  }
  if (btnStop) {
    btnStop.disabled = s.status !== "running" && s.status !== "starting";
  }
  if (btnInstall) {
    btnInstall.disabled = s.status === "installing";
    btnInstall.textContent =
      s.status === "installing"
        ? "Installing…"
        : s.is_installed
          ? "Reinstall"
          : "Install Environment";
  }

  // Install progress
  if (s.status === "installing" && s.install_progress > 0) {
    const prog = document.getElementById("installProgress");
    const fill = document.getElementById("installFill");
    prog.style.display = "block";
    fill.style.width = `${Math.round(s.install_progress * 100)}%`;
  }

  // Server URL
  const urlBox = document.getElementById("serverUrl");
  const urlVal = document.getElementById("serverUrlValue");
  if (s.status === "running" && s.url) {
    urlBox.style.display = "block";
    urlVal.textContent = s.url;
  } else {
    urlBox.style.display = "none";
  }
}

// ── Install ──
async function installPlugin() {
  try {
    document.getElementById("installProgress").style.display = "block";
    document.getElementById("installStatus").textContent = "Starting install…";
    await apiFetch(`/api/v1/plugins/${PLUGIN_ID}/install`, { method: "POST" });
  } catch (err) {
    alert("Install failed: " + err.message);
  }
}

// ── Start / Stop ──
async function startServer() {
  const model = document.getElementById("serverModel").value;
  if (!model) {
    alert("Please select a model first");
    return;
  }

  // Save model choice to extension storage for the start command
  try {
    await apiFetch(`${API_BASE}/storage/selected_model`, {
      method: "PUT",
      body: JSON.stringify({ value: model }),
    });
  } catch {
    /* ignore */
  }

  try {
    await apiFetch(`/api/v1/plugins/${PLUGIN_ID}/start`, { method: "POST" });
  } catch (err) {
    alert("Start failed: " + err.message);
  }
}

async function stopServer() {
  try {
    await apiFetch(`/api/v1/plugins/${PLUGIN_ID}/stop`, { method: "POST" });
  } catch (err) {
    alert("Stop failed: " + err.message);
  }
}

// ── Reset env ──
async function resetEnv() {
  if (!confirm("This will delete the Python environment. Continue?")) return;
  try {
    await apiFetch(`/api/v1/plugins/${PLUGIN_ID}/env`, { method: "DELETE" });
    await checkPluginStatus();
  } catch (err) {
    alert("Reset failed: " + err.message);
  }
}

// ── Logs ──
async function refreshLogs() {
  try {
    const data = await apiFetch(`/api/v1/plugins/${PLUGIN_ID}/logs?tail=300`);
    const output = document.getElementById("logOutput");
    if (data.lines && data.lines.length) {
      output.textContent = data.lines.join("");
    } else {
      output.textContent = "No logs yet. Start the server or install first.";
    }
    if (document.getElementById("autoScroll").checked) {
      output.scrollTop = output.scrollHeight;
    }
  } catch {
    // silently ignore
  }
}

// ══════════════════════════════════════════════════════════════════
//  GGUF Model Downloads
// ══════════════════════════════════════════════════════════════════

function renderModelGrid() {
  const grid = document.getElementById("modelGrid");
  grid.innerHTML = QUICK_MODELS.map(
    (m, i) => `
    <div class="model-card" id="qm-${i}" onclick="quickDownload(${i})">
      <div class="model-info">
        <span class="model-name">${m.name}</span>
        <span class="model-meta">${m.desc}</span>
      </div>
      <span class="model-size">${m.size}</span>
    </div>
  `,
  ).join("");
}

function quickDownload(index) {
  const m = QUICK_MODELS[index];
  document.getElementById("hfRepo").value = m.repo;
  document.getElementById("hfFile").value = m.file;
  downloadModel();
}

async function downloadModel() {
  const repo = document.getElementById("hfRepo").value.trim();
  const file = document.getElementById("hfFile").value.trim();
  if (!repo || !file) {
    alert("Please enter both a HuggingFace repo and filename");
    return;
  }

  const progDiv = document.getElementById("downloadProgress");
  const fileName = document.getElementById("downloadFileName");
  const percent = document.getElementById("downloadPercent");
  const fill = document.getElementById("downloadFill");
  const status = document.getElementById("downloadStatus");

  progDiv.style.display = "block";
  fileName.textContent = file;
  percent.textContent = "0%";
  fill.style.width = "0%";
  fill.style.background = "";
  status.textContent = "Requesting download from server…";

  try {
    // Use the server-side download endpoint (bypasses CORS)
    const resp = await fetch(`/api/v1/plugins/${PLUGIN_ID}/download-model`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ repo, file }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => resp.statusText);
      throw new Error(`Server error: ${detail}`);
    }

    // Read SSE stream for progress
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));

          if (event.event === "start") {
            const totalMB = (event.total / 1048576).toFixed(0);
            status.textContent = `Downloading ${event.file} (${totalMB} MB)…`;
          } else if (event.event === "progress") {
            percent.textContent = `${event.percent}%`;
            fill.style.width = `${event.percent}%`;
            const mbDone = (event.received / 1048576).toFixed(1);
            const mbTotal = (event.total / 1048576).toFixed(1);
            status.textContent = `${mbDone} / ${mbTotal} MB`;
          } else if (event.event === "done") {
            percent.textContent = "100%";
            fill.style.width = "100%";
            const sizeMB = (event.size_bytes / 1048576).toFixed(0);
            status.textContent = `✓ ${event.file} downloaded (${sizeMB} MB)`;
          } else if (event.event === "error") {
            throw new Error(event.detail);
          }
        } catch (parseErr) {
          if (parseErr.message && !parseErr.message.includes("JSON")) {
            throw parseErr;
          }
        }
      }
    }

    await loadDownloadedModels();

    // Mark quick-pick as downloaded
    QUICK_MODELS.forEach((m, i) => {
      if (m.file === file) {
        const card = document.getElementById(`qm-${i}`);
        if (card) card.classList.add("downloaded");
      }
    });
  } catch (err) {
    status.textContent = `❌ Error: ${err.message}`;
    fill.style.background = "var(--red)";
  }
}

async function loadDownloadedModels() {
  try {
    // Use the file-based models list endpoint
    const data = await apiFetch(`/api/v1/plugins/${PLUGIN_ID}/models`);
    downloadedModels = data.models || [];

    // Update model list
    const listEl = document.getElementById("modelList");
    if (downloadedModels.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No models downloaded yet</p>';
    } else {
      listEl.innerHTML = downloadedModels
        .map((m) => {
          const sizeMB = m.size_mb ? `${m.size_mb} MB` : "";
          return `<div class="model-list-item">
          <span class="name">${m.file}</span>
          <span class="size">${sizeMB}</span>
        </div>`;
        })
        .join("");
    }

    // Update server model selector
    const select = document.getElementById("serverModel");
    const currentVal = select.value;
    select.innerHTML =
      '<option value="">— select a downloaded model —</option>';
    downloadedModels.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.file;
      opt.textContent = m.file;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;

    // Mark quick-picks
    QUICK_MODELS.forEach((m, i) => {
      const card = document.getElementById(`qm-${i}`);
      if (card) {
        const isDownloaded = downloadedModels.some((d) => d.file === m.file);
        card.classList.toggle("downloaded", isDownloaded);
      }
    });
  } catch {
    // silently ignore
  }
}
