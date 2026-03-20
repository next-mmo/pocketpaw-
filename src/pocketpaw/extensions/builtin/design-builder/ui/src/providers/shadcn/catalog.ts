/**
 * shadcn Provider — Catalog
 *
 * Defines the shadcn/ui-inspired component catalog.
 * Same ProviderDefinition contract — different visual style.
 */

import type { ComponentMeta, ActionMeta, PaletteSection } from "../types";

// ─── Component definitions ──────────────────────────────────

export const components: Record<string, ComponentMeta> = {
  // ── Layout ──
  Flex: {
    type: "Flex",
    description: "Flexbox container with automatic gap and direction",
    category: "layout",
    icon: "⬜",
    hasChildren: true,
    defaultProps: { direction: "column", gap: 16, padding: 24 },
    props: {
      direction: { type: "enum", options: ["column", "row", "row-reverse", "column-reverse"] },
      gap:       { type: "number" },
      padding:   { type: "number" },
      align:     { type: "enum", options: ["start", "center", "end", "stretch", "baseline"] },
      justify:   { type: "enum", options: ["start", "center", "end", "between", "around", "evenly"] },
      wrap:      { type: "boolean", description: "flex-wrap" },
    },
  },

  Grid: {
    type: "Grid",
    description: "CSS Grid container",
    category: "layout",
    icon: "⊞",
    hasChildren: true,
    defaultProps: { columns: 2, gap: 16 },
    props: {
      columns:  { type: "number", description: "Number of columns" },
      gap:      { type: "number" },
      padding:  { type: "number" },
    },
  },

  // ── Display ──
  Text: {
    type: "Text",
    description: "Paragraph text with muted/lead variants",
    category: "display",
    icon: "✏️",
    defaultProps: { text: "Text content", variant: "default" },
    props: {
      text:    { type: "string", required: true },
      variant: { type: "enum", options: ["default", "lead", "muted", "large", "small"] },
      color:   { type: "string" },
    },
  },

  Heading: {
    type: "Heading",
    description: "Typography heading (h1-h4)",
    category: "display",
    icon: "H",
    defaultProps: { text: "Heading", level: 2 },
    props: {
      text:  { type: "string", required: true },
      level: { type: "number", description: "1-4" },
    },
  },

  Image: {
    type: "Image",
    description: "Responsive image with aspect ratio",
    category: "display",
    icon: "🖼",
    defaultProps: { src: "https://picsum.photos/400/200", alt: "Image", aspectRatio: "16/9" },
    props: {
      src:         { type: "string", required: true },
      alt:         { type: "string", required: true },
      aspectRatio: { type: "string" },
      rounded:     { type: "enum", options: ["none", "sm", "md", "lg", "xl", "full"] },
    },
  },

  Badge: {
    type: "Badge",
    description: "Inline badge label",
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
    description: "Circular avatar with fallback",
    category: "display",
    icon: "👤",
    defaultProps: { fallback: "CN", size: "md" },
    props: {
      src:      { type: "string" },
      fallback: { type: "string", required: true },
      size:     { type: "enum", options: ["sm", "md", "lg", "xl"] },
    },
  },

  Separator: {
    type: "Separator",
    description: "Horizontal or vertical separator",
    category: "display",
    icon: "—",
    defaultProps: { orientation: "horizontal" },
    props: {
      orientation: { type: "enum", options: ["horizontal", "vertical"] },
    },
  },

  Progress: {
    type: "Progress",
    description: "Animated progress bar",
    category: "display",
    icon: "▰",
    defaultProps: { value: 60 },
    props: {
      value: { type: "number", required: true },
    },
  },

  Skeleton: {
    type: "Skeleton",
    description: "Loading skeleton placeholder",
    category: "display",
    icon: "▪",
    defaultProps: { width: 200, height: 20 },
    props: {
      width:   { type: "number" },
      height:  { type: "number" },
      rounded: { type: "enum", options: ["none", "sm", "md", "lg", "full"] },
    },
  },

  // ── Input ──
  Button: {
    type: "Button",
    description: "shadcn-styled button",
    category: "input",
    icon: "🔘",
    defaultProps: { label: "Button", variant: "default" },
    props: {
      label:    { type: "string", required: true },
      variant:  { type: "enum", options: ["default", "secondary", "destructive", "outline", "ghost", "link"] },
      size:     { type: "enum", options: ["default", "sm", "lg", "icon"] },
      disabled: { type: "boolean" },
    },
  },

  Input: {
    type: "Input",
    description: "Rounded input with label support",
    category: "input",
    icon: "📝",
    defaultProps: { placeholder: "Enter text..." },
    props: {
      placeholder: { type: "string" },
      value:       { type: "string" },
      type:        { type: "enum", options: ["text", "password", "email", "number", "search"] },
      label:       { type: "string" },
      disabled:    { type: "boolean" },
    },
  },

  Textarea: {
    type: "Textarea",
    description: "Multi-line textarea",
    category: "input",
    icon: "📋",
    defaultProps: { placeholder: "Type your message..." },
    props: {
      placeholder: { type: "string" },
      value:       { type: "string" },
      rows:        { type: "number" },
      label:       { type: "string" },
    },
  },

  Checkbox: {
    type: "Checkbox",
    description: "Checkbox with label",
    category: "input",
    icon: "☑",
    defaultProps: { label: "Accept terms" },
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
    defaultProps: { label: "Airplane mode" },
    props: {
      label:   { type: "string" },
      checked: { type: "boolean" },
    },
  },

  Select: {
    type: "Select",
    description: "Styled dropdown select",
    category: "input",
    icon: "▾",
    defaultProps: {
      placeholder: "Select an option",
      options: [{ label: "Light", value: "light" }, { label: "Dark", value: "dark" }, { label: "System", value: "system" }],
    },
    props: {
      placeholder: { type: "string" },
      options:     { type: "array", description: "Array of { label, value }" },
    },
  },

  // ── Container ──
  Card: {
    type: "Card",
    description: "Card with header, content, and footer slots",
    category: "container",
    icon: "📇",
    hasChildren: true,
    defaultProps: { title: "Card Title", description: "Card description" },
    props: {
      title:       { type: "string" },
      description: { type: "string" },
    },
  },

  Alert: {
    type: "Alert",
    description: "Alert with icon and description",
    category: "container",
    icon: "⚠",
    defaultProps: { title: "Heads up!", description: "You can add components to your app using the cli." },
    props: {
      title:       { type: "string", required: true },
      description: { type: "string" },
      variant:     { type: "enum", options: ["default", "destructive"] },
    },
  },

  Dialog: {
    type: "Dialog",
    description: "Modal dialog overlay",
    category: "container",
    icon: "🪟",
    hasChildren: true,
    defaultProps: { title: "Dialog Title", description: "Dialog description", open: true },
    props: {
      title:       { type: "string" },
      description: { type: "string" },
      open:        { type: "boolean" },
    },
  },

  Sheet: {
    type: "Sheet",
    description: "Slide-in panel (from side)",
    category: "container",
    icon: "◫",
    hasChildren: true,
    defaultProps: { title: "Sheet Title", side: "right", open: true },
    props: {
      title: { type: "string" },
      side:  { type: "enum", options: ["top", "right", "bottom", "left"] },
      open:  { type: "boolean" },
    },
  },

  // ── Navigation ──
  Tabs: {
    type: "Tabs",
    description: "Tab container",
    category: "navigation",
    icon: "📑",
    hasChildren: true,
    defaultProps: { defaultValue: "tab1" },
    props: {
      defaultValue: { type: "string" },
    },
  },

  TabsList: {
    type: "TabsList",
    description: "Tab trigger bar",
    category: "navigation",
    icon: "📑",
    hasChildren: true,
    defaultProps: {},
    props: {},
  },

  TabsTrigger: {
    type: "TabsTrigger",
    description: "Tab trigger button",
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
    description: "Tab content panel",
    category: "navigation",
    icon: "📑",
    hasChildren: true,
    defaultProps: { value: "tab1" },
    props: {
      value: { type: "string", required: true },
    },
  },

  // ── Data Display ──
  Table: {
    type: "Table",
    description: "Data table with headers and rows",
    category: "data",
    icon: "📊",
    defaultProps: {
      headers: ["Name", "Status", "Role"],
      rows: [
        ["Alice", "Active", "Admin"],
        ["Bob", "Inactive", "User"],
      ],
    },
    props: {
      headers: { type: "array", description: "Array of header strings" },
      rows:    { type: "array", description: "Array of row arrays" },
    },
  },
};

// ─── Actions ────────────────────────────────────────────────

export const actions: ActionMeta[] = [
  { name: "navigate",    description: "Navigate to a route" },
  { name: "submit",      description: "Submit form data" },
  { name: "dismiss",     description: "Close modal / dialog" },
  { name: "openDialog",  description: "Open a dialog" },
  { name: "closeDialog", description: "Close a dialog" },
  { name: "setState",    description: "Update state value" },
];

// ─── Palette ────────────────────────────────────────────────

export const palette: PaletteSection[] = [
  {
    section: "Layout",
    items: [
      { type: "Flex", icon: "⬜", defaultProps: components.Flex.defaultProps },
      { type: "Grid", icon: "⊞", defaultProps: components.Grid.defaultProps },
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
      { type: "Skeleton",  icon: "▪",  defaultProps: components.Skeleton.defaultProps },
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
      { type: "Card",   icon: "📇", defaultProps: components.Card.defaultProps },
      { type: "Alert",  icon: "⚠",  defaultProps: components.Alert.defaultProps },
      { type: "Dialog", icon: "🪟", defaultProps: components.Dialog.defaultProps },
      { type: "Sheet",  icon: "◫",  defaultProps: components.Sheet.defaultProps },
    ],
  },
  {
    section: "Data",
    items: [
      { type: "Table", icon: "📊", defaultProps: components.Table.defaultProps },
    ],
  },
];
