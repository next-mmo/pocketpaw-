import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Select,
  InputNumber,
  Space,
  Typography,
  Tag,
  Progress,
  Input,
  Divider,
  message,
  Alert,
  Popconfirm,
  Tooltip,
} from "antd";
import {
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  DownloadOutlined,
  CloudServerOutlined,
  ToolOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  useServerStore,
  API_BASE,
  PLUGIN_ID,
  type EngineType,
} from "../stores/serverStore";

const { Text, Title } = Typography;

// Quick-pick models
const QUICK_MODELS = [
  {
    label: "Qwen2.5-0.5B (Q4_K_M) — 469MB",
    repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    file: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
  },
  {
    label: "Qwen2.5-1.5B (Q4_K_M) — 1.1GB",
    repo: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
  },
  {
    label: "Llama-3.2-1B (Q4_K_M) — 770MB",
    repo: "bartowski/Llama-3.2-1B-Instruct-GGUF",
    file: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
  },
];

export default function SettingsPanel() {
  const {
    status,
    url,
    error,
    isInstalled,
    installProgress,
    models,
    selectedModel,
    engine,
    nGpuLayers,
    contextSize,
    setServerInfo,
    setModels,
    setSelectedModel,
    setEngine,
    setNGpuLayers,
    setContextSize,
  } = useServerStore();

  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadFile, setDownloadFile] = useState("");
  const [customRepo, setCustomRepo] = useState("");
  const [customFile, setCustomFile] = useState("");
  const [rebuilding, setRebuilding] = useState(false);

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
          // Track rebuild completion
          if (rebuilding && data.status !== "installing") {
            setRebuilding(false);
            if (data.status === "stopped") {
              message.success("Engine rebuild complete!");
            } else if (data.status === "error") {
              message.error(
                `Engine rebuild failed: ${data.error || "unknown error"}`,
              );
            }
          }
        }
      } catch {
        // ignore
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [setServerInfo, rebuilding]);

  // Load models
  const loadModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/plugins/${PLUGIN_ID}/models`);
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
        if (data.models?.length && !selectedModel) {
          setSelectedModel(data.models[0].file);
        }
      }
    } catch {
      // ignore
    }
  }, [setModels, selectedModel, setSelectedModel]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Server actions
  const handleInstall = async () => {
    try {
      await fetch(`${API_BASE}/api/v1/plugins/${PLUGIN_ID}/install`, {
        method: "POST",
      });
      message.info("Installing plugin environment...");
    } catch {
      message.error("Install failed");
    }
  };

  const handleStart = async () => {
    try {
      const body: Record<string, unknown> = {};
      if (selectedModel) body.model = selectedModel;
      if (engine) body.engine = engine;
      const res = await fetch(`${API_BASE}/api/v1/plugins/${PLUGIN_ID}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        message.success("Server starting...");
      } else {
        const data = await res.json();
        message.error(data.detail || "Start failed");
      }
    } catch {
      message.error("Start failed");
    }
  };

  const handleStop = async () => {
    try {
      await fetch(`${API_BASE}/api/v1/plugins/${PLUGIN_ID}/stop`, {
        method: "POST",
      });
      message.info("Server stopping...");
    } catch {
      message.error("Stop failed");
    }
  };

  // Rebuild engine
  const handleRebuildEngine = async (cuda: boolean) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/rebuild-engine`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cuda }),
        },
      );
      if (res.ok) {
        setRebuilding(true);
        message.info(
          `Rebuilding engine (${cuda ? "CUDA" : "CPU"})... This may take several minutes.`,
        );
      } else {
        const data = await res.json();
        message.error(data.detail || "Rebuild failed");
      }
    } catch {
      message.error("Rebuild request failed");
    }
  };

  // Reinstall (reset env + re-install)
  const handleReinstall = async () => {
    try {
      await fetch(`${API_BASE}/api/v1/plugins/${PLUGIN_ID}/env`, {
        method: "DELETE",
      });
      await fetch(`${API_BASE}/api/v1/plugins/${PLUGIN_ID}/install`, {
        method: "POST",
      });
      message.info("Reinstalling... This will recreate the environment.");
    } catch {
      message.error("Reinstall failed");
    }
  };

  // Download model
  const downloadModel = async (repo: string, file: string) => {
    if (downloading) return;
    setDownloading(true);
    setDownloadProgress(0);
    setDownloadFile(file);

    try {
      const res = await fetch(
        `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/download-model`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo, file }),
        },
      );

      if (!res.ok) {
        throw new Error(`Server error: ${await res.text()}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.event === "progress") {
              setDownloadProgress(evt.percent);
            } else if (evt.event === "done") {
              message.success(`Downloaded ${evt.file}`);
              loadModels();
            } else if (evt.event === "error") {
              message.error(evt.message);
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed";
      message.error(msg);
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
      setDownloadFile("");
    }
  };

  const statusColor: Record<string, string> = {
    running: "green",
    starting: "blue",
    installing: "orange",
    stopped: "default",
    error: "red",
  };

  const isBusy = status === "installing" || status === "starting" || rebuilding;

  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%" }}>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {/* Server Status */}
        <Card
          size="small"
          title={
            <Space>
              <CloudServerOutlined />
              <span>Server</span>
              <Tag color={statusColor[status] || "default"}>{status}</Tag>
            </Space>
          }
        >
          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              style={{ marginBottom: 12 }}
            />
          )}

          {status === "installing" && (
            <Progress
              percent={Math.round(installProgress * 100)}
              status="active"
              style={{ marginBottom: 12 }}
            />
          )}

          {url && status === "running" && (
            <Text
              type="secondary"
              style={{ display: "block", marginBottom: 12 }}
            >
              Endpoint: {url}
            </Text>
          )}

          <Space>
            {!isInstalled && (
              <Button
                icon={<DownloadOutlined />}
                onClick={handleInstall}
                loading={status === "installing"}
              >
                Install
              </Button>
            )}
            {isInstalled && (status === "stopped" || status === "error") && (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleStart}
                disabled={models.length === 0 || isBusy}
              >
                Start Server
              </Button>
            )}
            {(status === "running" || status === "starting") && (
              <Button danger icon={<StopOutlined />} onClick={handleStop}>
                Stop
              </Button>
            )}
          </Space>
        </Card>

        {/* Model Selection */}
        <Card
          size="small"
          title="Model"
          extra={
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={loadModels}
            />
          }
        >
          {models.length > 0 ? (
            <Select
              value={selectedModel}
              onChange={setSelectedModel}
              style={{ width: "100%", marginBottom: 12 }}
              options={models.map((m) => ({
                label: `${m.file} (${m.size_mb.toFixed(0)} MB)`,
                value: m.file,
              }))}
            />
          ) : (
            <Text type="secondary">No models downloaded yet</Text>
          )}

          <Divider style={{ margin: "12px 0" }} />

          <Title level={5} style={{ marginBottom: 8 }}>
            Quick Download
          </Title>
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            {QUICK_MODELS.map((m) => {
              const exists = models.some((dm) => dm.file === m.file);
              return (
                <Button
                  key={m.file}
                  block
                  size="small"
                  disabled={downloading || exists}
                  icon={exists ? undefined : <DownloadOutlined />}
                  onClick={() => downloadModel(m.repo, m.file)}
                >
                  {exists ? `✓ ${m.label}` : m.label}
                </Button>
              );
            })}
          </Space>

          {downloading && (
            <div style={{ marginTop: 12 }}>
              <Text type="secondary">Downloading {downloadFile}...</Text>
              <Progress
                percent={downloadProgress}
                status="active"
                size="small"
              />
            </div>
          )}

          <Divider style={{ margin: "12px 0" }} />

          <Title level={5} style={{ marginBottom: 8 }}>
            Custom Model
          </Title>
          <Space.Compact style={{ width: "100%", marginBottom: 8 }}>
            <Input
              placeholder="owner/repo"
              value={customRepo}
              onChange={(e) => setCustomRepo(e.target.value)}
              style={{ width: "50%" }}
            />
            <Input
              placeholder="file.gguf"
              value={customFile}
              onChange={(e) => setCustomFile(e.target.value)}
              style={{ width: "50%" }}
            />
          </Space.Compact>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            disabled={!customRepo || !customFile || downloading}
            onClick={() => downloadModel(customRepo, customFile)}
          >
            Download
          </Button>
        </Card>

        {/* Settings */}
        <Card size="small" title="Settings">
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <div>
              <Text
                type="secondary"
                style={{ display: "block", marginBottom: 4 }}
              >
                Engine
              </Text>
              <Select
                value={engine}
                onChange={(v) => setEngine(v as EngineType)}
                style={{ width: "100%" }}
                disabled={status === "running" || status === "starting"}
                options={[
                  {
                    label: "🐍 Python (llama-cpp-python)",
                    value: "python",
                  },
                  {
                    label: "⚡ Node.js (node-llama-cpp)",
                    value: "node",
                  },
                ]}
              />
              <Text
                type="secondary"
                style={{ fontSize: 11, display: "block", marginTop: 4 }}
              >
                {engine === "node"
                  ? "Prebuilt binaries — supports newest models faster, auto GPU detection."
                  : "Classic backend — stable, CUDA wheel support."}
              </Text>
            </div>
            <div>
              <Text type="secondary">GPU Layers (-1 = all)</Text>
              <InputNumber
                value={nGpuLayers}
                onChange={(v) => setNGpuLayers(v ?? -1)}
                min={-1}
                max={128}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <Text type="secondary">Context Size</Text>
              <InputNumber
                value={contextSize}
                onChange={(v) => setContextSize(v ?? 2048)}
                min={256}
                max={131072}
                step={256}
                style={{ width: "100%" }}
              />
            </div>
          </Space>
        </Card>

        {/* Engine Management */}
        {isInstalled && (
          <Card
            size="small"
            title={
              <Space>
                <ToolOutlined />
                <span>Engine</span>
              </Space>
            }
          >
            <Text
              type="secondary"
              style={{ display: "block", marginBottom: 12, fontSize: 12 }}
            >
              Rebuild the inference engine from source to get the latest model
              architecture support. This compiles llama.cpp from the newest
              code.
            </Text>

            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              <Tooltip title="Build with CPU-only support. Works on all systems.">
                <Popconfirm
                  title="Rebuild Engine (CPU)"
                  description="This will rebuild llama-cpp-python from source (CPU-only). It may take several minutes. Continue?"
                  onConfirm={() => handleRebuildEngine(false)}
                  okText="Rebuild"
                  cancelText="Cancel"
                  disabled={isBusy}
                >
                  <Button
                    block
                    size="small"
                    icon={<ToolOutlined />}
                    disabled={isBusy}
                    loading={rebuilding && status === "installing"}
                  >
                    Rebuild Engine (CPU)
                  </Button>
                </Popconfirm>
              </Tooltip>

              <Tooltip title="Build with CUDA GPU acceleration. Requires CUDA Toolkit (nvcc).">
                <Popconfirm
                  title="Rebuild Engine (CUDA)"
                  description="This will rebuild with CUDA support. Requires CUDA Toolkit (nvcc) installed. Continue?"
                  onConfirm={() => handleRebuildEngine(true)}
                  okText="Rebuild"
                  cancelText="Cancel"
                  disabled={isBusy}
                >
                  <Button
                    block
                    size="small"
                    icon={<ThunderboltOutlined />}
                    disabled={isBusy}
                    loading={rebuilding && status === "installing"}
                  >
                    Rebuild Engine (CUDA)
                  </Button>
                </Popconfirm>
              </Tooltip>

              <Divider style={{ margin: "8px 0" }} />

              <Tooltip title="Delete the virtual environment and reinstall from scratch. Models are kept.">
                <Popconfirm
                  title="Reinstall Environment"
                  description="This will delete the venv and reinstall from scratch. Models will be kept. Continue?"
                  onConfirm={handleReinstall}
                  okText="Reinstall"
                  cancelText="Cancel"
                  icon={<WarningOutlined style={{ color: "#faad14" }} />}
                  disabled={isBusy}
                >
                  <Button
                    block
                    size="small"
                    danger
                    icon={<ReloadOutlined />}
                    disabled={isBusy}
                  >
                    Reinstall Environment
                  </Button>
                </Popconfirm>
              </Tooltip>
            </Space>
          </Card>
        )}
      </Space>
    </div>
  );
}
