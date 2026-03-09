/**
 * FreeCut — Auto-Updater Module
 *
 * Wraps electron-updater to handle:
 *   - Automatic update checks on launch (if enabled)
 *   - Periodic background checks (every 4 hours)
 *   - Manual check / download / install triggered from UI
 *   - Event forwarding to renderer via IPC
 *
 * Update preference is stored via simple JSON file since electron-store
 * is ESM-only in recent versions.
 */

const { autoUpdater } = require("electron-updater");
const { ipcMain, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

// ── Settings persistence ───────────────────────────────────────

const SETTINGS_PATH = path.join(
  require("electron").app.getPath("userData"),
  "updater-settings.json",
);

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    }
  } catch {
    /* corrupt file, use defaults */
  }
  return { autoUpdate: true }; // Auto-update ON by default
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error("[Updater] Failed to save settings:", err.message);
  }
}

// ── State ──────────────────────────────────────────────────────

let settings = loadSettings();
let checkInterval = null;

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ── Helpers ────────────────────────────────────────────────────

function sendToRenderer(event) {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    try {
      win.webContents.send("updater:event", event);
    } catch {
      /* window may be closing */
    }
  }
}

// ── Setup ──────────────────────────────────────────────────────

function setupUpdater() {
  // Configure
  autoUpdater.autoDownload = false; // User decides when to download
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  // ── Events → forward to renderer ────────────────────────────

  autoUpdater.on("checking-for-update", () => {
    console.log("[Updater] Checking for update...");
    sendToRenderer({ type: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[Updater] Update available: ${info.version}`);
    sendToRenderer({
      type: "available",
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });

    // Auto-download if user has auto-update enabled
    if (settings.autoUpdate) {
      console.log("[Updater] Auto-downloading update...");
      autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log(`[Updater] Up to date (${info.version})`);
    sendToRenderer({
      type: "not-available",
      version: info.version,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer({
      type: "download-progress",
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[Updater] Update downloaded: ${info.version}`);
    sendToRenderer({
      type: "downloaded",
      version: info.version,
    });
  });

  autoUpdater.on("error", (err) => {
    console.error("[Updater] Error:", err.message);
    sendToRenderer({
      type: "error",
      message: err.message,
    });
  });

  // ── IPC handlers ────────────────────────────────────────────

  ipcMain.handle("updater:get-version", () => {
    return require("electron").app.getVersion();
  });

  ipcMain.handle("updater:check", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, version: result?.updateInfo?.version };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("updater:download", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("updater:install", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle("updater:set-auto-update", (_event, enabled) => {
    settings.autoUpdate = !!enabled;
    saveSettings(settings);
    console.log(`[Updater] Auto-update set to: ${settings.autoUpdate}`);
    return settings.autoUpdate;
  });

  ipcMain.handle("updater:get-auto-update", () => {
    return settings.autoUpdate;
  });

  // ── Periodic checks ─────────────────────────────────────────

  // Check on launch (after a short delay to let the window load)
  setTimeout(() => {
    if (settings.autoUpdate) {
      autoUpdater.checkForUpdates().catch(() => {});
    }
  }, 10_000); // 10s after launch

  // Check every 4 hours
  checkInterval = setInterval(() => {
    if (settings.autoUpdate) {
      autoUpdater.checkForUpdates().catch(() => {});
    }
  }, CHECK_INTERVAL_MS);
}

function teardownUpdater() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

module.exports = { setupUpdater, teardownUpdater };
