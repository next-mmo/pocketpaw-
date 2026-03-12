import { useState, useEffect, useCallback } from "react";
import { Button, Input, Empty, Tag } from "antd";
import { sdk } from "../sdk";

export default function ToolsPage() {
  const [tools, setTools] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [webhook, setWebhook] = useState("");
  const [params, setParams] = useState("[]");
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((p) => [...p.slice(-30), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await sdk.tools.list();
      setTools(Array.isArray(list) ? list : []);
      addLog(`Loaded ${Array.isArray(list) ? list.length : 0} tools`);
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  }, [addLog]);

  useEffect(() => { load(); }, [load]);

  const register = async () => {
    if (!name.trim() || !desc.trim() || !webhook.trim()) return;
    try {
      let parameters: any[] = [];
      try { parameters = JSON.parse(params); } catch { /* use empty */ }
      await sdk.tools.register({
        name: name.trim().toLowerCase().replace(/\s+/g, "_"),
        description: desc.trim(),
        parameters,
        webhook_url: webhook.trim(),
      });
      addLog(`✅ Registered tool: ${name}`);
      setName("");
      setDesc("");
      setWebhook("");
      setParams("[]");
      load();
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  const unregister = async (toolName: string) => {
    try {
      await sdk.tools.unregister(toolName);
      addLog(`Unregistered tool: ${toolName}`);
      load();
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>🛠️ Agent Tools — <code>sdk.tools</code></h2>
        <p>
          Register tools that the AI agent can call (like OpenClaw's agent tool registration).
          When the agent invokes a tool, PocketPaw POSTs to the <code>webhook_url</code>.
        </p>
      </div>

      <div className="module-card" style={{ marginBottom: 16 }}>
        <div className="module-card-header">
          <span className="emoji">➕</span>
          <h3>Register Tool</h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <Input placeholder="Tool name (snake_case)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Webhook URL" value={webhook} onChange={(e) => setWebhook(e.target.value)} />
        </div>
        <Input placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ marginBottom: 8 }} />
        <Input.TextArea
          placeholder='Parameters JSON (e.g. [{"name":"query","type":"string","required":true}])'
          value={params}
          onChange={(e) => setParams(e.target.value)}
          rows={2}
          style={{ marginBottom: 8, fontFamily: "monospace", fontSize: 11 }}
        />
        <Button type="primary" onClick={register}>Register Tool</Button>
      </div>

      {tools.length === 0 ? (
        <Empty description="No tools registered yet" />
      ) : (
        <ul className="todo-list">
          {tools.map((tool: any) => (
            <li key={tool.name} className="todo-item">
              <Tag color="purple" style={{ fontFamily: "monospace" }}>{tool.name}</Tag>
              <span className="todo-text">
                {tool.description}
                <br />
                <small style={{ color: "#555" }}>
                  Webhook: {tool.webhook_url} • Params: {tool.parameters?.length || 0}
                </small>
              </span>
              <Button size="small" danger onClick={() => unregister(tool.name)}>Remove</Button>
            </li>
          ))}
        </ul>
      )}

      <div className="log-area" style={{ marginTop: 16 }}>
        {log.map((l, i) => (
          <div key={i} className={`log-line ${l.includes("✅") ? "success" : l.includes("❌") ? "error" : ""}`}>{l}</div>
        ))}
      </div>
    </>
  );
}
