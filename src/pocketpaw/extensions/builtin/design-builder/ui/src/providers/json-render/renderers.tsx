/**
 * json-render Provider — React Renderers
 *
 * Maps component types to actual React elements.
 * Moved from the top-level registry.tsx — same implementations, now
 * expressed as plain functions satisfying RendererContext.
 */

import React from "react";
import type { RendererContext } from "../types";

type R = (ctx: RendererContext) => React.ReactNode;

// ─── Layout ─────────────────────────────────────────────────

const Stack: R = ({ props, children }) => {
  const dir = props.direction ?? "column";
  const justifyMap: Record<string, string> = {
    start: "flex-start", center: "center", end: "flex-end",
    between: "space-between", around: "space-around",
  };
  const alignMap: Record<string, string> = {
    start: "flex-start", center: "center", end: "flex-end", stretch: "stretch",
  };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: dir,
        gap: props.gap ?? 0,
        padding: props.padding ?? 0,
        flex: props.flex ?? undefined,
        background: props.background ?? undefined,
        borderRadius: props.borderRadius ?? undefined,
        alignItems: props.align ? alignMap[props.align] : undefined,
        justifyContent: props.justify ? justifyMap[props.justify] : undefined,
        minHeight: props.minHeight ?? undefined,
        border: props.border ?? undefined,
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
};

const ScrollView: R = ({ props, children }) => (
  <div
    style={{
      overflow: "auto",
      maxHeight: props.maxHeight ?? undefined,
      flexDirection: props.direction === "horizontal" ? "row" : "column",
    }}
  >
    {children}
  </div>
);

// ─── Display ────────────────────────────────────────────────

const Text: R = ({ props }) => (
  <span
    style={{
      fontSize: props.size ?? 14,
      fontWeight: props.weight ?? "normal",
      color: props.color ?? "inherit",
      textAlign: (props.align as any) ?? undefined,
      fontStyle: props.italic ? "italic" : undefined,
      lineHeight: props.lineHeight ? `${props.lineHeight}px` : undefined,
      display: "block",
    }}
  >
    {props.text}
  </span>
);

const Heading: R = ({ props }) => {
  const sizes: Record<number, number> = { 1: 32, 2: 24, 3: 20, 4: 16 };
  const level = props.level ?? 2;
  return (
    <div
      style={{
        fontSize: sizes[level] ?? 20,
        fontWeight: "bold",
        color: props.color ?? "inherit",
        textAlign: (props.align as any) ?? undefined,
        margin: "4px 0",
      }}
    >
      {props.text}
    </div>
  );
};

const Image: R = ({ props }) => (
  <img
    src={props.uri}
    alt=""
    style={{
      width: props.width ?? "100%",
      height: props.height ?? "auto",
      borderRadius: props.borderRadius ?? 0,
      objectFit: (props.objectFit as any) ?? "cover",
      display: "block",
    }}
  />
);

const Badge: R = ({ props }) => {
  const colors: Record<string, { bg: string; text: string }> = {
    default: { bg: "#1677ff", text: "#fff" },
    secondary: { bg: "#333", text: "#ccc" },
    destructive: { bg: "#ff4d4f", text: "#fff" },
    outline: { bg: "transparent", text: "#888" },
  };
  const c = colors[props.variant ?? "default"];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.text,
        border: props.variant === "outline" ? "1px solid #444" : "none",
      }}
    >
      {props.text}
    </span>
  );
};

const Avatar: R = ({ props }) => {
  const size = props.size ?? 40;
  return props.uri ? (
    <img
      src={props.uri}
      alt={props.fallback}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }}
    />
  ) : (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: "#333", display: "flex", alignItems: "center",
        justifyContent: "center", color: "#aaa", fontSize: size * 0.4,
        fontWeight: 600,
      }}
    >
      {props.fallback.slice(0, 2).toUpperCase()}
    </div>
  );
};

const Separator: R = ({ props }) => (
  <div
    style={{
      width: props.orientation === "vertical" ? 1 : "100%",
      height: props.orientation === "vertical" ? "100%" : 1,
      background: props.color ?? "#333",
      flexShrink: 0,
    }}
  />
);

const Skeleton: R = ({ props }) => (
  <div
    style={{
      width: props.width ?? "100%",
      height: props.height ?? 20,
      borderRadius: props.borderRadius ?? 4,
      background: "linear-gradient(90deg, #222 25%, #2a2a2a 50%, #222 75%)",
      backgroundSize: "200% 100%",
      animation: "skeleton-pulse 1.5s infinite ease-in-out",
    }}
  />
);

const Progress: R = ({ props }) => {
  const pct = Math.min(100, (props.value / (props.max ?? 100)) * 100);
  return (
    <div style={{ width: "100%", height: 8, borderRadius: 4, background: "#222", overflow: "hidden" }}>
      <div
        style={{
          width: `${pct}%`, height: "100%", borderRadius: 4,
          background: props.color ?? "#1677ff",
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
};

const Icon: R = ({ props }) => (
  <span
    style={{
      fontSize: props.size ?? 20,
      color: props.color ?? "inherit",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    ◆
  </span>
);

// ─── Input ──────────────────────────────────────────────────

const Button: R = ({ props, emit }) => {
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
    <button
      style={{
        ...variants[props.variant ?? "default"],
        ...sizeStyles[props.size ?? "default"],
        borderRadius: 6,
        fontWeight: 500,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.5 : 1,
        lineHeight: 1.5,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        transition: "all 0.15s ease",
      }}
      onClick={() => emit("press")}
      disabled={props.disabled ?? false}
    >
      {props.label}
    </button>
  );
};

const Input: R = ({ props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {props.label && <label style={{ fontSize: 12, color: "#888" }}>{props.label}</label>}
    <input
      type={props.type ?? "text"}
      placeholder={props.placeholder ?? ""}
      defaultValue={props.value ?? ""}
      style={{
        padding: "8px 12px",
        background: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: 6,
        color: "#e0e0e0",
        fontSize: 13,
        outline: "none",
      }}
    />
  </div>
);

const Textarea: R = ({ props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {props.label && <label style={{ fontSize: 12, color: "#888" }}>{props.label}</label>}
    <textarea
      placeholder={props.placeholder ?? ""}
      defaultValue={props.value ?? ""}
      rows={props.rows ?? 3}
      style={{
        padding: "8px 12px",
        background: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: 6,
        color: "#e0e0e0",
        fontSize: 13,
        outline: "none",
        resize: "vertical",
        fontFamily: "inherit",
      }}
    />
  </div>
);

const Checkbox: R = ({ props }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
    <input type="checkbox" defaultChecked={props.checked ?? false} style={{ accentColor: "#1677ff" }} />
    {props.label && <span style={{ color: "#e0e0e0" }}>{props.label}</span>}
  </label>
);

const Switch: R = ({ props }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
    <div
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: props.checked ? "#1677ff" : "#333",
        position: "relative", transition: "background 0.2s",
      }}
    >
      <div
        style={{
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff", position: "absolute", top: 2,
          left: props.checked ? 18 : 2, transition: "left 0.2s",
        }}
      />
    </div>
    {props.label && <span style={{ color: "#e0e0e0" }}>{props.label}</span>}
  </label>
);

const Select: R = ({ props }) => (
  <select
    style={{
      padding: "8px 12px",
      background: "#1a1a1a",
      border: "1px solid #333",
      borderRadius: 6,
      color: "#e0e0e0",
      fontSize: 13,
    }}
  >
    {props.placeholder && <option value="">{props.placeholder}</option>}
    {props.options?.map((opt: any) => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
);

// ─── Containers ─────────────────────────────────────────────

const Card: R = ({ props, children }) => (
  <div
    style={{
      background: props.background ?? "#1f1f1f",
      border: "1px solid #2a2a2a",
      borderRadius: props.borderRadius ?? 12,
      padding: props.padding ?? 16,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}
  >
    {props.title && (
      <div style={{ fontSize: 16, fontWeight: 600, color: "#e0e0e0" }}>{props.title}</div>
    )}
    {props.description && (
      <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>{props.description}</div>
    )}
    {children}
  </div>
);

const Alert: R = ({ props }) => (
  <div
    style={{
      padding: "12px 16px",
      borderRadius: 8,
      border: `1px solid ${props.variant === "destructive" ? "#ff4d4f33" : "#333"}`,
      background: props.variant === "destructive" ? "#ff4d4f11" : "#1a1a1a",
    }}
  >
    <div style={{ fontWeight: 600, fontSize: 13, color: props.variant === "destructive" ? "#ff4d4f" : "#e0e0e0" }}>
      {props.title}
    </div>
    {props.description && (
      <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{props.description}</div>
    )}
  </div>
);

// ─── Navigation ─────────────────────────────────────────────

const Tabs: R = ({ children }) => (
  <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
);

const TabsList: R = ({ children }) => (
  <div
    style={{
      display: "flex",
      gap: 2,
      background: "#1a1a1a",
      borderRadius: 8,
      padding: 3,
      marginBottom: 12,
    }}
  >
    {children}
  </div>
);

const TabsTrigger: R = ({ props }) => (
  <button
    style={{
      padding: "6px 16px",
      borderRadius: 6,
      border: "none",
      background: "transparent",
      color: "#888",
      fontSize: 12,
      fontWeight: 500,
      cursor: "pointer",
    }}
  >
    {props.label}
  </button>
);

const TabsContent: R = ({ children }) => (
  <div style={{ minHeight: 40 }}>{children}</div>
);

// ─── Export ─────────────────────────────────────────────────

export const renderers: Record<string, R> = {
  Stack, ScrollView,
  Text, Heading, Image, Badge, Avatar, Separator, Skeleton, Progress, Icon,
  Button, Input, Textarea, Checkbox, Switch, Select,
  Card, Alert,
  Tabs, TabsList, TabsTrigger, TabsContent,
};
