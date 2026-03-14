import { create } from "zustand";
import { persist } from "zustand/middleware";
import { API_BASE, PLUGIN_ID } from "./serverStore";

// ── Provider types ──────────────────────────────────────

export type ProviderType = "local" | "openrouter" | "codex" | "custom";

export interface ProviderModel {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt: string; completion: string };
  isFree?: boolean;
}

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  models: ProviderModel[];
  /** When the model list was last fetched (epoch ms) */
  modelsFetchedAt: number;
}

// ── Built-in provider templates ─────────────────────────

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: "local",
    type: "local",
    name: "Local (GGUF)",
    baseUrl: "", // filled at runtime from serverStore
    apiKey: "",
    enabled: true,
    models: [],
    modelsFetchedAt: 0,
  },
  {
    id: "openrouter",
    type: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api",
    apiKey: "",
    enabled: false,
    models: [],
    modelsFetchedAt: 0,
  },
  {
    id: "codex",
    type: "codex",
    name: "Codex CLI",
    baseUrl: "http://127.0.0.1:1337",
    apiKey: "",
    enabled: false,
    models: [],
    modelsFetchedAt: 0,
  },
];

// ── Store ───────────────────────────────────────────────

interface ProviderState {
  providers: ProviderConfig[];
  activeProviderId: string;
  activeModelId: string;

  // Actions
  setProviders: (providers: ProviderConfig[]) => void;
  updateProvider: (id: string, patch: Partial<ProviderConfig>) => void;
  addProvider: (provider: ProviderConfig) => void;
  removeProvider: (id: string) => void;
  setActiveProvider: (providerId: string) => void;
  setActiveModel: (modelId: string) => void;
  fetchModels: (providerId: string) => Promise<void>;
}

export const useProviderStore = create<ProviderState>()(
  persist(
    (set, get) => ({
      providers: DEFAULT_PROVIDERS,
      activeProviderId: "local",
      activeModelId: "",

      setProviders: (providers) => set({ providers }),

      updateProvider: (id, patch) =>
        set((s) => ({
          providers: s.providers.map((p) =>
            p.id === id ? { ...p, ...patch } : p,
          ),
        })),

      addProvider: (provider) =>
        set((s) => ({
          providers: [...s.providers, provider],
        })),

      removeProvider: (id) =>
        set((s) => ({
          providers: s.providers.filter((p) => p.id !== id),
          activeProviderId:
            s.activeProviderId === id ? "local" : s.activeProviderId,
        })),

      setActiveProvider: (providerId) =>
        set({ activeProviderId: providerId }),

      setActiveModel: (modelId) =>
        set({ activeModelId: modelId }),

      fetchModels: async (providerId: string) => {
        const provider = get().providers.find((p) => p.id === providerId);
        if (!provider) return;

        try {
          let models: ProviderModel[] = [];

          if (provider.type === "local") {
            // Fetch from PocketPaw plugin API
            const res = await fetch(
              `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/models`,
            );
            if (res.ok) {
              const data = await res.json();
              models = (data.models || []).map(
                (m: { file: string; size_mb: number }) => ({
                  id: m.file,
                  name: `${m.file} (${m.size_mb.toFixed(0)} MB)`,
                }),
              );
            }
          } else if (provider.type === "openrouter") {
            // Fetch from OpenRouter models API
            const res = await fetch(`${provider.baseUrl}/v1/models`, {
              headers: provider.apiKey
                ? { Authorization: `Bearer ${provider.apiKey}` }
                : {},
            });
            if (res.ok) {
              const data = await res.json();
              models = (data.data || []).map(
                (m: {
                  id: string;
                  name?: string;
                  context_length?: number;
                  pricing?: { prompt: string; completion: string };
                }) => ({
                  id: m.id,
                  name: m.name || m.id,
                  context_length: m.context_length,
                  pricing: m.pricing,
                  isFree:
                    m.pricing &&
                    parseFloat(m.pricing.prompt) === 0 &&
                    parseFloat(m.pricing.completion) === 0,
                }),
              );
            }
          } else if (provider.type === "codex" || provider.type === "custom") {
            // Generic OpenAI-compatible /v1/models
            const headers: Record<string, string> = {};
            if (provider.apiKey) {
              headers["Authorization"] = `Bearer ${provider.apiKey}`;
            }
            try {
              const res = await fetch(`${provider.baseUrl}/v1/models`, {
                headers,
              });
              if (res.ok) {
                const data = await res.json();
                models = (data.data || []).map(
                  (m: { id: string; owned_by?: string }) => ({
                    id: m.id,
                    name: m.id,
                  }),
                );
              }
            } catch {
              // Endpoint may not support /v1/models
            }
          }

          get().updateProvider(providerId, {
            models,
            modelsFetchedAt: Date.now(),
          });
        } catch {
          // silently fail
        }
      },
    }),
    {
      name: "llama-cpp-providers",
      partialize: (state) => ({
        providers: state.providers.map((p) => ({
          ...p,
          // Don't persist model lists (re-fetch on load)
          models: p.type === "local" ? [] : p.models,
        })),
        activeProviderId: state.activeProviderId,
        activeModelId: state.activeModelId,
      }),
    },
  ),
);

// ── Helpers ─────────────────────────────────────────────

/**
 * Build the fetch URL + headers for a chat completion request.
 * All providers use the OpenAI chat/completions shape.
 */
export function getCompletionEndpoint(provider: ProviderConfig): {
  url: string;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (provider.type === "local") {
    // Route through PocketPaw proxy to avoid CORS
    return {
      url: `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/proxy/v1/chat/completions`,
      headers,
    };
  }

  if (provider.type === "openrouter") {
    if (provider.apiKey) {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    }
    headers["HTTP-Referer"] = window.location.origin;
    headers["X-Title"] = "PocketPaw";
    return {
      url: `${provider.baseUrl}/v1/chat/completions`,
      headers,
    };
  }

  // codex / custom — generic OpenAI-compatible
  if (provider.apiKey) {
    headers["Authorization"] = `Bearer ${provider.apiKey}`;
  }
  return {
    url: `${provider.baseUrl}/v1/chat/completions`,
    headers,
  };
}
