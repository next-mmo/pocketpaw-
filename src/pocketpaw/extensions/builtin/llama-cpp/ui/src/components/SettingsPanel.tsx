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
} from "antd";
import {
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  DownloadOutlined,
  CloudServerOutlined,
} from "@ant-design/icons";
import { useServerStore, API_BASE, PLUGIN_ID } from "../stores/serverStore";

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
    nGpuLayers,
    contextSize,
    setServerInfo,
    setModels,
    setSelectedModel,
    setNGpuLayers,
    setContextSize,
  } = useServerStore();

  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadFile, setDownloadFile] = useState("");
  const [customRepo, setCustomRepo] = useState("");
  const [customFile, setCustomFile] = useState("");

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
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [setServerInfo]);

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
    } catch (e) {
      message.error("Install failed");
    }
  };

  const handleStart = async () => {
    try {
      const body = selectedModel ? { model: selectedModel } : {};
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
    } catch (e) {
      message.error("Start failed");
    }
  };

  const handleStop = async () => {
    try {
      await fetch(`${API_BASE}/api/v1/plugins/${PLUGIN_ID}/stop`, {
        method: "POST",
      });
      message.info("Server stopping...");
    } catch (e) {
      message.error("Stop failed");
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
                disabled={models.length === 0}
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
      </Space>
    </div>
  );
}
