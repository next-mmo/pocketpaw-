/**
 * Design Builder — Main App
 *
 * 3-panel Figma-like layout:
 *   Left: Chat / Layers / Palette
 *   Center: Live Canvas (json-render Renderer)
 *   Right: Props Panel for selected element
 */

import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import { Renderer, StateProvider, ActionProvider, VisibilityProvider } from "@json-render/react";
import { registry } from "./registry";
import { useDesignStore, type DesignSpec, type DesignElement } from "./store";
import { getPluginStatus } from "./sdk";

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

  const renderTree = (id: string, depth: number): JSX.Element[] => {
    const el = spec.elements[id];
    if (!el) return [];

    const items: JSX.Element[] = [];
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

const PALETTE_ITEMS = [
  { section: "Layout", items: [
    { type: "Stack", icon: "⬜", defaultProps: { direction: "column", gap: 12, padding: 16, background: "#1a1a1a", borderRadius: 8 } },
    { type: "ScrollView", icon: "📜", defaultProps: { direction: "vertical" } },
  ]},
  { section: "Display", items: [
    { type: "Text", icon: "✏️", defaultProps: { text: "Text", size: 14, color: "#e0e0e0" } },
    { type: "Heading", icon: "H", defaultProps: { text: "Heading", level: 2 } },
    { type: "Image", icon: "🖼", defaultProps: { uri: "https://picsum.photos/200/100", width: 200, height: 100, borderRadius: 8 } },
    { type: "Badge", icon: "🏷", defaultProps: { text: "Badge", variant: "default" } },
    { type: "Avatar", icon: "👤", defaultProps: { fallback: "AB", size: 40 } },
    { type: "Separator", icon: "—", defaultProps: { orientation: "horizontal" } },
    { type: "Progress", icon: "▰", defaultProps: { value: 65, max: 100 } },
    { type: "Icon", icon: "◆", defaultProps: { name: "star", size: 20, color: "#faad14" } },
  ]},
  { section: "Input", items: [
    { type: "Button", icon: "🔘", defaultProps: { label: "Button", variant: "default" } },
    { type: "Input", icon: "📝", defaultProps: { placeholder: "Enter text..." } },
    { type: "Textarea", icon: "📋", defaultProps: { placeholder: "Enter text...", rows: 3 } },
    { type: "Checkbox", icon: "☑", defaultProps: { label: "Checkbox" } },
    { type: "Switch", icon: "🔀", defaultProps: { label: "Toggle" } },
    { type: "Select", icon: "▾", defaultProps: { placeholder: "Select...", options: [{ label: "Option 1", value: "1" }, { label: "Option 2", value: "2" }] } },
  ]},
  { section: "Container", items: [
    { type: "Card", icon: "📇", defaultProps: { title: "Card Title", description: "Description" } },
    { type: "Alert", icon: "⚠", defaultProps: { title: "Alert", description: "Something happened" } },
  ]},
];

function PalettePanel() {
  const { selectedId, addElement, spec } = useDesignStore();

  const handleAdd = (type: string, defaultProps: Record<string, any>) => {
    const parentId = selectedId && spec.elements[selectedId]?.children !== undefined
      ? selectedId
      : "root";
    addElement(parentId, type, defaultProps);
  };

  return (
    <div className="panel-body">
      {PALETTE_ITEMS.map((section) => (
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
  const { spec, selectedId, select, hover } = useDesignStore();

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
