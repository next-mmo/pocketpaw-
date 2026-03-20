import { create } from "zustand";

// ─── API helpers ────────────────────────────────────────────

function getApiBase(): string {
  try {
    if (window.parent !== window) {
      return window.parent.location.origin;
    }
  } catch {
    /* cross-origin */
  }
  return window.location.origin;
}

export const API_BASE = getApiBase();
export const PLUGIN_ID = "agent-cli";

async function pluginApi(path: string, body?: Record<string, unknown>) {
  const url = `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/proxy${path}`;
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ─── Types ──────────────────────────────────────────────────

interface SkillItem {
  name: string;
  description: string;
}

interface WorkflowItem {
  name: string;
  description: string;
}

interface McpServer {
  type?: string;
  command?: string;
  args?: string[];
  url?: string;
  [key: string]: unknown;
}

interface IdeItem {
  name: string;
  label: string;
  detected: boolean;
  reason: string;
}

interface RcConfig {
  targets: string[];
  scope: string;
  gitignore: boolean;
  mcp: boolean;
  rootFiles: string[];
}

interface StatusData {
  global: { skills: SkillItem[]; workflows: WorkflowItem[] };
  workspace: {
    skills: SkillItem[];
    workflows: WorkflowItem[];
    mcpServers: Record<string, McpServer>;
  };
  ides: IdeItem[];
  rc: { config: RcConfig; filePath: string | null };
}

interface InitResult {
  created: string[];
  skipped: string[];
}

interface SyncFileResult {
  path: string;
  action: string;
}

interface SyncTargetResult {
  target: string;
  scope: string;
  files: SyncFileResult[];
  gitignore?: boolean;
}

interface SyncResult {
  rootFiles: { file: string; action: string }[];
  targets: SyncTargetResult[];
  dryRun: boolean;
}

interface ConvertResult {
  from: string;
  scope: string;
  created: string[];
  skipped: string[];
  dryRun: boolean;
  error?: string;
}

interface BrowseResult {
  path: string;
  parent: string;
  items: { name: string; isDirectory: boolean; path: string }[];
}

// ─── Store ──────────────────────────────────────────────────

interface AppState {
  pluginStatus: string;
  setPluginStatus: (s: string) => void;

  cwd: string;
  setCwd: (p: string) => void;

  status: StatusData | null;
  statusLoading: boolean;
  fetchStatus: () => Promise<void>;

  initResult: InitResult | null;
  initLoading: boolean;
  runInit: (force?: boolean) => Promise<void>;

  syncResult: SyncResult | null;
  syncLoading: boolean;
  runSync: (target?: string, scope?: string, dryRun?: boolean) => Promise<void>;

  convertResult: ConvertResult | null;
  convertLoading: boolean;
  runConvert: (from?: string, scope?: string, dryRun?: boolean) => Promise<void>;

  browseResult: BrowseResult | null;
  browseLoading: boolean;
  browse: (path?: string) => Promise<void>;

  addMcpServer: (name: string, server: McpServer, scope?: string) => Promise<void>;
  removeMcpServer: (name: string, scope?: string) => Promise<void>;

  homeDir: string;
  fetchHome: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  pluginStatus: "unknown",
  setPluginStatus: (s) => set({ pluginStatus: s }),

  cwd: "",
  setCwd: (p) => set({ cwd: p }),

  status: null,
  statusLoading: false,
  fetchStatus: async () => {
    set({ statusLoading: true });
    try {
      const data = await pluginApi("/api/status", { cwd: get().cwd || undefined });
      set({ status: data, statusLoading: false });
    } catch (err) {
      console.error("Failed to fetch status:", err);
      set({ statusLoading: false });
    }
  },

  initResult: null,
  initLoading: false,
  runInit: async (force = false) => {
    set({ initLoading: true, initResult: null });
    try {
      const data = await pluginApi("/api/init", { cwd: get().cwd || undefined, force });
      set({ initResult: data, initLoading: false });
      get().fetchStatus();
    } catch (err) {
      console.error("Failed to init:", err);
      set({ initLoading: false });
    }
  },

  syncResult: null,
  syncLoading: false,
  runSync: async (target = "all", scope?: string, dryRun = false) => {
    set({ syncLoading: true, syncResult: null });
    try {
      const body: Record<string, unknown> = { cwd: get().cwd || undefined, target, dryRun };
      if (scope) body.scope = scope;
      const data = await pluginApi("/api/sync", body);
      set({ syncResult: data, syncLoading: false });
      if (!dryRun) get().fetchStatus();
    } catch (err) {
      console.error("Failed to sync:", err);
      set({ syncLoading: false });
    }
  },

  convertResult: null,
  convertLoading: false,
  runConvert: async (from = "cursor", scope = "workspace", dryRun = false) => {
    set({ convertLoading: true, convertResult: null });
    try {
      const data = await pluginApi("/api/convert", { cwd: get().cwd || undefined, from, scope, dryRun });
      set({ convertResult: data, convertLoading: false });
      if (!dryRun) get().fetchStatus();
    } catch (err) {
      console.error("Failed to convert:", err);
      set({ convertLoading: false });
    }
  },

  browseResult: null,
  browseLoading: false,
  browse: async (path?: string) => {
    set({ browseLoading: true });
    try {
      const data = await pluginApi("/api/browse", { path });
      set({ browseResult: data, browseLoading: false });
    } catch (err) {
      console.error("Failed to browse:", err);
      set({ browseLoading: false });
    }
  },

  addMcpServer: async (name, server, scope = "workspace") => {
    await pluginApi("/api/mcp/add", { cwd: get().cwd || undefined, name, server, scope });
    get().fetchStatus();
  },

  removeMcpServer: async (name, scope = "workspace") => {
    await pluginApi("/api/mcp/remove", { cwd: get().cwd || undefined, name, scope });
    get().fetchStatus();
  },

  homeDir: "",
  fetchHome: async () => {
    try {
      const data = await pluginApi("/api/home");
      set({ homeDir: data.home, cwd: get().cwd || data.cwd });
    } catch (err) {
      console.error("Failed to fetch home:", err);
    }
  },
}));
