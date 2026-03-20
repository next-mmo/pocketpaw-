/**
 * Design Builder — Provider Types
 *
 * The universal interface every render‑provider must implement.
 * Adding a new provider? Just satisfy `ProviderDefinition` and register it.
 */

import type { ReactNode } from "react";

// ─── Component metadata (provider‑agnostic) ─────────────────

/** Describes a single prop on a component. */
export interface PropMeta {
  type: "string" | "number" | "boolean" | "enum" | "array" | "object";
  /** If type === "enum", the allowed values. */
  options?: string[];
  /** If true, the prop is required. */
  required?: boolean;
  /** Default value shown in the palette / props panel. */
  defaultValue?: any;
  /** Human‑readable description for the AI prompt. */
  description?: string;
}

/** Describes a component available in the catalog. */
export interface ComponentMeta {
  /** Component type key, e.g. "Button", "Card". */
  type: string;
  /** Short human‑readable description. */
  description: string;
  /** The category (layout, display, input, container, navigation …). */
  category: string;
  /** Icon for the palette panel. */
  icon: string;
  /** Default props to use when dragging from the palette. */
  defaultProps: Record<string, any>;
  /** Full prop metadata (used for the props panel + AI prompt). */
  props: Record<string, PropMeta>;
  /** Whether this component can have children. */
  hasChildren?: boolean;
}

/** Describes an action available in the catalog. */
export interface ActionMeta {
  name: string;
  description: string;
}

// ─── Palette section ────────────────────────────────────────

export interface PaletteSection {
  section: string;
  items: Array<{
    type: string;
    icon: string;
    defaultProps: Record<string, any>;
  }>;
}

// ─── Provider Definition ────────────────────────────────────

export interface ProviderDefinition {
  /** Unique provider id, e.g. "json-render", "shadcn". */
  id: string;
  /** Human‑readable name. */
  name: string;
  /** Short description shown in the UI. */
  description: string;
  /** Version string (semver or label). */
  version: string;

  /**
   * Hierarchical category path for grouping in the Config panel.
   * Uses "/" as separator, e.g. "web/ui", "web/form", "mobile/ui".
   */
  category: string;

  /** Optional tags for filtering / search. */
  tags?: string[];

  /**
   * All components this provider exposes.
   * Keyed by component type (e.g. "Button").
   */
  components: Record<string, ComponentMeta>;

  /** All actions this provider exposes. */
  actions: ActionMeta[];

  /** Pre‑built palette sections for the sidebar. */
  palette: PaletteSection[];

  /**
   * The React component registry — maps component type strings to
   * actual renderable React elements.
   *
   * Each function receives `{ props, children, emit }` and returns
   * a ReactNode.
   */
  renderers: Record<string, (ctx: RendererContext) => ReactNode>;

  /**
   * Native json-render catalog result (from `defineCatalog()`).
   * This is passed directly to the `<Renderer>` — no dynamic generation.
   */
  nativeCatalog: any;

  /**
   * Native json-render `Components<>` object.
   * These are the actual component implementations the Renderer uses.
   */
  nativeComponents: any;

  /**
   * Native json-render action handlers (optional).
   */
  nativeActions?: any;

  /**
   * Build the AI system prompt section describing this provider's
   * available components. Called once when the provider is activated.
   */
  buildSystemPrompt: () => string;

  /**
   * Optional: Wrap the canvas with provider‑specific context
   * (e.g. ThemeProvider, StateProvider).
   */
  canvasWrapper?: (props: { children: ReactNode }) => ReactNode;
}

// ─── Renderer context passed to each component renderer ─────

export interface RendererContext {
  props: Record<string, any>;
  children?: ReactNode;
  emit: (event: string, payload?: any) => void;
}
