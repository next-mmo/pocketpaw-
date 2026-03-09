/**
 * Type declarations for the Electron auto-updater bridge.
 *
 * The `electronUpdater` object is exposed via contextBridge in preload.cjs.
 * When running in a plain browser (no Electron), `window.electronUpdater`
 * is undefined — all consumers must check for existence first.
 */

export interface UpdateEvent {
  type:
    | "checking"
    | "available"
    | "not-available"
    | "download-progress"
    | "downloaded"
    | "error";
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  message?: string;
}

export interface ElectronUpdater {
  isElectron: true;
  getVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{
    success: boolean;
    version?: string;
    error?: string;
  }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  quitAndInstall: () => void;
  setAutoUpdate: (enabled: boolean) => Promise<boolean>;
  getAutoUpdate: () => Promise<boolean>;
  onUpdateEvent: (callback: (event: UpdateEvent) => void) => () => void;
}

declare global {
  interface Window {
    electronUpdater?: ElectronUpdater;
  }
}

/** Helper: check if we're running inside Electron desktop app */
export function isElectronApp(): boolean {
  return !!window.electronUpdater?.isElectron;
}
