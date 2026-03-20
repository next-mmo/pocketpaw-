/**
 * Design Builder — Store
 *
 * Zustand store managing:
 * - Design spec (json-render DesignSpec format)
 * - Selection & hover state
 * - Chat messages & AI streaming (via PocketPaw SDK)
 * - Undo/redo history
 * - Saved specs management
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { chatWithAI, pluginApi } from "./sdk";
import {
  getActiveProvider,
  getActiveProviderId,
  setActiveProvider,
  getProviders,
  type ProviderDefinition,
} from "./providers";

// ─── Types ──────────────────────────────────────────────────

export interface DesignElement {
  type: string;
  props: Record<string, any>;
  children?: string[];
}

export interface DesignSpec {
  version: string;
  root: string;
  state: Record<string, any>;
  elements: Record<string, DesignElement>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  spec?: DesignSpec;
  streaming?: boolean;
  applied?: boolean;
}

// ─── Default spec ───────────────────────────────────────────

const DEFAULT_SPEC: DesignSpec = {
  version: "1.0",
  root: "root",
  state: {},
  elements: {
    root: {
      type: "Stack",
      props: {
        direction: "column",
        gap: 16,
        padding: 24,
        background: "#141414",
        minHeight: 400,
      },
      children: ["welcome-card"],
    },
    "welcome-card": {
      type: "Card",
      props: {
        title: "Welcome to Design Builder",
        description:
          'Use the chat to describe a UI and AI will generate it. Or add components from the palette.',
        background: "#1f1f1f",
      },
      children: ["welcome-text", "welcome-btn"],
    },
    "welcome-text": {
      type: "Text",
      props: {
        text: 'Start by asking: "Create a login form" or "Build a settings page"',
        size: 13,
        color: "#888",
      },
    },
    "welcome-btn": {
      type: "Button",
      props: { label: "Start Designing", variant: "default" },
    },
  },
};

// ─── System prompt for AI (dynamically built from active provider) ──

function getDesignSystemPrompt(): string {
  return getActiveProvider().buildSystemPrompt();
}

// ─── History ────────────────────────────────────────────────

interface HistoryEntry {
  spec: DesignSpec;
  timestamp: number;
}

const MAX_HISTORY = 50;

// ─── ID generators ──────────────────────────────────────────

let msgCounter = 0;
function makeId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

let elementCounter = 0;
function makeElementId(type: string): string {
  return `${type.toLowerCase()}-${Date.now()}-${++elementCounter}`;
}

// ─── Store interface ────────────────────────────────────────

export type ChatMode = "pocketpaw" | "direct";

export interface DesignStore {
  // Spec
  spec: DesignSpec;
  setSpec: (spec: DesignSpec) => void;

  // Selection
  selectedId: string | null;
  hoveredId: string | null;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;

  // Element operations
  addElement: (
    parentId: string,
    type: string,
    props?: Record<string, any>,
  ) => string;
  removeElement: (id: string) => void;
  updateProps: (id: string, props: Record<string, any>) => void;
  moveElement: (id: string, newParentId: string, index: number) => void;

  // History
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  applySpec: (messageId: string) => void;
  abortChat: () => void;

  // Chat mode: use PocketPaw's main AI or a direct API key
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;

  // AI config (for direct mode)
  aiApiKey: string;
  aiApiBase: string;
  aiModel: string;
  setAiConfig: (config: {
    apiKey?: string;
    apiBase?: string;
    model?: string;
  }) => void;

  // Saved specs
  savedSpecs: string[];
  fetchSavedSpecs: () => Promise<void>;
  saveSpec: (name: string) => Promise<void>;
  loadSpec: (name: string) => Promise<void>;
  deleteSpec: (name: string) => Promise<void>;

  // Provider
  activeProviderId: string;
  availableProviders: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    tags?: string[];
    version: string;
  }>;
  setProvider: (id: string) => void;

  // UI
  activePanel: "config" | "chat" | "layers" | "palette";
  setActivePanel: (panel: "config" | "chat" | "layers" | "palette") => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  pluginStatus: string;
  setPluginStatus: (s: string) => void;
}

// ─── Abort controller for streaming ─────────────────────────
let currentAbort: AbortController | null = null;

// ─── Store implementation ───────────────────────────────────

export const useDesignStore = create<DesignStore>()(
  subscribeWithSelector((set, get) => ({
    // ── Spec ──
    spec: DEFAULT_SPEC,
    setSpec: (spec) => {
      get().pushHistory();
      set({ spec });
    },

    // ── Selection ──
    selectedId: null,
    hoveredId: null,
    select: (id) => set({ selectedId: id }),
    hover: (id) => set({ hoveredId: id }),

    // ── Element operations ──
    addElement: (parentId, type, props = {}) => {
      get().pushHistory();
      const id = makeElementId(type);
      const spec = structuredClone(get().spec);
      spec.elements[id] = { type, props };

      const parent = spec.elements[parentId];
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(id);
      }

      set({ spec, selectedId: id });
      return id;
    },

    removeElement: (id) => {
      if (id === "root") return;
      get().pushHistory();
      const spec = structuredClone(get().spec);

      for (const el of Object.values(spec.elements)) {
        if (el.children?.includes(id)) {
          el.children = el.children.filter((c: string) => c !== id);
        }
      }

      const toRemove = [id];
      while (toRemove.length > 0) {
        const current = toRemove.pop()!;
        const el = spec.elements[current];
        if (el?.children) toRemove.push(...el.children);
        delete spec.elements[current];
      }

      set({
        spec,
        selectedId: get().selectedId === id ? null : get().selectedId,
      });
    },

    updateProps: (id, props) => {
      get().pushHistory();
      const spec = structuredClone(get().spec);
      if (spec.elements[id]) {
        spec.elements[id].props = { ...spec.elements[id].props, ...props };
      }
      set({ spec });
    },

    moveElement: (id, newParentId, index) => {
      get().pushHistory();
      const spec = structuredClone(get().spec);

      for (const el of Object.values(spec.elements)) {
        if (el.children?.includes(id)) {
          el.children = el.children.filter((c: string) => c !== id);
        }
      }

      const parent = spec.elements[newParentId];
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.splice(index, 0, id);
      }

      set({ spec });
    },

    // ── History ──
    undoStack: [],
    redoStack: [],
    pushHistory: () => {
      const { spec, undoStack } = get();
      const entry: HistoryEntry = {
        spec: structuredClone(spec),
        timestamp: Date.now(),
      };
      set({
        undoStack: [...undoStack.slice(-MAX_HISTORY), entry],
        redoStack: [],
      });
    },
    undo: () => {
      const { undoStack, spec } = get();
      if (undoStack.length === 0) return;
      const prev = undoStack[undoStack.length - 1];
      set({
        spec: prev.spec,
        undoStack: undoStack.slice(0, -1),
        redoStack: [
          ...get().redoStack,
          { spec: structuredClone(spec), timestamp: Date.now() },
        ],
      });
    },
    redo: () => {
      const { redoStack, spec } = get();
      if (redoStack.length === 0) return;
      const next = redoStack[redoStack.length - 1];
      set({
        spec: next.spec,
        redoStack: redoStack.slice(0, -1),
        undoStack: [
          ...get().undoStack,
          { spec: structuredClone(spec), timestamp: Date.now() },
        ],
      });
    },

    // ── Chat ──
    messages: [
      {
        id: "welcome",
        role: "system",
        content:
          '👋 Describe what you want to design and I\'ll generate it!\n\nUsing PocketPaw\'s AI — no API key needed.\nTry: "Create a login form" or "Build a dashboard"',
        timestamp: Date.now(),
      },
    ],
    isStreaming: false,

    sendMessage: async (content) => {
      const state = get();
      if (state.isStreaming || !content.trim()) return;

      const userMsg: ChatMessage = {
        id: makeId(),
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };

      const assistantId = makeId();
      set({
        messages: [
          ...state.messages,
          userMsg,
          {
            id: assistantId,
            role: "assistant",
            content: "Thinking...",
            timestamp: Date.now(),
            streaming: true,
          },
        ],
        isStreaming: true,
      });

      const controller = new AbortController();
      currentAbort = controller;

      try {
        // Build the prompt with current spec context
        const specContext = `Current design spec:\n${JSON.stringify(state.spec, null, 2)}`;
        const fullPrompt = `${specContext}\n\nUser request: ${content.trim()}\n\nGenerate a complete JSON spec according to the rules. Return ONLY the JSON.`;
        const DESIGN_SYSTEM_PROMPT = getDesignSystemPrompt();

        let result: string;

        if (state.chatMode === "pocketpaw") {
          // ── Use PocketPaw's main AI (no API key needed) ──
          result = await chatWithAI(fullPrompt, {
            systemPrompt: DESIGN_SYSTEM_PROMPT,
            signal: controller.signal,
            onChunk: (accumulated) => {
              set({
                messages: get().messages.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: accumulated }
                    : m,
                ),
              });
            },
          });
        } else {
          // ── Use direct API (requires API key) ──
          if (!state.aiApiKey) throw new Error("API key required for direct mode. Switch to PocketPaw mode or add an API key.");

          const data = await pluginApi("/api/chat", {
            messages: [
              { role: "user", content: specContext },
              ...state.messages
                .filter((m) => m.role !== "system")
                .slice(-10)
                .map((m) => ({ role: m.role, content: m.content })),
              { role: "user", content: content.trim() },
            ],
            apiKey: state.aiApiKey,
            apiBase: state.aiApiBase || undefined,
            model: state.aiModel || undefined,
          });

          result = data.spec
            ? JSON.stringify(data.spec)
            : data.content || "{}";
        }

        // Try to parse the result as a JSON spec
        let spec: DesignSpec | null = null;
        try {
          // Extract JSON from the response (may have surrounding text)
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.root && parsed.elements) {
              spec = parsed;
            }
          }
        } catch {
          // Not valid JSON — just show the text response
        }

        const textContent = spec
          ? "✅ Design generated! Click **Apply** to load it onto the canvas."
          : result.slice(0, 500) || "Could not generate a valid spec.";

        set({
          messages: get().messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: textContent,
                  spec: spec || undefined,
                  streaming: false,
                }
              : m,
          ),
          isStreaming: false,
        });
      } catch (err: any) {
        if (err?.name === "AbortError") {
          set({
            messages: get().messages.map((m) =>
              m.id === assistantId
                ? { ...m, content: "⏹ Cancelled", streaming: false }
                : m,
            ),
            isStreaming: false,
          });
        } else {
          set({
            messages: get().messages.map((m) =>
              m.id === assistantId
                ? { ...m, content: `❌ ${err.message}`, streaming: false }
                : m,
            ),
            isStreaming: false,
          });
        }
      } finally {
        currentAbort = null;
      }
    },

    clearChat: () => {
      set({
        messages: [
          {
            id: "welcome",
            role: "system",
            content: "Chat cleared. Ready for new prompts!",
            timestamp: Date.now(),
          },
        ],
      });
    },

    abortChat: () => {
      currentAbort?.abort();
    },

    applySpec: (messageId) => {
      const msg = get().messages.find((m) => m.id === messageId);
      if (!msg?.spec) return;
      get().pushHistory();
      set({
        spec: msg.spec,
        messages: get().messages.map((m) =>
          m.id === messageId ? { ...m, applied: true } : m,
        ),
      });
    },

    // ── Chat mode ──
    chatMode: "pocketpaw",
    setChatMode: (mode) => set({ chatMode: mode }),

    // ── AI config (direct mode) ──
    aiApiKey: "",
    aiApiBase: "",
    aiModel: "gpt-4o-mini",
    setAiConfig: (config) => {
      set({
        aiApiKey: config.apiKey ?? get().aiApiKey,
        aiApiBase: config.apiBase ?? get().aiApiBase,
        aiModel: config.model ?? get().aiModel,
      });
    },

    // ── Saved specs ──
    savedSpecs: [],
    fetchSavedSpecs: async () => {
      try {
        const data = await pluginApi("/api/specs/list");
        set({ savedSpecs: data.specs || [] });
      } catch {
        /* ignore */
      }
    },
    saveSpec: async (name) => {
      await pluginApi("/api/specs/save", { name, spec: get().spec });
      get().fetchSavedSpecs();
    },
    loadSpec: async (name) => {
      const data = await pluginApi("/api/specs/load", { name });
      if (data.spec) {
        get().pushHistory();
        set({ spec: data.spec });
      }
    },
    deleteSpec: async (name) => {
      await pluginApi("/api/specs/delete", { name });
      get().fetchSavedSpecs();
    },

    // ── Provider ──
    activeProviderId: getActiveProviderId(),
    availableProviders: getProviders().map((p) => ({
      id: p.id, name: p.name, description: p.description,
      category: p.category, tags: p.tags, version: p.version,
    })),
    setProvider: (id) => {
      setActiveProvider(id);
      set({
        activeProviderId: id,
        availableProviders: getProviders().map((p) => ({
          id: p.id, name: p.name, description: p.description,
          category: p.category, tags: p.tags, version: p.version,
        })),
      });
    },

    // ── UI ──
    activePanel: "config",
    setActivePanel: (panel) => set({ activePanel: panel }),
    showSettings: false,
    setShowSettings: (show) => set({ showSettings: show }),
    pluginStatus: "unknown",
    setPluginStatus: (s) => set({ pluginStatus: s }),
  })),
);
