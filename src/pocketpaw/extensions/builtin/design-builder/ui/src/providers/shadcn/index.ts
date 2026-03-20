/**
 * shadcn Provider — Entry Point
 *
 * Uses the official @json-render/shadcn package for both the
 * catalog (Zod schemas) and component implementations.
 */

import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions, shadcnComponents } from "@json-render/shadcn";
import type { ProviderDefinition } from "../types";
import { components, actions, palette } from "./catalog";
import { renderers } from "./renderers";

// ─── Native catalog from @json-render/shadcn ────────────────

const nativeCatalog = defineCatalog(schema, {
  components: shadcnComponentDefinitions as any,
  actions: {
    navigate: { description: "Navigate to a route or screen" },
    submit: { description: "Submit form data" },
    dismiss: { description: "Close or dismiss the current view" },
    refresh: { description: "Refresh the current data" },
    setState: { description: "Update a state value" },
  },
});

// ─── AI system prompt builder ───────────────────────────────

function buildSystemPrompt(): string {
  // Build from the official shadcn component definitions
  const lines: string[] = [];

  for (const [name, def] of Object.entries(shadcnComponentDefinitions)) {
    const d = def as any;
    const hasSlots = d.slots && d.slots.length > 0;
    const desc = d.description || name;
    const slotsNote = hasSlots ? ". Has children." : "";
    lines.push(`- **${name}**: ${desc}${slotsNote}`);
  }

  return `You are a UI design assistant that generates JSON specs using shadcn/ui-style components.

## Available Components

${lines.join("\n")}

## Spec Format
Return a JSON object:
{
  "version": "1.0",
  "root": "root",
  "state": {},
  "elements": {
    "root": { "type": "Stack", "props": { "direction": "vertical", "gap": "md" }, "children": ["child1"] },
    "child1": { "type": "Heading", "props": { "text": "Hello", "level": "h1" } }
  }
}

## Rules
- Every element needs a unique string ID
- Root is always "root" — use "Stack" as the root container
- Only use components listed above
- Return ONLY valid JSON, no markdown code blocks
- Generate realistic, visually appealing designs
- Use shadcn dark theme aesthetics
- For Stack: direction is "vertical" or "horizontal", gap is "sm"|"md"|"lg"|"none"
- For Text: variant is "body"|"caption"|"muted"|"lead"|"code"
- For Heading: level is "h1"|"h2"|"h3"|"h4"
- For Button: variant is "primary"|"secondary"|"danger"`;
}

// ─── Provider Definition ────────────────────────────────────

export const shadcnProvider: ProviderDefinition = {
  id: "shadcn",
  name: "shadcn/ui",
  description: "Official shadcn/ui components via @json-render/shadcn",
  version: "1.0.0",
  category: "web/ui",
  tags: ["react", "shadcn", "tailwind", "radix"],

  components,
  actions,
  palette,
  renderers,

  nativeCatalog,
  nativeComponents: shadcnComponents,

  buildSystemPrompt,
};
