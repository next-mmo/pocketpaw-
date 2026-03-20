/**
 * Design Builder — Main App
 *
 * 4-panel Figma-like layout:
 *   Left: Config / Chat / Layers / Palette
 *   Center: Live Canvas (json-render Renderer)
 *   Right: Props Panel for selected element
 */

import React, { useEffect, useRef, useState, useCallback, useMemo, type CSSProperties } from "react";
import { Renderer, StateProvider, ActionProvider, VisibilityProvider } from "@json-render/react";
import { buildActiveRegistry } from "./registry";
import { useDesignStore, type DesignSpec, type DesignElement } from "./store";
import { getPluginStatus } from "./sdk";
import { getActiveProvider } from "./providers";

// ─── Plugin status polling (using SDK) ──────────────────────

function usePluginStatus() {
  const setPluginStatus = useDesignStore((s) => s.setPluginStatus);
  const pluginStatus = useDesignStore((s) => s.pluginStatus);

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await getPluginStatus();
        setPluginStatus(data.status || "unknown");
      } catch {
        setPluginStatus("error");
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [setPluginStatus]);

  return pluginStatus;
}

// ─── Provider Tree Helpers ──────────────────────────────────

interface TreeNode {
  label: string;
  /** Segment path so far, e.g. "web" or "web/ui" */
  path: string;
  children: TreeNode[];
  /** If this node IS a provider leaf, its metadata */
  provider?: {
    id: string;
    name: string;
    description: string;
    version: string;
    tags?: string[];
  };
  /** "coming-soon" placeholder — shown but disabled */
  comingSoon?: boolean;
}

/**
 * Static tree structure.
 * Providers are slotted in based on their `category` field.
 * Placeholder nodes mark spots where future providers will go.
 */
function buildProviderTree(
  providers: Array<{
    id: string; name: string; description: string;
    category: string; tags?: string[]; version: string;
  }>,
): TreeNode[] {
  // Define the fixed tree skeleton with coming-soon placeholders
  const skeleton: TreeNode[] = [
    {
      label: "Web",
      path: "web",
      children: [
        {
          label: "UI",
          path: "web/ui",
          children: [],  // providers with category "web/ui" go here
        },
        {
          label: "Form",
          path: "web/form",
          children: [
            { label: "TanStack Form", path: "web/form/tanstack", children: [], comingSoon: true },
            { label: "React Hook Form", path: "web/form/rhf", children: [], comingSoon: true },
          ],
        },
        {
          label: "Data",
          path: "web/data",
          children: [
            { label: "TanStack Table", path: "web/data/tanstack-table", children: [], comingSoon: true },
          ],
        },
        {
          label: "Charts",
          path: "web/charts",
          children: [
            { label: "Recharts", path: "web/charts/recharts", children: [], comingSoon: true },
          ],
        },
      ],
    },
    {
      label: "Mobile",
      path: "mobile",
      children: [
        {
          label: "UI",
          path: "mobile/ui",
          children: [
            { label: "React Native", path: "mobile/ui/rn", children: [], comingSoon: true },
          ],
        },
      ],
    },
  ];

  // Slot registered providers into the tree by category
  for (const p of providers) {
    const target = findNode(skeleton, p.category);
    if (target) {
      target.children.push({
        label: p.name,
        path: `${p.category}/${p.id}`,
        children: [],
        provider: {
          id: p.id,
          name: p.name,
          description: p.description,
          version: p.version,
          tags: p.tags,
        },
      });
    }
  }

  return skeleton;
}

function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    const found = findNode(node.children, path);
    if (found) return found;
  }
  return null;
}

// ─── Config Panel ───────────────────────────────────────────

function ConfigPanel() {
  const { activeProviderId, availableProviders, setProvider, setActivePanel } = useDesignStore();
  const tree = buildProviderTree(availableProviders);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["web", "web/ui"]));

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleSelect = (providerId: string) => {
    setProvider(providerId);
    // Jump to palette to see the new components
    setActivePanel("palette");
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactElement[] => {
    const items: React.ReactElement[] = [];
    const isExpanded = expanded.has(node.path);
    const isActive = node.provider?.id === activeProviderId;
    const hasChildren = node.children.length > 0;

    // Provider leaf
    if (node.provider) {
      items.push(
        <div
          key={node.path}
          className={`config-item config-provider ${isActive ? "active" : ""}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => handleSelect(node.provider!.id)}
        >
          <span className="config-radio">{isActive ? "◉" : "○"}</span>
          <div className="config-provider-info">
            <span className="config-provider-name">{node.provider.name}</span>
            <span className="config-provider-ver">v{node.provider.version}</span>
          </div>
          {isActive && <span className="config-active-badge">Active</span>}
        </div>,
      );
      return items;
    }

    // Coming-soon placeholder
    if (node.comingSoon) {
      items.push(
        <div
          key={node.path}
          className="config-item config-coming-soon"
          style={{ paddingLeft: 12 + depth * 16 }}
        >
          <span className="config-radio">○</span>
          <span className="config-soon-name">{node.label}</span>
          <span className="config-soon-badge">Soon</span>
        </div>,
      );
      return items;
    }

    // Category folder
    items.push(
      <div
        key={node.path}
        className="config-item config-folder"
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={() => toggle(node.path)}
      >
        <span className="config-chevron">{isExpanded ? "▾" : "▸"}</span>
        <span className="config-folder-label">{node.label}</span>
        {hasChildren && (
          <span className="config-count">{countProviders(node)}</span>
        )}
      </div>,
    );

    if (isExpanded) {
      for (const child of node.children) {
        items.push(...renderNode(child, depth + 1));
      }
    }

    return items;
  };

  return (
    <div className="panel-body config-panel">
      <div className="config-header">
        <span className="config-title">Providers</span>
        <span className="config-subtitle">Select a component provider</span>
      </div>
      <div className="config-tree">
        {tree.map((node) => renderNode(node, 0))}
      </div>
      {/* Active provider info card */}
      {(() => {
        const active = availableProviders.find((p) => p.id === activeProviderId);
        if (!active) return null;
        return (
          <div className="config-active-card">
            <div className="config-active-card-header">
              <span className="config-active-dot" />
              <span>{active.name}</span>
            </div>
            <div className="config-active-desc">{active.description}</div>
            {active.tags && active.tags.length > 0 && (
              <div className="config-tags">
                {active.tags.map((t) => (
                  <span key={t} className="config-tag">{t}</span>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function countProviders(node: TreeNode): number {
  let count = 0;
  if (node.provider) count++;
  for (const child of node.children) count += countProviders(child);
  return count;
}
// ─── Chat Panel ─────────────────────────────────────────────

function ChatPanel() {
  const { messages, isStreaming, sendMessage, clearChat, applySpec, abortChat, chatMode } = useDesignStore();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (input.trim() && !isStreaming) {
      sendMessage(input.trim());
      setInput("");
    }
  };

  return (
    <>
      <div className="panel-body">
        {/* Chat mode indicator */}
        <div style={{
          padding: "4px 8px", fontSize: 10, color: "#666",
          borderBottom: "1px solid #1a1a1a", display: "flex",
          alignItems: "center", gap: 4,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: chatMode === "pocketpaw" ? "#52c41a" : "#faad14",
          }} />
          {chatMode === "pocketpaw"
            ? "Using PocketPaw AI"
            : "Using direct API"}
        </div>

        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-msg ${msg.role}`}>
              {msg.streaming ? (
                <>
                  <span>{msg.content}</span>
                  <div className="streaming-indicator">
                    <span /><span /><span />
                  </div>
                </>
              ) : (
                <>
                  <span>{msg.content}</span>
                  {msg.spec && !msg.applied && (
                    <button className="apply-btn" onClick={() => applySpec(msg.id)}>
                      ✓ Apply to Canvas
                    </button>
                  )}
                  {msg.applied && (
                    <button className="apply-btn applied" disabled>
                      Applied ✓
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="chat-input-area">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Describe your UI..."
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button onClick={abortChat} style={{ background: "#ff4d4f22", color: "#ff4d4f" }}>
            ⏹ Stop
          </button>
        ) : (
          <button onClick={handleSend} disabled={!input.trim()}>
            Send
          </button>
        )}
      </div>
    </>
  );
}

// ─── Layers Panel ───────────────────────────────────────────

function LayersPanel() {
  const { spec, selectedId, hoveredId, select, hover, removeElement } = useDesignStore();

  const renderTree = (id: string, depth: number): React.ReactElement[] => {
    const el = spec.elements[id];
    if (!el) return [];

    const items: React.ReactElement[] = [];
    items.push(
      <div
        key={id}
        className={`layer-item ${selectedId === id ? "selected" : ""} ${hoveredId === id ? "hovered" : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => select(id)}
        onMouseEnter={() => hover(id)}
        onMouseLeave={() => hover(null)}
      >
        <span className="layer-type">{el.type}</span>
        <span className="layer-id">{id}</span>
        {id !== "root" && (
          <button
            className="layer-delete"
            onClick={(e) => { e.stopPropagation(); removeElement(id); }}
          >
            ×
          </button>
        )}
      </div>
    );

    if (el.children) {
      for (const childId of el.children) {
        items.push(...renderTree(childId, depth + 1));
      }
    }

    return items;
  };

  return (
    <div className="panel-body">
      <div className="layer-tree">{renderTree("root", 0)}</div>
    </div>
  );
}

// ─── Palette Panel ──────────────────────────────────────────

function PalettePanel() {
  const { selectedId, addElement, spec, activeProviderId } = useDesignStore();
  const provider = getActiveProvider();
  const paletteItems = provider.palette;

  const handleAdd = (type: string, defaultProps: Record<string, any>) => {
    const parentId = selectedId && spec.elements[selectedId]?.children !== undefined
      ? selectedId
      : "root";
    addElement(parentId, type, defaultProps);
  };

  return (
    <div className="panel-body">
      {paletteItems.map((section) => (
        <div key={section.section}>
          <div className="palette-section">{section.section}</div>
          <div className="palette-grid">
            {section.items.map((item) => (
              <div
                key={item.type}
                className="palette-item"
                onClick={() => handleAdd(item.type, item.defaultProps)}
              >
                <span className="icon">{item.icon}</span>
                {item.type}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Props Panel ────────────────────────────────────────────

function PropsPanel() {
  const { spec, selectedId, updateProps, removeElement } = useDesignStore();

  if (!selectedId || !spec.elements[selectedId]) {
    return (
      <div className="no-selection">
        <span style={{ fontSize: 28, opacity: 0.3 }}>◎</span>
        <span>Select an element</span>
        <span style={{ fontSize: 11, color: "#333" }}>Click on the canvas or layers panel</span>
      </div>
    );
  }

  const el = spec.elements[selectedId];
  const props = el.props;

  const handleChange = (key: string, rawValue: string) => {
    let value: any = rawValue;
    if (rawValue !== "" && !isNaN(Number(rawValue))) {
      value = Number(rawValue);
    }
    if (rawValue === "true") value = true;
    if (rawValue === "false") value = false;

    updateProps(selectedId, { [key]: value === "" ? null : value });
  };

  return (
    <>
      <div className="panel-header">
        <span>{el.type} — {selectedId}</span>
      </div>
      <div className="props-body">
        {Object.entries(props).map(([key, value]) => {
          if (key === "options" || typeof value === "object") return null;
          return (
            <div key={key} className="prop-group">
              <label>{key}</label>
              {typeof value === "boolean" ? (
                <select
                  value={String(value)}
                  onChange={(e) => handleChange(key, e.target.value)}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={value ?? ""}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
              )}
            </div>
          );
        })}

        {selectedId !== "root" && (
          <button
            style={{
              width: "100%", padding: "8px", marginTop: 16,
              border: "1px solid #ff4d4f33", borderRadius: 6,
              background: "#ff4d4f11", color: "#ff4d4f",
              cursor: "pointer", fontSize: 12,
            }}
            onClick={() => removeElement(selectedId)}
          >
            Delete Element
          </button>
        )}
      </div>
    </>
  );
}

// ─── Canvas (json-render Renderer) ──────────────────────────

function DesignCanvas() {
  const { spec, selectedId, select, hover, activeProviderId } = useDesignStore();

  // Rebuild registry when provider switches
  const { registry } = useMemo(() => buildActiveRegistry(), [activeProviderId]);

  const rendererSpec = {
    version: spec.version,
    root: spec.root,
    state: spec.state || {},
    elements: spec.elements,
  };

  return (
    <div className="canvas-area" onClick={() => select(null)}>
      <div className="canvas-frame" onClick={(e) => e.stopPropagation()}>
        <CanvasElementWrapper spec={spec} selectedId={selectedId} select={select} hover={hover}>
          <StateProvider initialState={spec.state || {}}>
            <ActionProvider handlers={{}}>
              <VisibilityProvider>
                <Renderer spec={rendererSpec as any} registry={registry} />
              </VisibilityProvider>
            </ActionProvider>
          </StateProvider>
        </CanvasElementWrapper>
      </div>
    </div>
  );
}

function CanvasElementWrapper({
  children,
  spec,
  selectedId,
  select,
  hover,
}: {
  children: React.ReactNode;
  spec: DesignSpec;
  selectedId: string | null;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      select(null);
    },
    [select]
  );

  return (
    <div onClick={handleClick} style={{ minHeight: 200 }}>
      {children}
    </div>
  );
}

// ─── Settings Modal ─────────────────────────────────────────

function SettingsModal() {
  const {
    showSettings, setShowSettings,
    chatMode, setChatMode,
    aiApiKey, aiApiBase, aiModel, setAiConfig,
  } = useDesignStore();
  const [key, setKey] = useState(aiApiKey);
  const [base, setBase] = useState(aiApiBase);
  const [model, setModel] = useState(aiModel);
  const [mode, setMode] = useState(chatMode);

  useEffect(() => {
    setKey(aiApiKey);
    setBase(aiApiBase);
    setModel(aiModel);
    setMode(chatMode);
  }, [showSettings]);

  if (!showSettings) return null;

  const handleSave = () => {
    setChatMode(mode);
    setAiConfig({ apiKey: key, apiBase: base, model });
    setShowSettings(false);
  };

  return (
    <div className="settings-overlay" onClick={() => setShowSettings(false)}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>AI Settings</h2>

        {/* Chat mode toggle */}
        <div className="field">
          <label>Chat Mode</label>
          <div style={{
            display: "flex", gap: 8, marginTop: 4,
          }}>
            <button
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 6,
                border: `1px solid ${mode === "pocketpaw" ? "#1677ff" : "#333"}`,
                background: mode === "pocketpaw" ? "#1677ff22" : "#1a1a1a",
                color: mode === "pocketpaw" ? "#1677ff" : "#888",
                cursor: "pointer", fontSize: 12, textAlign: "left",
              }}
              onClick={() => setMode("pocketpaw")}
            >
              <strong style={{ display: "block", marginBottom: 2 }}>🤖 PocketPaw AI</strong>
              <span style={{ fontSize: 10, opacity: 0.7 }}>Uses your configured agent — no API key needed</span>
            </button>
            <button
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 6,
                border: `1px solid ${mode === "direct" ? "#fa8c16" : "#333"}`,
                background: mode === "direct" ? "#fa8c1622" : "#1a1a1a",
                color: mode === "direct" ? "#fa8c16" : "#888",
                cursor: "pointer", fontSize: 12, textAlign: "left",
              }}
              onClick={() => setMode("direct")}
            >
              <strong style={{ display: "block", marginBottom: 2 }}>🔑 Direct API</strong>
              <span style={{ fontSize: 10, opacity: 0.7 }}>Use your own OpenAI/compatible API key</span>
            </button>
          </div>
        </div>

        {/* Direct API fields (only shown in direct mode) */}
        {mode === "direct" && (
          <>
            <div className="field">
              <label>API Key</label>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
            <div className="field">
              <label>API Base URL (optional — for local models)</label>
              <input
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div className="field">
              <label>Model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini"
              />
            </div>
          </>
        )}

        <div className="actions">
          <button className="secondary" onClick={() => setShowSettings(false)}>
            Cancel
          </button>
          <button className="primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── App ────────────────────────────────────────────────────

export default function App() {
  const pluginStatus = usePluginStatus();
  const {
    activePanel, setActivePanel,
    showSettings, setShowSettings,
    undo, redo,
    undoStack, redoStack,
    clearChat,
    savedSpecs, fetchSavedSpecs, saveSpec, loadSpec,
    spec,
    // Provider
    activeProviderId, availableProviders, setProvider,
  } = useDesignStore();

  const [saveName, setSaveName] = useState("");

  useEffect(() => {
    fetchSavedSpecs();
  }, []);

  const isRunning = pluginStatus === "running";

  if (!isRunning) {
    return (
      <div style={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
        background: "#0a0a0a", color: "#888",
      }}>
        <div style={{ fontSize: 40, opacity: 0.3 }}>◆</div>
        <div>Waiting for Design Builder server...</div>
        <div style={{ fontSize: 11, color: "#444" }}>Install and start the plugin first</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Top Bar */}
      <div className="top-bar">
        <h1>◆ Design Builder</h1>
        <div className="toolbar">
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z)"
          >
            ↩ Undo
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↪ Redo
          </button>
          <button onClick={() => {
            const name = prompt("Spec name:", `design-${Date.now()}`);
            if (name) saveSpec(name);
          }}>
            💾 Save
          </button>
          <button onClick={() => {
            const name = prompt("Load spec name:");
            if (name) loadSpec(name);
          }}>
            📂 Load
          </button>
          <button onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
          }}>
            📋 Copy JSON
          </button>
        </div>
        <button
          className="toolbar"
          style={{
            padding: "4px 10px", border: "none", background: "#1f1f1f",
            color: "#888", borderRadius: 4, fontSize: 11, cursor: "pointer",
          }}
          onClick={() => setShowSettings(true)}
        >
          ⚙ AI Settings
        </button>
      </div>

      {/* Main 3-panel layout */}
      <div className="main-area">
        {/* Left Panel */}
        <div className="left-panel">
          <div className="panel-tabs">
            <button
              className={activePanel === "config" ? "active" : ""}
              onClick={() => setActivePanel("config")}
            >
              ⚡ Config
            </button>
            <button
              className={activePanel === "chat" ? "active" : ""}
              onClick={() => setActivePanel("chat")}
            >
              💬 Chat
            </button>
            <button
              className={activePanel === "layers" ? "active" : ""}
              onClick={() => setActivePanel("layers")}
            >
              📑 Layers
            </button>
            <button
              className={activePanel === "palette" ? "active" : ""}
              onClick={() => setActivePanel("palette")}
            >
              🧩 Palette
            </button>
          </div>

          {activePanel === "config" && <ConfigPanel />}
          {activePanel === "chat" && <ChatPanel />}
          {activePanel === "layers" && <LayersPanel />}
          {activePanel === "palette" && <PalettePanel />}
        </div>

        {/* Canvas */}
        <DesignCanvas />

        {/* Right Panel */}
        <div className="right-panel">
          <PropsPanel />
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal />
    </div>
  );
}
