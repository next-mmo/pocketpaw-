/**
 * Design Builder — Catalog
 *
 * Thin re-export layer that delegates to the active provider's
 * native json-render catalog. Each provider ships its own
 * `defineCatalog()` result so the Renderer always gets
 * properly-typed Zod schemas.
 */

import { getActiveProvider } from "./providers";

export function getActiveCatalog() {
  return getActiveProvider().nativeCatalog;
}

// Static initial export for module-level consumers
export const catalog = getActiveCatalog();
export type AppCatalog = typeof catalog;
