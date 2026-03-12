import { useState, useEffect, useCallback } from "react";
import { Button, Descriptions, Tag } from "antd";
import { sdk } from "../sdk";

export default function HealthPage() {
  const [health, setHealth] = useState<any>(null);
  const [version, setVersion] = useState<any>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((p) => [...p.slice(-30), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const load = useCallback(async () => {
    try {
      const h = await sdk.health.status();
      setHealth(h);
      addLog(`Health: ${h.status || "ok"}`);
    } catch (err: any) {
      addLog(`❌ health: ${err.message}`);
    }
    try {
      const v = await sdk.health.version();
      setVersion(v);
      addLog(`Version: ${v.version || JSON.stringify(v)}`);
    } catch (err: any) {
      addLog(`❌ version: ${err.message}`);
    }
  }, [addLog]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page-header">
        <h2>💚 Health — <code>sdk.health</code></h2>
        <p>Check server health and version information.</p>
      </div>

      <div className="module-grid">
        <div className="module-card">
          <div className="module-card-header">
            <span className="emoji">💚</span>
            <h3>Server Health</h3>
          </div>
          {health ? (
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Status">
                <Tag color={health.status === "ok" || health.status === "healthy" ? "green" : "red"}>
                  {health.status || "unknown"}
                </Tag>
              </Descriptions.Item>
              {Object.entries(health)
                .filter(([k]) => k !== "status")
                .map(([k, v]) => (
                  <Descriptions.Item key={k} label={k}>
                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </Descriptions.Item>
                ))}
            </Descriptions>
          ) : (
            <p style={{ color: "#555" }}>Loading…</p>
          )}
        </div>

        <div className="module-card">
          <div className="module-card-header">
            <span className="emoji">📋</span>
            <h3>Version</h3>
          </div>
          {version ? (
            <Descriptions column={1} size="small">
              {Object.entries(version).map(([k, v]) => (
                <Descriptions.Item key={k} label={k}>
                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </Descriptions.Item>
              ))}
            </Descriptions>
          ) : (
            <p style={{ color: "#555" }}>Loading…</p>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Button onClick={load}>🔄 Refresh</Button>
      </div>

      <div className="log-area" style={{ marginTop: 16 }}>
        {log.map((l, i) => <div key={i} className="log-line">{l}</div>)}
      </div>
    </>
  );
}
