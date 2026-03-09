/**
 * FreeCut — Electron Preload Script
 *
 * Exposes a safe bridge between the Electron main process and the
 * renderer (React app) using contextBridge. This allows the frontend
 * to receive auto-update events and control update behavior without
 * enabling nodeIntegration.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronUpdater", {
  // ── Queries ──────────────────────────────────────────────────
  /** Check if running inside Electron (vs. plain browser) */
  isElectron: true,

  /** Get the current app version */
  getVersion: () => ipcRenderer.invoke("updater:get-version"),

  // ── Commands ─────────────────────────────────────────────────
  /** Manually trigger an update check */
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),

  /** Download the available update */
  downloadUpdate: () => ipcRenderer.invoke("updater:download"),

  /** Quit and install the downloaded update */
  quitAndInstall: () => ipcRenderer.invoke("updater:install"),

  /** Set auto-update preference (persisted in electron-store) */
  setAutoUpdate: (enabled) =>
    ipcRenderer.invoke("updater:set-auto-update", enabled),

  /** Get current auto-update preference */
  getAutoUpdate: () => ipcRenderer.invoke("updater:get-auto-update"),

  // ── Event listeners ──────────────────────────────────────────
  /** Listen for update events from the main process */
  onUpdateEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("updater:event", handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener("updater:event", handler);
  },
});
