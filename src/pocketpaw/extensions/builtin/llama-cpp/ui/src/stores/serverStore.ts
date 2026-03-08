import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ModelFile {
  file: string;
  size_bytes: number;
  size_mb: number;
}

interface ServerState {
  // Server state
  status: "stopped" | "starting" | "running" | "installing" | "error";
  port: number | null;
  url: string | null;
  error: string | null;
  pid: number | null;
  isInstalled: boolean;
  installProgress: number;

  // Models
  models: ModelFile[];
  selectedModel: string;

  // Settings
  nGpuLayers: number;
  contextSize: number;

  // Actions
  setStatus: (status: ServerState["status"]) => void;
  setServerInfo: (info: Partial<ServerState>) => void;
  setModels: (models: ModelFile[]) => void;
  setSelectedModel: (model: string) => void;
  setNGpuLayers: (n: number) => void;
  setContextSize: (n: number) => void;
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
export const PLUGIN_ID = "llama-cpp";

export const useServerStore = create<ServerState>()(
  persist(
    (set) => ({
      status: "stopped",
      port: null,
      url: null,
      error: null,
      pid: null,
      isInstalled: false,
      installProgress: 0,
      models: [],
      selectedModel: "",
      nGpuLayers: -1,
      contextSize: 2048,

      setStatus: (status) => set({ status }),
      setServerInfo: (info) => set((s) => ({ ...s, ...info })),
      setModels: (models) => set({ models }),
      setSelectedModel: (model) => set({ selectedModel: model }),
      setNGpuLayers: (n) => set({ nGpuLayers: n }),
      setContextSize: (n) => set({ contextSize: n }),
    }),
    {
      name: "llama-cpp-server",
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        nGpuLayers: state.nGpuLayers,
        contextSize: state.contextSize,
      }),
    },
  ),
);
