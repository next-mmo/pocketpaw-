import { create } from "zustand";

interface PluginState {
  // Server state
  status: "stopped" | "starting" | "running" | "installing" | "error";
  port: number | null;
  url: string | null;
  error: string | null;
  pid: number | null;
  isInstalled: boolean;
  installProgress: number;

  // Logs
  logs: string[];

  // Actions
  setServerInfo: (info: Partial<PluginState>) => void;
  setLogs: (logs: string[]) => void;
}

// Determine API base URL (parent window or current)
function getApiBase(): string {
  try {
    // In iframe, the parent is the PocketPaw dashboard
    if (window.parent !== window) {
      return window.parent.location.origin;
    }
  } catch {
    // cross-origin
  }
  return window.location.origin;
}

export const API_BASE = getApiBase();
export const PLUGIN_ID = "wan2gp";

export const usePluginStore = create<PluginState>()((set) => ({
  status: "stopped",
  port: null,
  url: null,
  error: null,
  pid: null,
  isInstalled: false,
  installProgress: 0,
  logs: [],

  setServerInfo: (info) => set((s) => ({ ...s, ...info })),
  setLogs: (logs) => set({ logs }),
}));
