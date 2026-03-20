/**
 * Design Builder — Component Registry
 *
 * Builds a json-render registry from the active provider.
 * This module exposes a function to get the current registry
 * so the Canvas can rebuild when the provider switches.
 */

import { defineRegistry } from "@json-render/react";
import { getActiveProvider } from "./providers";

export function buildActiveRegistry() {
  const provider = getActiveProvider();
  return defineRegistry(provider.nativeCatalog, {
    components: provider.nativeComponents,
    ...(provider.nativeActions ? { actions: provider.nativeActions } : {}),
  } as any);
}

// Default export for backward compatibility
export const { registry } = buildActiveRegistry();
