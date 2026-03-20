/**
 * Design Builder — Provider Registry
 *
 * Central registry that holds all available providers.
 * Adding a new provider? Import it and call `registerProvider()`.
 *
 * The registry emits a simple "changed" callback so the store and
 * UI can react when the active provider switches.
 */

import type { ProviderDefinition } from "./types";
import { jsonRenderProvider } from "./json-render";
import { shadcnProvider } from "./shadcn";

// ─── Internal state ─────────────────────────────────────────

const providers = new Map<string, ProviderDefinition>();
let activeId: string = "json-render";
const listeners = new Set<() => void>();

// ─── Public API ─────────────────────────────────────────────

/** Register a new provider. */
export function registerProvider(provider: ProviderDefinition): void {
  providers.set(provider.id, provider);
  notify();
}

/** Unregister a provider by id. */
export function unregisterProvider(id: string): void {
  providers.delete(id);
  if (activeId === id && providers.size > 0) {
    activeId = providers.keys().next().value!;
  }
  notify();
}

/** Get all registered providers. */
export function getProviders(): ProviderDefinition[] {
  return Array.from(providers.values());
}

/** Get a provider by id. */
export function getProvider(id: string): ProviderDefinition | undefined {
  return providers.get(id);
}

/** Get the currently active provider. */
export function getActiveProvider(): ProviderDefinition {
  return providers.get(activeId) ?? providers.values().next().value!;
}

/** Get the active provider id. */
export function getActiveProviderId(): string {
  return activeId;
}

/** Switch the active provider. */
export function setActiveProvider(id: string): void {
  if (!providers.has(id)) {
    console.warn(`[ProviderRegistry] Unknown provider "${id}"`);
    return;
  }
  activeId = id;
  notify();
}

/** Subscribe to provider changes. Returns an unsubscribe function. */
export function onProviderChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

// ─── Built-in registration ─────────────────────────────────

registerProvider(jsonRenderProvider);
registerProvider(shadcnProvider);

// ─── Re-exports ─────────────────────────────────────────────

export type { ProviderDefinition } from "./types";
export type {
  ComponentMeta,
  ActionMeta,
  PaletteSection,
  PropMeta,
  RendererContext,
} from "./types";
