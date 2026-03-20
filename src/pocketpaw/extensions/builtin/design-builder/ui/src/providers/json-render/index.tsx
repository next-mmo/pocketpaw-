/**
 * json-render Provider — Entry Point
 *
 * Assembles the catalog, renderers, and native json-render objects
 * for the default component set.
 */

import React from "react";
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import type { ProviderDefinition } from "../types";
import { components, actions, palette } from "./catalog";
import { renderers } from "./renderers";

// ─── Native json-render catalog (exact Zod schemas) ─────────

const nativeCatalog = defineCatalog(schema, {
  components: {
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
      description: "Flex container — vertical or horizontal layout",
    },
    ScrollView: {
      props: z.object({
        direction: z.enum(["vertical", "horizontal"]).nullable(),
        maxHeight: z.number().nullable(),
      }),
      slots: ["children"],
      description: "Scrollable container",
    },
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
      description: "Text display",
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
    Tabs: {
      props: z.object({ defaultValue: z.string().nullable() }),
      slots: ["children"],
      description: "Tab container",
    },
    TabsList: {
      props: z.object({}),
      slots: ["children"],
      description: "Tab button bar",
    },
    TabsTrigger: {
      props: z.object({ value: z.string(), label: z.string() }),
      description: "Individual tab button",
    },
    TabsContent: {
      props: z.object({ value: z.string() }),
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

// ─── Native component implementations ───────────────────────

const nativeComponents: any = {
  Stack: ({ props, children }: any) => {
    const justifyMap: Record<string, string> = {
      start: "flex-start", center: "center", end: "flex-end",
      between: "space-between", around: "space-around",
    };
    const alignMap: Record<string, string> = {
      start: "flex-start", center: "center", end: "flex-end", stretch: "stretch",
    };
    return (
      <div style={{
        display: "flex", flexDirection: props.direction ?? "column",
        gap: props.gap ?? 0, padding: props.padding ?? 0,
        flex: props.flex ?? undefined, background: props.background ?? undefined,
        borderRadius: props.borderRadius ?? undefined,
        alignItems: props.align ? alignMap[props.align] : undefined,
        justifyContent: props.justify ? justifyMap[props.justify] : undefined,
        minHeight: props.minHeight ?? undefined, border: props.border ?? undefined,
        boxSizing: "border-box",
      }}>{children}</div>
    );
  },

  ScrollView: ({ props, children }: any) => (
    <div style={{
      overflow: "auto", maxHeight: props.maxHeight ?? undefined,
      flexDirection: props.direction === "horizontal" ? "row" : "column",
    }}>{children}</div>
  ),

  Text: ({ props }: any) => (
    <span style={{
      fontSize: props.size ?? 14, fontWeight: props.weight ?? "normal",
      color: props.color ?? "inherit", textAlign: props.align ?? undefined,
      fontStyle: props.italic ? "italic" : undefined,
      lineHeight: props.lineHeight ? `${props.lineHeight}px` : undefined,
      display: "block",
    }}>{props.text}</span>
  ),

  Heading: ({ props }: any) => {
    const sizes: Record<number, number> = { 1: 32, 2: 24, 3: 20, 4: 16 };
    return (
      <div style={{
        fontSize: sizes[props.level ?? 2] ?? 20, fontWeight: "bold",
        color: props.color ?? "inherit", textAlign: props.align ?? undefined,
        margin: "4px 0",
      }}>{props.text}</div>
    );
  },

  Image: ({ props }: any) => (
    <img src={props.uri} alt="" style={{
      width: props.width ?? "100%", height: props.height ?? "auto",
      borderRadius: props.borderRadius ?? 0, objectFit: props.objectFit ?? "cover",
      display: "block",
    }} />
  ),

  Badge: ({ props }: any) => {
    const colors: Record<string, { bg: string; text: string }> = {
      default: { bg: "#1677ff", text: "#fff" },
      secondary: { bg: "#333", text: "#ccc" },
      destructive: { bg: "#ff4d4f", text: "#fff" },
      outline: { bg: "transparent", text: "#888" },
    };
    const c = colors[props.variant ?? "default"];
    return (
      <span style={{
        display: "inline-block", padding: "2px 8px", borderRadius: 12,
        fontSize: 11, fontWeight: 600, background: c.bg, color: c.text,
        border: props.variant === "outline" ? "1px solid #444" : "none",
      }}>{props.text}</span>
    );
  },

  Avatar: ({ props }: any) => {
    const size = props.size ?? 40;
    return props.uri ? (
      <img src={props.uri} alt={props.fallback} style={{
        width: size, height: size, borderRadius: "50%", objectFit: "cover",
      }} />
    ) : (
      <div style={{
        width: size, height: size, borderRadius: "50%", background: "#333",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#aaa", fontSize: size * 0.4, fontWeight: 600,
      }}>{props.fallback.slice(0, 2).toUpperCase()}</div>
    );
  },

  Separator: ({ props }: any) => (
    <div style={{
      width: props.orientation === "vertical" ? 1 : "100%",
      height: props.orientation === "vertical" ? "100%" : 1,
      background: props.color ?? "#333", flexShrink: 0,
    }} />
  ),

  Skeleton: ({ props }: any) => (
    <div style={{
      width: props.width ?? "100%", height: props.height ?? 20,
      borderRadius: props.borderRadius ?? 4,
      background: "linear-gradient(90deg, #222 25%, #2a2a2a 50%, #222 75%)",
      backgroundSize: "200% 100%",
      animation: "skeleton-pulse 1.5s infinite ease-in-out",
    }} />
  ),

  Progress: ({ props }: any) => {
    const pct = Math.min(100, (props.value / (props.max ?? 100)) * 100);
    return (
      <div style={{ width: "100%", height: 8, borderRadius: 4, background: "#222", overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 4,
          background: props.color ?? "#1677ff", transition: "width 0.3s ease",
        }} />
      </div>
    );
  },

  Icon: ({ props }: any) => (
    <span style={{
      fontSize: props.size ?? 20, color: props.color ?? "inherit",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>◆</span>
  ),

  Button: ({ props, emit }: any) => {
    const variants: Record<string, React.CSSProperties> = {
      default: { background: "#1677ff", color: "#fff", border: "none" },
      secondary: { background: "#333", color: "#e0e0e0", border: "none" },
      destructive: { background: "#ff4d4f", color: "#fff", border: "none" },
      outline: { background: "transparent", color: "#e0e0e0", border: "1px solid #444" },
      ghost: { background: "transparent", color: "#e0e0e0", border: "none" },
      link: { background: "transparent", color: "#1677ff", border: "none", textDecoration: "underline" },
    };
    const sizeStyles: Record<string, React.CSSProperties> = {
      sm: { padding: "4px 12px", fontSize: 12 },
      default: { padding: "8px 16px", fontSize: 13 },
      lg: { padding: "12px 24px", fontSize: 15 },
    };
    return (
      <button style={{
        ...variants[props.variant ?? "default"],
        ...sizeStyles[props.size ?? "default"],
        borderRadius: 6, fontWeight: 500,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.5 : 1, lineHeight: 1.5,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: 6, transition: "all 0.15s ease",
      }} onClick={() => emit("press")} disabled={props.disabled ?? false}>
        {props.label}
      </button>
    );
  },

  Input: ({ props }: any) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {props.label && <label style={{ fontSize: 12, color: "#888" }}>{props.label}</label>}
      <input type={props.type ?? "text"} placeholder={props.placeholder ?? ""}
        defaultValue={props.value ?? ""} style={{
          padding: "8px 12px", background: "#1a1a1a", border: "1px solid #333",
          borderRadius: 6, color: "#e0e0e0", fontSize: 13, outline: "none",
        }} />
    </div>
  ),

  Textarea: ({ props }: any) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {props.label && <label style={{ fontSize: 12, color: "#888" }}>{props.label}</label>}
      <textarea placeholder={props.placeholder ?? ""} defaultValue={props.value ?? ""}
        rows={props.rows ?? 3} style={{
          padding: "8px 12px", background: "#1a1a1a", border: "1px solid #333",
          borderRadius: 6, color: "#e0e0e0", fontSize: 13, outline: "none",
          resize: "vertical", fontFamily: "inherit",
        }} />
    </div>
  ),

  Checkbox: ({ props }: any) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
      <input type="checkbox" defaultChecked={props.checked ?? false} style={{ accentColor: "#1677ff" }} />
      {props.label && <span style={{ color: "#e0e0e0" }}>{props.label}</span>}
    </label>
  ),

  Switch: ({ props }: any) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
      <div style={{
        width: 36, height: 20, borderRadius: 10,
        background: props.checked ? "#1677ff" : "#333",
        position: "relative", transition: "background 0.2s",
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          position: "absolute", top: 2, left: props.checked ? 18 : 2, transition: "left 0.2s",
        }} />
      </div>
      {props.label && <span style={{ color: "#e0e0e0" }}>{props.label}</span>}
    </label>
  ),

  Select: ({ props }: any) => (
    <select style={{
      padding: "8px 12px", background: "#1a1a1a", border: "1px solid #333",
      borderRadius: 6, color: "#e0e0e0", fontSize: 13,
    }}>
      {props.placeholder && <option value="">{props.placeholder}</option>}
      {props.options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  ),

  Card: ({ props, children }: any) => (
    <div style={{
      background: props.background ?? "#1f1f1f", border: "1px solid #2a2a2a",
      borderRadius: props.borderRadius ?? 12, padding: props.padding ?? 16,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      {props.title && <div style={{ fontSize: 16, fontWeight: 600, color: "#e0e0e0" }}>{props.title}</div>}
      {props.description && <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>{props.description}</div>}
      {children}
    </div>
  ),

  Alert: ({ props }: any) => (
    <div style={{
      padding: "12px 16px", borderRadius: 8,
      border: `1px solid ${props.variant === "destructive" ? "#ff4d4f33" : "#333"}`,
      background: props.variant === "destructive" ? "#ff4d4f11" : "#1a1a1a",
    }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: props.variant === "destructive" ? "#ff4d4f" : "#e0e0e0" }}>
        {props.title}
      </div>
      {props.description && <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{props.description}</div>}
    </div>
  ),

  Tabs: ({ children }: any) => (
    <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
  ),

  TabsList: ({ children }: any) => (
    <div style={{
      display: "flex", gap: 2, background: "#1a1a1a", borderRadius: 8,
      padding: 3, marginBottom: 12,
    }}>{children}</div>
  ),

  TabsTrigger: ({ props }: any) => (
    <button style={{
      padding: "6px 16px", borderRadius: 6, border: "none",
      background: "transparent", color: "#888", fontSize: 12,
      fontWeight: 500, cursor: "pointer",
    }}>{props.label}</button>
  ),

  TabsContent: ({ children }: any) => (
    <div style={{ minHeight: 40 }}>{children}</div>
  ),
};

// ─── AI system prompt builder ───────────────────────────────

function buildSystemPrompt(): string {
  const sections: Record<string, string[]> = {};

  for (const comp of Object.values(components)) {
    const cat = comp.category.charAt(0).toUpperCase() + comp.category.slice(1);
    if (!sections[cat]) sections[cat] = [];

    const propList = Object.entries(comp.props)
      .map(([key, meta]) => {
        if (meta.type === "enum") return `${key}?: ${meta.options!.map((o) => `"${o}"`).join("|")}`;
        return `${key}${meta.required ? "" : "?"}: ${meta.type}`;
      })
      .join(", ");

    const childrenNote = comp.hasChildren ? ". Has children." : "";
    sections[cat].push(`- **${comp.type}**: ${comp.description}. Props: { ${propList} }${childrenNote}`);
  }

  const componentDocs = Object.entries(sections)
    .map(([cat, lines]) => `### ${cat}\n${lines.join("\n")}`)
    .join("\n\n");

  return `You are a UI design assistant that generates JSON specs for a React component renderer.

## Available Components

${componentDocs}

## Spec Format
Return a JSON object:
{
  "version": "1.0",
  "root": "root",
  "state": {},
  "elements": {
    "root": { "type": "Stack", "props": { "direction": "column", "padding": 16, "gap": 12 }, "children": ["child1"] },
    "child1": { "type": "Text", "props": { "text": "Hello", "size": 24, "weight": "bold" } }
  }
}

## Rules
- Every element needs a unique string ID
- Root is always "root" with type "Stack"
- Only use components listed above
- Return ONLY valid JSON, no markdown code blocks
- Generate realistic, visually appealing designs
- Use dark theme: backgrounds "#141414", text "#e0e0e0"`;
}

// ─── Provider Definition ────────────────────────────────────

export const jsonRenderProvider: ProviderDefinition = {
  id: "json-render",
  name: "JSON Render",
  description: "Default provider — inline React components with json-render spec format",
  version: "1.0.0",
  category: "web/ui",
  tags: ["react", "json", "renderer", "default"],

  components,
  actions,
  palette,
  renderers,

  nativeCatalog,
  nativeComponents,

  buildSystemPrompt,
};
