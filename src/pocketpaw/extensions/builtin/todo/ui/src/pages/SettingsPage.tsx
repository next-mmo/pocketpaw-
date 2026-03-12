import { useState, useEffect, useCallback } from "react";
import { Button, Select, Switch, Tag, Descriptions } from "antd";
import { sdk } from "../sdk";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [config, setConfig] = useState<Record<string, any>>({});
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((p) => [...p.slice(-30), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await sdk.settings.get();
      setSettings(data);
      addLog("Loaded server settings");
    } catch (err: any) {
      addLog(`❌ settings: ${err.message}`);
    }
  }, [addLog]);

  const loadConfig = useCallback(async () => {
    try {
      const data = await sdk.config.get();
      setConfig(data);
      addLog("Loaded extension config");
    } catch (err: any) {
      addLog(`❌ config: ${err.message}`);
    }
  }, [addLog]);

  useEffect(() => {
    loadSettings();
    loadConfig();
  }, [loadSettings, loadConfig]);

  const togglePlanMode = async () => {
    try {
      await sdk.settings.update({ plan_mode: !settings.plan_mode });
      addLog(`✅ Plan mode → ${!settings.plan_mode}`);
      loadSettings();
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  const changeBackend = async (val: string) => {
    try {
      await sdk.settings.update({ agent_backend: val });
      addLog(`✅ Agent backend → ${val}`);
      loadSettings();
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  const saveExtConfig = async () => {
    try {
      await sdk.config.set({
        ...config,
        lastSaved: new Date().toISOString(),
      });
      addLog("✅ Extension config saved");
      loadConfig();
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>⚙️ Settings — <code>sdk.settings</code> + <code>sdk.config</code></h2>
        <p>Read and modify PocketPaw server settings, plus manage per-extension configuration.</p>
      </div>

      <div className="module-grid">
        <div className="module-card">
          <div className="module-card-header">
            <span className="emoji">⚙️</span>
            <h3>Server Settings</h3>
            <span className="scope-badge">settings.read/write</span>
          </div>

          <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
            <Descriptions.Item label="Agent Backend">
              <Select
                size="small"
                value={settings.agent_backend || "claude_agent_sdk"}
                onChange={changeBackend}
                style={{ width: 180 }}
                options={[
                  { value: "claude_agent_sdk", label: "Claude SDK" },
                  { value: "openai_agents", label: "OpenAI Agents" },
                  { value: "google_adk", label: "Google ADK" },
                  { value: "codex_cli", label: "Codex CLI" },
                ]}
              />
            </Descriptions.Item>
            <Descriptions.Item label="LLM Provider">
              <Tag>{settings.llm_provider || "—"}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Plan Mode">
              <Switch size="small" checked={settings.plan_mode || false} onChange={togglePlanMode} />
            </Descriptions.Item>
            <Descriptions.Item label="Tool Profile">
              <Tag>{settings.tool_profile || "full"}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Memory">
              <Tag>{settings.memory_backend || "local"}</Tag>
            </Descriptions.Item>
          </Descriptions>

          <Button size="small" onClick={loadSettings}>🔄 Refresh</Button>
        </div>

        <div className="module-card">
          <div className="module-card-header">
            <span className="emoji">📦</span>
            <h3>Extension Config</h3>
            <span className="scope-badge">storage.read/write</span>
          </div>
          <p>Per-extension config.json (separate from key-value storage). Inspired by OpenClaw's <code>configSchema</code>.</p>

          <pre style={{
            background: "#0d1117",
            padding: 12,
            borderRadius: 6,
            fontSize: 11,
            color: "#8b949e",
            overflow: "auto",
            maxHeight: 120,
            marginBottom: 10,
          }}>
            {JSON.stringify(config, null, 2) || "{}"}
          </pre>

          <div style={{ display: "flex", gap: 8 }}>
            <Button size="small" type="primary" onClick={saveExtConfig}>Save Config</Button>
            <Button size="small" onClick={loadConfig}>🔄 Refresh</Button>
          </div>
        </div>
      </div>

      <div className="log-area" style={{ marginTop: 16 }}>
        {log.map((l, i) => (
          <div key={i} className={`log-line ${l.includes("✅") ? "success" : l.includes("❌") ? "error" : ""}`}>{l}</div>
        ))}
      </div>
    </>
  );
}
