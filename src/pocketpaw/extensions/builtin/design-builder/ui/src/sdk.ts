/**
 * PocketPaw SDK wrapper for the design-builder extension.
 *
 * Instead of each extension reinventing API base detection, status polling,
 * and chat streaming, this module provides typed helpers that use PocketPaw's
 * core APIs directly.
 *
 * This DRYs up the patterns from `extensions-sdk.js` for use in TypeScript
 * Vite-built extensions like design-builder and llama-cpp.
 */

// ─── API Base Detection (iframe-safe) ───────────────────────
export function getApiBase(): string {
  try {
    if (window.parent !== window) return window.parent.location.origin;
  } catch {
    /* cross-origin iframe — fall back */
  }
  return window.location.origin;
}

export const API_BASE = getApiBase();

// ─── Plugin API helpers ─────────────────────────────────────

const PLUGIN_ID = "design-builder";

/**
 * Call a plugin's proxied API endpoint.
 */
export async function pluginApi(
  path: string,
  body?: Record<string, unknown>,
): Promise<any> {
  const url = `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/proxy${path}`;
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Plugin API error: ${res.status}`);
  return res.json();
}

/**
 * Get plugin status.
 */
export async function getPluginStatus(): Promise<{
  status: string;
  port?: number;
  url?: string;
  error?: string;
}> {
  const res = await fetch(
    `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/status`,
  );
  if (!res.ok) throw new Error(`Status error: ${res.status}`);
  return res.json();
}

// ─── PocketPaw Chat API ─────────────────────────────────────

/**
 * Send a message to PocketPaw's main chat endpoint and stream the response.
 * Uses the user's already-configured AI backend (Claude, OpenAI, Gemini, etc.)
 * — no separate API key needed.
 *
 * Falls back to the plugin's own /api/chat if PocketPaw chat is unavailable.
 */
export async function chatWithAI(
  content: string,
  options?: {
    systemPrompt?: string;
    sessionId?: string;
    onChunk?: (accumulated: string) => void;
    onDone?: (full: string) => void;
    onError?: (err: Error) => void;
    signal?: AbortSignal;
  },
): Promise<string> {
  const { systemPrompt, sessionId, onChunk, onDone, onError, signal } = options ?? {};

  try {
    // Build the content — embed system prompt as context
    const fullContent = systemPrompt
      ? `[System Context]\n${systemPrompt}\n\n[User Request]\n${content}`
      : content;

    const res = await fetch(`${API_BASE}/api/v1/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: fullContent,
        session_id: sessionId || undefined,
      }),
      signal,
    });

    if (!res.ok) {
      throw new Error(
        `PocketPaw chat error: ${res.status} ${await res.text().catch(() => "")}`,
      );
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE format: "event: <name>\ndata: <json>\n\n"
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const lines = block.split("\n");
        const eventLine = lines.find((l) => l.startsWith("event:"));
        const dataLine = lines.find((l) => l.startsWith("data:"));

        if (eventLine && dataLine) {
          const eventName = eventLine.slice("event:".length).trim();
          let parsed: any = {};
          try {
            parsed = JSON.parse(dataLine.slice("data:".length).trim());
          } catch {
            /* skip */
          }

          if (eventName === "chunk" && parsed.content) {
            // Each chunk is an individual text fragment
            accumulated += parsed.content;
            onChunk?.(accumulated);
          } else if (eventName === "stream_end") {
            // stream_end may contain session_id
            break;
          } else if (eventName === "error") {
            throw new Error(parsed.detail || parsed.message || "Stream error");
          }
        }

        boundary = buffer.indexOf("\n\n");
      }
    }

    onDone?.(accumulated);
    return accumulated;
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.name === "AbortError") {
      onDone?.("");
      return "";
    }
    onError?.(error);
    throw error;
  }
}

// ─── OpenAI-compatible streaming (for direct provider use) ──

export interface StreamCompletionOptions {
  url: string;
  headers: Record<string, string>;
  model: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: string };
  signal?: AbortSignal;
  onDelta?: (delta: string, accumulated: string) => void;
  onDone?: (full: string) => void;
  onError?: (err: Error) => void;
}

/**
 * Stream an OpenAI-compatible chat completion response.
 * Reusable across any extension that needs direct provider access.
 */
export async function streamCompletion(
  opts: StreamCompletionOptions,
): Promise<string> {
  const {
    url,
    headers,
    model,
    messages,
    maxTokens = 1024,
    temperature = 0.7,
    responseFormat,
    signal,
    onDelta,
    onDone,
    onError,
  } = opts;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: maxTokens,
        temperature,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
      signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `Completion error (${res.status}): ${errBody.slice(0, 200)}`,
      );
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            onDelta?.(delta, accumulated);
          }
        } catch {
          /* skip parse errors */
        }
      }
    }

    onDone?.(accumulated);
    return accumulated;
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.name === "AbortError") {
      onDone?.("");
      return "";
    }
    onError?.(error);
    throw error;
  }
}
