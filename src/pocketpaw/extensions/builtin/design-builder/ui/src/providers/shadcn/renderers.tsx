/**
 * shadcn Provider — React Renderers
 *
 * Implements the shadcn/ui visual style using plain inline CSS.
 * Follows the shadcn dark‑mode aesthetic with zinc/slate palette.
 */

import React from "react";
import type { RendererContext } from "../types";

type R = (ctx: RendererContext) => React.ReactNode;

// ─── Design tokens (shadcn zinc dark theme) ─────────────────

const t = {
  bg:          "hsl(240 10% 3.9%)",
  bgCard:      "hsl(240 10% 3.9%)",
  bgMuted:     "hsl(240 3.7% 15.9%)",
  bgPopover:   "hsl(240 10% 3.9%)",
  border:      "hsl(240 3.7% 15.9%)",
  ring:        "hsl(240 4.9% 83.9%)",
  text:        "hsl(0 0% 98%)",
  textMuted:   "hsl(240 5% 64.9%)",
  primary:     "hsl(0 0% 98%)",
  primaryFg:   "hsl(240 5.9% 10%)",
  secondary:   "hsl(240 3.7% 15.9%)",
  secondaryFg: "hsl(0 0% 98%)",
  destructive: "hsl(0 62.8% 30.6%)",
  destructiveFg: "hsl(0 0% 98%)",
  accent:      "hsl(240 3.7% 15.9%)",
  accentFg:    "hsl(0 0% 98%)",
  radius:      8,
};

// ─── Layout ─────────────────────────────────────────────────

const Flex: R = ({ props, children }) => {
  const justifyMap: Record<string, string> = {
    start: "flex-start", center: "center", end: "flex-end",
    between: "space-between", around: "space-around", evenly: "space-evenly",
  };
  const alignMap: Record<string, string> = {
    start: "flex-start", center: "center", end: "flex-end",
    stretch: "stretch", baseline: "baseline",
  };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: props.direction ?? "column",
        gap: props.gap ?? 0,
        padding: props.padding ?? 0,
        alignItems: props.align ? alignMap[props.align] : undefined,
        justifyContent: props.justify ? justifyMap[props.justify] : undefined,
        flexWrap: props.wrap ? "wrap" : undefined,
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
};

const Grid: R = ({ props, children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `repeat(${props.columns ?? 2}, 1fr)`,
      gap: props.gap ?? 16,
      padding: props.padding ?? 0,
      boxSizing: "border-box",
    }}
  >
    {children}
  </div>
);

// ─── Display ────────────────────────────────────────────────

const textVariantStyles: Record<string, React.CSSProperties> = {
  default: { fontSize: 14, lineHeight: "1.625", color: t.text },
  lead:    { fontSize: 18, lineHeight: "1.625", color: t.textMuted },
  muted:   { fontSize: 14, lineHeight: "1.625", color: t.textMuted },
  large:   { fontSize: 18, fontWeight: 600, lineHeight: "1.4", color: t.text },
  small:   { fontSize: 13, lineHeight: "1.4", color: t.text },
};

const Text: R = ({ props }) => (
  <p
    style={{
      margin: 0,
      ...textVariantStyles[props.variant ?? "default"],
      ...(props.color ? { color: props.color } : {}),
    }}
  >
    {props.text}
  </p>
);

const headingSizes: Record<number, React.CSSProperties> = {
  1: { fontSize: 36, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: "1.1" },
  2: { fontSize: 28, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: "1.2" },
  3: { fontSize: 22, fontWeight: 600, lineHeight: "1.3" },
  4: { fontSize: 18, fontWeight: 600, lineHeight: "1.4" },
};

const Heading: R = ({ props }) => {
  const level = props.level ?? 2;
  return (
    <div style={{ color: t.text, margin: "4px 0", ...headingSizes[level] }}>
      {props.text}
    </div>
  );
};

const Image: R = ({ props }) => {
  const radiusMap: Record<string, number> = { none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 };
  return (
    <img
      src={props.src}
      alt={props.alt ?? ""}
      style={{
        width: "100%",
        aspectRatio: props.aspectRatio ?? undefined,
        borderRadius: radiusMap[props.rounded ?? "md"] ?? 8,
        objectFit: "cover",
        display: "block",
      }}
    />
  );
};

const Badge: R = ({ props }) => {
  const styles: Record<string, React.CSSProperties> = {
    default:     { background: t.primary, color: t.primaryFg, border: "none" },
    secondary:   { background: t.secondary, color: t.secondaryFg, border: "none" },
    destructive: { background: t.destructive, color: t.destructiveFg, border: "none" },
    outline:     { background: "transparent", color: t.text, border: `1px solid ${t.border}` },
  };
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 10px", borderRadius: 9999,
        fontSize: 12, fontWeight: 500, lineHeight: 1.5,
        ...styles[props.variant ?? "default"],
      }}
    >
      {props.text}
    </span>
  );
};

const Avatar: R = ({ props }) => {
  const sizeMap: Record<string, number> = { sm: 32, md: 40, lg: 48, xl: 64 };
  const size = sizeMap[props.size ?? "md"] ?? 40;
  return props.src ? (
    <img
      src={props.src}
      alt={props.fallback}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }}
    />
  ) : (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: t.bgMuted, display: "flex", alignItems: "center",
        justifyContent: "center", color: t.textMuted, fontSize: size * 0.38,
        fontWeight: 600,
      }}
    >
      {props.fallback?.slice(0, 2).toUpperCase()}
    </div>
  );
};

const Separator: R = ({ props }) => (
  <div
    style={{
      width: props.orientation === "vertical" ? 1 : "100%",
      height: props.orientation === "vertical" ? "100%" : 1,
      background: t.border,
      flexShrink: 0,
    }}
  />
);

const Progress: R = ({ props }) => {
  const pct = Math.min(100, Math.max(0, props.value ?? 0));
  return (
    <div style={{ width: "100%", height: 8, borderRadius: 9999, background: t.bgMuted, overflow: "hidden" }}>
      <div
        style={{
          width: `${pct}%`, height: "100%",
          background: t.primary, borderRadius: 9999,
          transition: "width 0.5s cubic-bezier(0.65,0,0.35,1)",
        }}
      />
    </div>
  );
};

const Skeleton: R = ({ props }) => {
  const radiusMap: Record<string, number> = { none: 0, sm: 4, md: 8, lg: 12, full: 9999 };
  return (
    <div
      style={{
        width: props.width ?? "100%",
        height: props.height ?? 20,
        borderRadius: radiusMap[props.rounded ?? "md"] ?? 8,
        background: t.bgMuted,
        animation: "shadcn-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
      }}
    />
  );
};

// ─── Input ──────────────────────────────────────────────────

const Button: R = ({ props, emit }) => {
  const variantStyles: Record<string, React.CSSProperties> = {
    default:     { background: t.primary, color: t.primaryFg, border: "none" },
    secondary:   { background: t.secondary, color: t.secondaryFg, border: "none" },
    destructive: { background: t.destructive, color: t.destructiveFg, border: "none" },
    outline:     { background: "transparent", color: t.accentFg, border: `1px solid ${t.border}` },
    ghost:       { background: "transparent", color: t.accentFg, border: "none" },
    link:        { background: "transparent", color: t.primary, border: "none", textDecoration: "underline" },
  };
  const sizeStyles: Record<string, React.CSSProperties> = {
    sm:      { height: 32, padding: "0 12px", fontSize: 13, borderRadius: 6 },
    default: { height: 36, padding: "0 16px", fontSize: 14, borderRadius: 6 },
    lg:      { height: 40, padding: "0 24px", fontSize: 14, borderRadius: 6 },
    icon:    { height: 36, width: 36, padding: 0, fontSize: 14, borderRadius: 6 },
  };
  return (
    <button
      style={{
        ...variantStyles[props.variant ?? "default"],
        ...sizeStyles[props.size ?? "default"],
        fontWeight: 500,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.5 : 1,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: 8, transition: "all 0.15s ease", whiteSpace: "nowrap",
      }}
      onClick={() => emit("press")}
      disabled={props.disabled ?? false}
    >
      {props.label}
    </button>
  );
};

const inputStyle: React.CSSProperties = {
  height: 36, padding: "0 12px", width: "100%",
  background: t.bg, border: `1px solid ${t.border}`,
  borderRadius: 6, color: t.text, fontSize: 14,
  outline: "none", boxSizing: "border-box",
};

const Input: R = ({ props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {props.label && <label style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{props.label}</label>}
    <input
      type={props.type ?? "text"}
      placeholder={props.placeholder ?? ""}
      defaultValue={props.value ?? ""}
      disabled={props.disabled ?? false}
      style={{ ...inputStyle, opacity: props.disabled ? 0.5 : 1 }}
    />
  </div>
);

const Textarea: R = ({ props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {props.label && <label style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{props.label}</label>}
    <textarea
      placeholder={props.placeholder ?? ""}
      defaultValue={props.value ?? ""}
      rows={props.rows ?? 3}
      style={{
        ...inputStyle,
        height: "auto",
        padding: "8px 12px",
        resize: "vertical",
        fontFamily: "inherit",
      }}
    />
  </div>
);

const Checkbox: R = ({ props }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
    <div
      style={{
        width: 16, height: 16, borderRadius: 4,
        border: `1px solid ${t.primary}`,
        background: props.checked ? t.primary : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s ease",
      }}
    >
      {props.checked && <span style={{ color: t.primaryFg, fontSize: 11, lineHeight: 1 }}>✓</span>}
    </div>
    {props.label && <span style={{ color: t.text, fontWeight: 400 }}>{props.label}</span>}
  </label>
);

const Switch: R = ({ props }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
    <div
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: props.checked ? t.primary : t.bgMuted,
        position: "relative", transition: "background 0.2s",
        border: `1px solid ${props.checked ? t.primary : t.border}`,
      }}
    >
      <div
        style={{
          width: 20, height: 20, borderRadius: "50%",
          background: props.checked ? t.primaryFg : t.text,
          position: "absolute", top: 1,
          left: props.checked ? 22 : 1, transition: "left 0.2s",
        }}
      />
    </div>
    {props.label && <span style={{ color: t.text, fontSize: 14 }}>{props.label}</span>}
  </label>
);

const Select: R = ({ props }) => (
  <select
    style={{
      ...inputStyle,
      appearance: "none",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 12px center",
      paddingRight: 32,
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
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: t.radius,
      padding: 24,
      display: "flex", flexDirection: "column", gap: 8,
    }}
  >
    {props.title && <div style={{ fontSize: 18, fontWeight: 600, color: t.text, lineHeight: 1.2 }}>{props.title}</div>}
    {props.description && <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.625 }}>{props.description}</div>}
    {children && <div style={{ marginTop: 8 }}>{children}</div>}
  </div>
);

const Alert: R = ({ props }) => (
  <div
    style={{
      padding: "16px",
      borderRadius: t.radius,
      border: `1px solid ${props.variant === "destructive" ? t.destructive : t.border}`,
      background: t.bg,
      display: "flex", gap: 12, alignItems: "flex-start",
    }}
  >
    <span style={{ fontSize: 16, flexShrink: 0 }}>{props.variant === "destructive" ? "⚠" : "ℹ"}</span>
    <div>
      <div style={{ fontWeight: 600, fontSize: 14, color: props.variant === "destructive" ? "hsl(0 62.8% 50%)" : t.text, lineHeight: 1.4 }}>
        {props.title}
      </div>
      {props.description && (
        <div style={{ fontSize: 14, color: t.textMuted, marginTop: 4, lineHeight: 1.625 }}>{props.description}</div>
      )}
    </div>
  </div>
);

const Dialog: R = ({ props, children }) => {
  if (!props.open) return null;
  return (
    <div
      style={{
        position: "relative",
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        background: t.bgPopover,
        padding: 24,
        maxWidth: 420,
        width: "100%",
        boxShadow: "0 16px 48px rgba(0,0,0,.4)",
      }}
    >
      {props.title && <div style={{ fontSize: 18, fontWeight: 600, color: t.text }}>{props.title}</div>}
      {props.description && <div style={{ fontSize: 14, color: t.textMuted, marginTop: 4 }}>{props.description}</div>}
      {children && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  );
};

const Sheet: R = ({ props, children }) => {
  if (!props.open) return null;
  const isHorizontal = props.side === "left" || props.side === "right";
  return (
    <div
      style={{
        position: "relative",
        border: `1px solid ${t.border}`,
        borderRadius: t.radius,
        background: t.bgPopover,
        padding: 24,
        width: isHorizontal ? 320 : "100%",
        height: isHorizontal ? "100%" : 220,
        boxShadow: "0 16px 48px rgba(0,0,0,.4)",
      }}
    >
      {props.title && <div style={{ fontSize: 18, fontWeight: 600, color: t.text, marginBottom: 16 }}>{props.title}</div>}
      {children}
    </div>
  );
};

// ─── Navigation ─────────────────────────────────────────────

const Tabs: R = ({ children }) => (
  <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
);

const TabsList: R = ({ children }) => (
  <div
    style={{
      display: "inline-flex",
      gap: 0,
      background: t.bgMuted,
      borderRadius: 6,
      padding: 4,
      marginBottom: 16,
    }}
  >
    {children}
  </div>
);

const TabsTrigger: R = ({ props }) => (
  <button
    style={{
      padding: "6px 16px",
      borderRadius: 4,
      border: "none",
      background: "transparent",
      color: t.textMuted,
      fontSize: 14,
      fontWeight: 500,
      cursor: "pointer",
      transition: "all 0.15s ease",
      whiteSpace: "nowrap",
    }}
  >
    {props.label}
  </button>
);

const TabsContent: R = ({ children }) => (
  <div style={{ minHeight: 40 }}>{children}</div>
);

// ─── Data ───────────────────────────────────────────────────

const Table: R = ({ props }) => {
  const headers: string[] = props.headers ?? [];
  const rows: string[][] = props.rows ?? [];
  return (
    <div style={{ width: "100%", overflow: "auto", borderRadius: t.radius, border: `1px solid ${t.border}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${t.border}` }}>
            {headers.map((h: string, i: number) => (
              <th
                key={i}
                style={{
                  padding: "12px 16px", textAlign: "left",
                  fontWeight: 500, color: t.textMuted, fontSize: 13,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row: string[], ri: number) => (
            <tr key={ri} style={{ borderBottom: ri < rows.length - 1 ? `1px solid ${t.border}` : undefined }}>
              {row.map((cell: string, ci: number) => (
                <td key={ci} style={{ padding: "12px 16px", color: t.text }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Export ─────────────────────────────────────────────────

export const renderers: Record<string, R> = {
  Flex, Grid,
  Text, Heading, Image, Badge, Avatar, Separator, Progress, Skeleton,
  Button, Input, Textarea, Checkbox, Switch, Select,
  Card, Alert, Dialog, Sheet,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Table,
};
