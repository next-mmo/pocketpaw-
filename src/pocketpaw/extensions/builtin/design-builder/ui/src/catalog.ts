/**
 * Design Builder — json-render Catalog
 *
 * Defines all available components + actions for the Renderer.
 * This catalog is used by both the visual canvas AND the AI prompt.
 */

import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

// ─── Component Definitions ──────────────────────────────────

export const catalog = defineCatalog(schema, {
  components: {
    // ── Layout ─────────────────────────────────────
    Stack: {
      props: z.object({
        direction: z.enum(["column", "row"]).nullable(),
        gap: z.number().nullable(),
        padding: z.number().nullable(),
        flex: z.number().nullable(),
        background: z.string().nullable(),
        borderRadius: z.number().nullable(),
        align: z.enum(["start", "center", "end", "stretch"]).nullable(),
        justify: z.enum(["start", "center", "end", "between", "around"]).nullable(),
        minHeight: z.number().nullable(),
        border: z.string().nullable(),
      }),
      slots: ["children"],
      description: "Flex container — vertical or horizontal layout with gap, padding, background",
    },

    ScrollView: {
      props: z.object({
        direction: z.enum(["vertical", "horizontal"]).nullable(),
        maxHeight: z.number().nullable(),
      }),
      slots: ["children"],
      description: "Scrollable container",
    },

    // ── Display ────────────────────────────────────
    Text: {
      props: z.object({
        text: z.string(),
        size: z.number().nullable(),
        weight: z.enum(["normal", "bold", "semibold", "light"]).nullable(),
        color: z.string().nullable(),
        align: z.enum(["left", "center", "right"]).nullable(),
        italic: z.boolean().nullable(),
        lineHeight: z.number().nullable(),
      }),
      description: "Text display — customizable size, weight, color",
    },

    Heading: {
      props: z.object({
        text: z.string(),
        level: z.number().min(1).max(4).nullable(),
        color: z.string().nullable(),
        align: z.enum(["left", "center", "right"]).nullable(),
      }),
      description: "Section heading (h1-h4)",
    },

    Image: {
      props: z.object({
        uri: z.string(),
        width: z.number().nullable(),
        height: z.number().nullable(),
        borderRadius: z.number().nullable(),
        objectFit: z.enum(["cover", "contain", "fill"]).nullable(),
      }),
      description: "Image display",
    },

    Badge: {
      props: z.object({
        text: z.string(),
        variant: z.enum(["default", "secondary", "destructive", "outline"]).nullable(),
      }),
      description: "Small label badge",
    },

    Avatar: {
      props: z.object({
        uri: z.string().nullable(),
        fallback: z.string(),
        size: z.number().nullable(),
      }),
      description: "User avatar with image or fallback initials",
    },

    Separator: {
      props: z.object({
        orientation: z.enum(["horizontal", "vertical"]).nullable(),
        color: z.string().nullable(),
      }),
      description: "Visual divider line",
    },

    Skeleton: {
      props: z.object({
        width: z.number().nullable(),
        height: z.number().nullable(),
        borderRadius: z.number().nullable(),
      }),
      description: "Loading placeholder",
    },

    Progress: {
      props: z.object({
        value: z.number(),
        max: z.number().nullable(),
        color: z.string().nullable(),
      }),
      description: "Progress bar",
    },

    Icon: {
      props: z.object({
        name: z.string(),
        size: z.number().nullable(),
        color: z.string().nullable(),
      }),
      description: "Icon display (Lucide icon names)",
    },

    // ── Input ──────────────────────────────────────
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["default", "secondary", "destructive", "outline", "ghost", "link"]).nullable(),
        size: z.enum(["default", "sm", "lg"]).nullable(),
        action: z.string().nullable(),
        disabled: z.boolean().nullable(),
      }),
      description: "Clickable button",
    },

    Input: {
      props: z.object({
        placeholder: z.string().nullable(),
        value: z.string().nullable(),
        type: z.enum(["text", "password", "email", "number"]).nullable(),
        label: z.string().nullable(),
      }),
      description: "Text input field",
    },

    Textarea: {
      props: z.object({
        placeholder: z.string().nullable(),
        value: z.string().nullable(),
        rows: z.number().nullable(),
        label: z.string().nullable(),
      }),
      description: "Multi-line text input",
    },

    Checkbox: {
      props: z.object({
        label: z.string().nullable(),
        checked: z.boolean().nullable(),
      }),
      description: "Toggle checkbox",
    },

    Switch: {
      props: z.object({
        label: z.string().nullable(),
        checked: z.boolean().nullable(),
      }),
      description: "Toggle switch",
    },

    Select: {
      props: z.object({
        placeholder: z.string().nullable(),
        options: z.array(z.object({ label: z.string(), value: z.string() })),
      }),
      description: "Dropdown select",
    },

    // ── Containers ─────────────────────────────────
    Card: {
      props: z.object({
        title: z.string().nullable(),
        description: z.string().nullable(),
        background: z.string().nullable(),
        borderRadius: z.number().nullable(),
        padding: z.number().nullable(),
      }),
      slots: ["children"],
      description: "Card container with optional title/description",
    },

    Alert: {
      props: z.object({
        title: z.string(),
        description: z.string().nullable(),
        variant: z.enum(["default", "destructive"]).nullable(),
      }),
      description: "Alert message box",
    },

    // ── Navigation ─────────────────────────────────
    Tabs: {
      props: z.object({
        defaultValue: z.string().nullable(),
      }),
      slots: ["children"],
      description: "Tab container — must contain TabsList and TabsContent children",
    },

    TabsList: {
      props: z.object({}),
      slots: ["children"],
      description: "Tab button bar — contains TabsTrigger children",
    },

    TabsTrigger: {
      props: z.object({
        value: z.string(),
        label: z.string(),
      }),
      description: "Individual tab button",
    },

    TabsContent: {
      props: z.object({
        value: z.string(),
      }),
      slots: ["children"],
      description: "Tab panel content area",
    },
  },
  actions: {
    navigate: { description: "Navigate to a route or screen" },
    submit: { description: "Submit form data" },
    dismiss: { description: "Close or dismiss the current view" },
    refresh: { description: "Refresh the current data" },
    setState: { description: "Update a state value" },
  },
});

export type AppCatalog = typeof catalog;
