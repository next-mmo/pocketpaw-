import { useState, useEffect, useCallback } from "react";
import { Button, Input, Empty, Switch, Tag } from "antd";
import { sdk } from "../sdk";

export default function CommandsPage() {
  const [commands, setCommands] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [response, setResponse] = useState("");
  const [acceptsArgs, setAcceptsArgs] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((p) => [...p.slice(-30), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await sdk.commands.list();
      setCommands(Array.isArray(list) ? list : []);
      addLog(`Loaded ${Array.isArray(list) ? list.length : 0} commands`);
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  }, [addLog]);

  useEffect(() => { load(); }, [load]);

  const register = async () => {
    if (!name.trim()) return;
    try {
      await sdk.commands.register({
        name: name.trim().toLowerCase(),
        description: desc.trim(),
        accepts_args: acceptsArgs,
        response_text: response.trim() || null,
      });
      addLog(`✅ Registered /${name.trim()}`);
      setName("");
      setDesc("");
      setResponse("");
      load();
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  const unregister = async (cmdName: string) => {
    try {
      await sdk.commands.unregister(cmdName);
      addLog(`Unregistered /${cmdName}`);
      load();
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>⌨️ Commands — <code>sdk.commands</code></h2>
        <p>
          Register auto-reply slash commands (like OpenClaw's <code>api.registerCommand()</code>).
          These run without invoking the AI agent — instant, zero-token responses.
        </p>
      </div>

      <div className="module-card" style={{ marginBottom: 16 }}>
        <div className="module-card-header">
          <span className="emoji">➕</span>
          <h3>Register Command</h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <Input placeholder="Command name (e.g. ping)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Input placeholder="Static response text" value={response} onChange={(e) => setResponse(e.target.value)} style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: "#888" }}>Accepts args:</span>
          <Switch size="small" checked={acceptsArgs} onChange={setAcceptsArgs} />
          <Button type="primary" onClick={register}>Register</Button>
        </div>
      </div>

      {commands.length === 0 ? (
        <Empty description="No commands registered yet" />
      ) : (
        <ul className="todo-list">
          {commands.map((cmd: any) => (
            <li key={cmd.name} className="todo-item">
              <Tag color="blue" style={{ fontFamily: "monospace" }}>/{cmd.name}</Tag>
              <span className="todo-text">
                {cmd.description || "No description"}
                {cmd.accepts_args && <Tag color="green" style={{ marginLeft: 4 }}>args</Tag>}
                {cmd.response_text && (
                  <small style={{ display: "block", color: "#555", marginTop: 2 }}>
                    → {cmd.response_text}
                  </small>
                )}
              </span>
              <Button size="small" danger onClick={() => unregister(cmd.name)}>Remove</Button>
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
