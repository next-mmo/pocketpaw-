import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Space, Typography, Alert, Tooltip } from "antd";
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
  ExpandOutlined,
  CompressOutlined,
} from "@ant-design/icons";
import { usePluginStore, API_BASE, PLUGIN_ID } from "../stores/pluginStore";

const { Text, Title } = Typography;

/** ANSI-like color map for terminal output styling */
function colorize(line: string): string {
  // Highlight key patterns like Pinokio does
  if (line.startsWith("==>")) return "color: #58a6ff";
  if (line.startsWith("✅") || line.startsWith("✓")) return "color: #3fb950";
  if (line.startsWith("❌") || line.startsWith("✗")) return "color: #f85149";
  if (line.startsWith("⚠")) return "color: #d29922";
  if (line.includes("ERROR") || line.includes("error")) return "color: #f85149";
  if (line.includes("WARNING") || line.includes("warning"))
    return "color: #d29922";
  if (line.includes("Successfully") || line.includes("installed"))
    return "color: #3fb950";
  if (line.includes("Downloading") || line.includes("Collecting"))
    return "color: #58a6ff";
  return "color: #c9d1d9";
}

export default function WanGPDashboard() {
  const {
    status,
    port,
    error,
    isInstalled,
    installProgress,
    logs,
    setServerInfo,
    setLogs,
  } = usePluginStore();

  const [actionLoading, setActionLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Poll server status
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/status`,
        );
        if (res.ok) {
          const data = await res.json();
          setServerInfo({
            status: data.status,
            port: data.port,
            url: data.url,
            error: data.error,
            pid: data.pid,
            isInstalled: data.is_installed,
            installProgress: data.install_progress,
          });
        }
      } catch {
        // ignore
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [setServerInfo]);

  // Poll logs when installing or starting — fast polling like a real terminal
  useEffect(() => {
    if (status !== "installing" && status !== "starting") return;
    const poll = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/logs?tail=500`,
        );
        if (res.ok) {
          const data = await res.json();
          setLogs(data.lines || data.logs || []);
        }
      } catch {
        // ignore
      }
    };
    poll();
    const interval = setInterval(poll, 800); // Fast polling for real-time feel
    return () => clearInterval(interval);
  }, [status, setLogs]);

  // Auto-scroll terminal to bottom (like a real terminal)
  useEffect(() => {
    if (autoScrollRef.current && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Handle manual scroll — pause auto-scroll when user scrolls up
  const handleTerminalScroll = useCallback(() => {
    const el = logContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = atBottom;
  }, []);

  const handleInstall = useCallback(async () => {
    setActionLoading(true);
    try {
      await fetch(`${API_BASE}/api/v1/plugins/${PLUGIN_ID}/install`, {
        method: "POST",
      });
    } catch {
      // ignore — status poll will catch errors
    } finally {
      setActionLoading(false);
    }
  }, []);

  const handleStart = useCallback(async () => {
    setActionLoading(true);
    try {
      await fetch(`${API_BASE}/api/v1/plugins/${PLUGIN_ID}/start`, {
        method: "POST",
      });
    } catch {
      // ignore
    } finally {
      setActionLoading(false);
    }
  }, []);

  const handleStop = useCallback(async () => {
    setActionLoading(true);
    try {
      await fetch(`${API_BASE}/api/v1/plugins/${PLUGIN_ID}/stop`, {
        method: "POST",
      });
    } catch {
      // ignore
    } finally {
      setActionLoading(false);
    }
  }, []);

  // Build the Gradio iframe URL via PocketPaw reverse proxy
  const gradioUrl = port
    ? `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/proxy/`
    : null;

  // ─── Installing / Starting → Full-screen terminal view (Pinokio-style) ───
  if (status === "installing" || status === "starting") {
    const isInstalling = status === "installing";
    const progressPercent = Math.round(installProgress * 100);

    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0d1117",
        }}
      >
        {/* Terminal header bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            background: "#161b22",
            borderBottom: "1px solid #30363d",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Traffic light dots */}
            <div style={{ display: "flex", gap: 6 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: isInstalling ? "#d29922" : "#58a6ff",
                  boxShadow: isInstalling
                    ? "0 0 8px #d2992244"
                    : "0 0 8px #58a6ff44",
                  animation: "pulse 2s ease-in-out infinite",
                }}
              />
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: "#30363d",
                }}
              />
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: "#30363d",
                }}
              />
            </div>
            <span
              style={{
                color: "#c9d1d9",
                fontFamily:
                  "'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {isInstalling ? "📦 Installing WanGP" : "🚀 Starting WanGP"}
            </span>
            <span
              style={{
                color: "#484f58",
                fontFamily: "monospace",
                fontSize: 11,
              }}
            >
              {isInstalling
                ? `— ${progressPercent}% complete`
                : "— waiting for server"}
            </span>
          </div>
          {/* Line count */}
          <span
            style={{
              color: "#484f58",
              fontFamily: "monospace",
              fontSize: 11,
            }}
          >
            {logs.length} lines
          </span>
        </div>

        {/* Progress bar (only during install) */}
        {isInstalling && (
          <div
            style={{
              padding: "0",
              background: "#161b22",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                height: 3,
                background: "#21262d",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                  width: `${progressPercent}%`,
                  background: "linear-gradient(90deg, #1f6feb, #58a6ff)",
                  transition: "width 0.5s ease",
                  borderRadius: "0 2px 2px 0",
                }}
              />
            </div>
          </div>
        )}

        {/* Full terminal output */}
        <div
          ref={logContainerRef}
          onScroll={handleTerminalScroll}
          style={{
            flex: 1,
            overflow: "auto",
            padding: "12px 16px",
            fontFamily:
              "'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
            fontSize: 12,
            lineHeight: 1.7,
            background: "#0d1117",
            cursor: "text",
            userSelect: "text",
          }}
        >
          {/* Startup banner */}
          <div style={{ color: "#484f58", marginBottom: 8 }}>
            {isInstalling
              ? "$ pocketpaw install wan2gp"
              : "$ pocketpaw start wan2gp"}
          </div>

          {logs.length === 0 && (
            <div style={{ color: "#484f58" }}>
              Waiting for output...
              <span
                style={{
                  display: "inline-block",
                  animation: "blink 1s step-end infinite",
                  marginLeft: 2,
                }}
              >
                █
              </span>
            </div>
          )}

          {logs.map((line, i) => (
            <div
              key={i}
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                ...(colorize(line)
                  ? { color: colorize(line).replace("color: ", "") }
                  : {}),
              }}
            >
              {line || "\u00A0"}
            </div>
          ))}

          {/* Blinking cursor at bottom */}
          <div style={{ color: "#c9d1d9" }}>
            <span
              style={{
                display: "inline-block",
                animation: "blink 1s step-end infinite",
              }}
            >
              █
            </span>
          </div>
        </div>

        {/* Terminal footer with stats */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px",
            background: "#161b22",
            borderTop: "1px solid #30363d",
            flexShrink: 0,
            fontFamily: "monospace",
            fontSize: 11,
            color: "#484f58",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span>
              Status:{" "}
              <span
                style={{
                  color: isInstalling ? "#d29922" : "#58a6ff",
                }}
              >
                {isInstalling ? "INSTALLING" : "STARTING"}
              </span>
            </span>
            {isInstalling && (
              <span>
                Progress:{" "}
                <span style={{ color: "#58a6ff" }}>{progressPercent}%</span>
              </span>
            )}
          </div>
          <span>
            {autoScrollRef.current
              ? "Auto-scroll ON"
              : "Scroll up to pause · Scroll down to resume"}
          </span>
        </div>

        {/* CSS animations */}
        <style>{`
          @keyframes blink {
            50% { opacity: 0; }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  // ─── Fullscreen mode — just show the iframe ───
  if (fullscreen && status === "running" && gradioUrl) {
    return (
      <div style={{ height: "100%", width: "100%", position: "relative" }}>
        <Tooltip title="Exit fullscreen">
          <Button
            type="text"
            icon={<CompressOutlined />}
            onClick={() => setFullscreen(false)}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 10,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              borderRadius: 6,
            }}
          />
        </Tooltip>
        <iframe
          src={gradioUrl}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            background: "#111",
          }}
          title="WanGP"
          allow="accelerometer; camera; microphone; fullscreen"
        />
      </div>
    );
  }

  // ─── Running state — show iframe with header ───
  if (status === "running" && gradioUrl) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px",
            borderBottom: "1px solid #303030",
            background: "#1a1a1a",
            flexShrink: 0,
          }}
        >
          <Space>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#52c41a",
                boxShadow: "0 0 6px #52c41a",
              }}
            />
            <Text style={{ color: "#e0e0e0", fontWeight: 600 }}>WanGP</Text>
            <Text style={{ color: "#888", fontSize: 12 }}>
              Running on port {port}
            </Text>
          </Space>
          <Space>
            <Tooltip title="Fullscreen">
              <Button
                type="text"
                size="small"
                icon={<ExpandOutlined />}
                onClick={() => setFullscreen(true)}
                style={{ color: "#888" }}
              />
            </Tooltip>
            <Tooltip title="Reload Gradio UI">
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => {
                  const iframe = document.querySelector(
                    'iframe[title="WanGP"]',
                  ) as HTMLIFrameElement;
                  if (iframe) iframe.src = gradioUrl;
                }}
                style={{ color: "#888" }}
              />
            </Tooltip>
            <Button
              danger
              size="small"
              icon={<PauseCircleOutlined />}
              onClick={handleStop}
              loading={actionLoading}
            >
              Stop
            </Button>
          </Space>
        </div>
        {/* Gradio iframe */}
        <iframe
          src={gradioUrl}
          style={{
            flex: 1,
            width: "100%",
            border: "none",
            background: "#111",
          }}
          title="WanGP"
          allow="accelerometer; camera; microphone; fullscreen"
        />
      </div>
    );
  }

  // ─── Not running — show setup/control panel ───
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 560,
          width: "100%",
          background: "#1a1a1a",
          borderRadius: 12,
          border: "1px solid #303030",
          padding: 32,
        }}
      >
        {/* Logo & Title */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              fontSize: 48,
              marginBottom: 8,
              lineHeight: 1,
            }}
          >
            🎬
          </div>
          <Title level={3} style={{ color: "#e0e0e0", margin: 0 }}>
            WanGP
          </Title>
          <Text style={{ color: "#888" }}>
            AI Video Generator for the GPU Poor
          </Text>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert
            type="error"
            message="Error"
            description={error}
            showIcon
            closable
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Action Buttons */}
        <div style={{ textAlign: "center" }}>
          {!isInstalled ? (
            <Space direction="vertical" size="middle">
              <Text style={{ color: "#888" }}>
                WanGP needs to be installed first. This will clone the
                repository, install Python dependencies and PyTorch with CUDA.
              </Text>
              <Button
                type="primary"
                size="large"
                icon={<DownloadOutlined />}
                onClick={handleInstall}
                loading={actionLoading}
                block
              >
                Install WanGP
              </Button>
            </Space>
          ) : (
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Text style={{ color: "#52c41a" }}>
                ✓ WanGP is installed and ready
              </Text>
              <Button
                type="primary"
                size="large"
                icon={<PlayCircleOutlined />}
                onClick={handleStart}
                loading={actionLoading}
                block
              >
                Start WanGP
              </Button>
              <Button
                size="small"
                type="link"
                icon={<ReloadOutlined />}
                onClick={handleInstall}
                loading={actionLoading}
                style={{ color: "#888" }}
              >
                Reinstall / Update
              </Button>
            </Space>
          )}
        </div>

        {/* Description */}
        <div
          style={{
            marginTop: 24,
            padding: "12px 16px",
            background: "#111",
            borderRadius: 8,
            border: "1px solid #252525",
          }}
        >
          <Text style={{ color: "#888", fontSize: 12 }}>
            Supports Wan 2.1/2.2, Hunyuan Video, LTX Video, Flux, Qwen, and many
            more models. Works with as little as 6 GB VRAM. Includes mask
            editor, prompt enhancer, upscaler, and gallery browser plugins.
          </Text>
        </div>
      </div>
    </div>
  );
}
