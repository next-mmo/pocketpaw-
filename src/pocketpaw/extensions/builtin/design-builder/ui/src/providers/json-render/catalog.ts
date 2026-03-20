/**
 * json-render Provider — Catalog
 *
 * The original json-render catalog, now exporting ComponentMeta / PaletteSection
 * so it plugs into the modular provider system.
 */

import type { ComponentMeta, ActionMeta, PaletteSection } from "../types";

// ─── Component definitions ──────────────────────────────────

export const components: Record<string, ComponentMeta> = {
  // ── Layout ──
  Stack: {
    type: "Stack",
    description: "Flex container — vertical or horizontal layout with gap, padding, background",
    category: "layout",
    icon: "⬜",
    hasChildren: true,
    defaultProps: { direction: "column", gap: 12, padding: 16, background: "#1a1a1a", borderRadius: 8 },
    props: {
      direction:    { type: "enum", options: ["column", "row"] },
      gap:          { type: "number" },
      padding:      { type: "number" },
      flex:         { type: "number" },
      background:   { type: "string" },
      borderRadius: { type: "number" },
      align:        { type: "enum", options: ["start", "center", "end", "stretch"] },
      justify:      { type: "enum", options: ["start", "center", "end", "between", "around"] },
      minHeight:    { type: "number" },
      border:       { type: "string" },
    },
  },

  ScrollView: {
    type: "ScrollView",
    description: "Scrollable container",
    category: "layout",
    icon: "📜",
    hasChildren: true,
    defaultProps: { direction: "vertical" },
    props: {
      direction: { type: "enum", options: ["vertical", "horizontal"] },
      maxHeight: { type: "number" },
    },
  },

  // ── Display ──
  Text: {
    type: "Text",
    description: "Text display — customizable size, weight, color",
    category: "display",
    icon: "✏️",
    defaultProps: { text: "Text", size: 14, color: "#e0e0e0" },
    props: {
      text:       { type: "string", required: true },
      size:       { type: "number" },
      weight:     { type: "enum", options: ["normal", "bold", "semibold", "light"] },
      color:      { type: "string" },
      align:      { type: "enum", options: ["left", "center", "right"] },
      italic:     { type: "boolean" },
      lineHeight: { type: "number" },
    },
  },

  Heading: {
    type: "Heading",
    description: "Section heading (h1-h4)",
    category: "display",
    icon: "H",
    defaultProps: { text: "Heading", level: 2 },
    props: {
      text:  { type: "string", required: true },
      level: { type: "number", description: "1-4" },
      color: { type: "string" },
      align: { type: "enum", options: ["left", "center", "right"] },
    },
  },

  Image: {
    type: "Image",
    description: "Image display",
    category: "display",
    icon: "🖼",
    defaultProps: { uri: "https://picsum.photos/200/100", width: 200, height: 100, borderRadius: 8 },
    props: {
      uri:          { type: "string", required: true },
      width:        { type: "number" },
      height:       { type: "number" },
      borderRadius: { type: "number" },
      objectFit:    { type: "enum", options: ["cover", "contain", "fill"] },
    },
  },

  Badge: {
    type: "Badge",
    description: "Small label badge",
    category: "display",
    icon: "🏷",
    defaultProps: { text: "Badge", variant: "default" },
    props: {
      text:    { type: "string", required: true },
      variant: { type: "enum", options: ["default", "secondary", "destructive", "outline"] },
    },
  },

  Avatar: {
    type: "Avatar",
    description: "User avatar with image or fallback initials",
    category: "display",
    icon: "👤",
    defaultProps: { fallback: "AB", size: 40 },
    props: {
      uri:      { type: "string" },
      fallback: { type: "string", required: true },
      size:     { type: "number" },
    },
  },

  Separator: {
    type: "Separator",
    description: "Visual divider line",
    category: "display",
    icon: "—",
    defaultProps: { orientation: "horizontal" },
    props: {
      orientation: { type: "enum", options: ["horizontal", "vertical"] },
      color:       { type: "string" },
    },
  },

  Skeleton: {
    type: "Skeleton",
    description: "Loading placeholder",
    category: "display",
    icon: "▪",
    defaultProps: { width: 100, height: 20 },
    props: {
      width:        { type: "number" },
      height:       { type: "number" },
      borderRadius: { type: "number" },
    },
  },

  Progress: {
    type: "Progress",
    description: "Progress bar",
    category: "display",
    icon: "▰",
    defaultProps: { value: 65, max: 100 },
    props: {
      value: { type: "number", required: true },
      max:   { type: "number" },
      color: { type: "string" },
    },
  },

  Icon: {
    type: "Icon",
    description: "Icon display (Lucide icon names)",
    category: "display",
    icon: "◆",
    defaultProps: { name: "star", size: 20, color: "#faad14" },
    props: {
      name:  { type: "string", required: true },
      size:  { type: "number" },
      color: { type: "string" },
    },
  },

  // ── Input ──
  Button: {
    type: "Button",
    description: "Clickable button",
    category: "input",
    icon: "🔘",
    defaultProps: { label: "Button", variant: "default" },
    props: {
      label:    { type: "string", required: true },
      variant:  { type: "enum", options: ["default", "secondary", "destructive", "outline", "ghost", "link"] },
      size:     { type: "enum", options: ["default", "sm", "lg"] },
      action:   { type: "string" },
      disabled: { type: "boolean" },
    },
  },

  Input: {
    type: "Input",
    description: "Text input field",
    category: "input",
    icon: "📝",
    defaultProps: { placeholder: "Enter text..." },
    props: {
      placeholder: { type: "string" },
      value:       { type: "string" },
      type:        { type: "enum", options: ["text", "password", "email", "number"] },
      label:       { type: "string" },
    },
  },

  Textarea: {
    type: "Textarea",
    description: "Multi-line text input",
    category: "input",
    icon: "📋",
    defaultProps: { placeholder: "Enter text...", rows: 3 },
    props: {
      placeholder: { type: "string" },
      value:       { type: "string" },
      rows:        { type: "number" },
      label:       { type: "string" },
    },
  },

  Checkbox: {
    type: "Checkbox",
    description: "Toggle checkbox",
    category: "input",
    icon: "☑",
    defaultProps: { label: "Checkbox" },
    props: {
      label:   { type: "string" },
      checked: { type: "boolean" },
    },
  },

  Switch: {
    type: "Switch",
    description: "Toggle switch",
    category: "input",
    icon: "🔀",
    defaultProps: { label: "Toggle" },
    props: {
      label:   { type: "string" },
      checked: { type: "boolean" },
    },
  },

  Select: {
    type: "Select",
    description: "Dropdown select",
    category: "input",
    icon: "▾",
    defaultProps: {
      placeholder: "Select...",
      options: [{ label: "Option 1", value: "1" }, { label: "Option 2", value: "2" }],
    },
    props: {
      placeholder: { type: "string" },
      options:     { type: "array", description: "Array of { label, value }" },
    },
  },

  // ── Containers ──
  Card: {
    type: "Card",
    description: "Card container with optional title/description",
    category: "container",
    icon: "📇",
    hasChildren: true,
    defaultProps: { title: "Card Title", description: "Description" },
    props: {
      title:        { type: "string" },
      description:  { type: "string" },
      background:   { type: "string" },
      borderRadius: { type: "number" },
      padding:      { type: "number" },
    },
  },

  Alert: {
    type: "Alert",
    description: "Alert message box",
    category: "container",
    icon: "⚠",
    defaultProps: { title: "Alert", description: "Something happened" },
    props: {
      title:       { type: "string", required: true },
      description: { type: "string" },
      variant:     { type: "enum", options: ["default", "destructive"] },
    },
  },

  // ── Navigation ──
  Tabs: {
    type: "Tabs",
    description: "Tab container — must contain TabsList and TabsContent children",
    category: "navigation",
    icon: "📑",
    hasChildren: true,
    defaultProps: {},
    props: {
      defaultValue: { type: "string" },
    },
  },

  TabsList: {
    type: "TabsList",
    description: "Tab button bar — contains TabsTrigger children",
    category: "navigation",
    icon: "📑",
    hasChildren: true,
    defaultProps: {},
    props: {},
  },

  TabsTrigger: {
    type: "TabsTrigger",
    description: "Individual tab button",
    category: "navigation",
    icon: "📑",
    defaultProps: { value: "tab1", label: "Tab 1" },
    props: {
      value: { type: "string", required: true },
      label: { type: "string", required: true },
    },
  },

  TabsContent: {
    type: "TabsContent",
    description: "Tab panel content area",
    category: "navigation",
    icon: "📑",
    hasChildren: true,
    defaultProps: { value: "tab1" },
    props: {
      value: { type: "string", required: true },
    },
  },
};

// ─── Actions ────────────────────────────────────────────────

export const actions: ActionMeta[] = [
  { name: "navigate", description: "Navigate to a route or screen" },
  { name: "submit",   description: "Submit form data" },
  { name: "dismiss",  description: "Close or dismiss the current view" },
  { name: "refresh",  description: "Refresh the current data" },
  { name: "setState", description: "Update a state value" },
];

// ─── Palette ────────────────────────────────────────────────

export const palette: PaletteSection[] = [
  {
    section: "Layout",
    items: [
      { type: "Stack",      icon: "⬜", defaultProps: components.Stack.defaultProps },
      { type: "ScrollView", icon: "📜", defaultProps: components.ScrollView.defaultProps },
    ],
  },
  {
    section: "Display",
    items: [
      { type: "Text",      icon: "✏️", defaultProps: components.Text.defaultProps },
      { type: "Heading",   icon: "H",  defaultProps: components.Heading.defaultProps },
      { type: "Image",     icon: "🖼", defaultProps: components.Image.defaultProps },
      { type: "Badge",     icon: "🏷", defaultProps: components.Badge.defaultProps },
      { type: "Avatar",    icon: "👤", defaultProps: components.Avatar.defaultProps },
      { type: "Separator", icon: "—",  defaultProps: components.Separator.defaultProps },
      { type: "Progress",  icon: "▰",  defaultProps: components.Progress.defaultProps },
      { type: "Icon",      icon: "◆",  defaultProps: components.Icon.defaultProps },
    ],
  },
  {
    section: "Input",
    items: [
      { type: "Button",   icon: "🔘", defaultProps: components.Button.defaultProps },
      { type: "Input",    icon: "📝", defaultProps: components.Input.defaultProps },
      { type: "Textarea", icon: "📋", defaultProps: components.Textarea.defaultProps },
      { type: "Checkbox", icon: "☑",  defaultProps: components.Checkbox.defaultProps },
      { type: "Switch",   icon: "🔀", defaultProps: components.Switch.defaultProps },
      { type: "Select",   icon: "▾",  defaultProps: components.Select.defaultProps },
    ],
  },
  {
    section: "Container",
    items: [
      { type: "Card",  icon: "📇", defaultProps: components.Card.defaultProps },
      { type: "Alert", icon: "⚠",  defaultProps: components.Alert.defaultProps },
    ],
  },
];
