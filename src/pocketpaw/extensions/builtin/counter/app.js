/**
 * Counter Extension — app.js
 *
 * Demonstrates the core PocketPaw Extension SDK patterns:
 *   1. sdk.ready()         → handshake with host
 *   2. sdk.storage.get()   → read persisted data
 *   3. sdk.storage.set()   → write persisted data
 *
 * Copy this file as a starting template for your own extensions!
 */

(async function () {
  "use strict";

  // ── DOM References ───────────────────────────────────
  const countEl = document.getElementById("count-value");
  const statusEl = document.getElementById("status");
  const btnInc = document.getElementById("btn-increment");
  const btnDec = document.getElementById("btn-decrement");
  const btnReset = document.getElementById("btn-reset");

  // ── State ────────────────────────────────────────────
  let count = 0;
  let sdk = null;

  // ── Render helper ────────────────────────────────────
  function render() {
    countEl.textContent = count;
    // Quick bump animation
    countEl.classList.add("bump");
    setTimeout(() => countEl.classList.remove("bump"), 150);
  }

  // ── Persist to PocketPaw storage ─────────────────────
  async function save() {
    if (!sdk) return;
    try {
      await sdk.storage.set("count", count);
    } catch (err) {
      console.warn("[Counter] Failed to save:", err);
    }
  }

  // ── Button handlers ──────────────────────────────────
  btnInc.addEventListener("click", () => {
    count++;
    render();
    save();
  });

  btnDec.addEventListener("click", () => {
    count--;
    render();
    save();
  });

  btnReset.addEventListener("click", () => {
    count = 0;
    render();
    save();
  });

  // ── SDK Initialization ───────────────────────────────
  // The SDK is loaded via <script> tag in index.html.
  // sdk.ready() performs the handshake with PocketPaw host.
  try {
    sdk = window.PocketPawExtensionSDK;
    if (!sdk) throw new Error("SDK not found");

    await sdk.ready();

    // Load saved count from extension-scoped storage
    const saved = await sdk.storage.get("count");
    if (saved !== null && saved !== undefined) {
      count = Number(saved) || 0;
    }
    render();

    statusEl.textContent = "Connected to PocketPaw ✓";
    statusEl.className = "status connected";
  } catch (err) {
    console.error("[Counter] SDK init failed:", err);
    statusEl.textContent = "Standalone mode (no PocketPaw host)";
    statusEl.className = "status error";
    render(); // Still works without SDK, just no persistence
  }
})();
