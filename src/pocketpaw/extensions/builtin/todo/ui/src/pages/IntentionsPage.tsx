import { useState, useEffect, useCallback } from "react";
import { Button, Input, Switch, Empty, Tag } from "antd";
import { sdk } from "../sdk";

export default function IntentionsPage() {
  const [intentions, setIntentions] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cron, setCron] = useState("*/30 * * * *");
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((p) => [...p.slice(-30), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await sdk.intentions.list();
      setIntentions(list);
      addLog(`Loaded ${list.length} intentions`);
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  }, [addLog]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim() || !prompt.trim()) return;
    try {
      await sdk.intentions.create({
        name: name.trim(),
        prompt: prompt.trim(),
        cron_expression: cron.trim(),
        enabled: true,
      });
      addLog(`✅ Created intention: ${name}`);
      setName("");
      setPrompt("");
      load();
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  const toggle = async (id: string) => {
    try {
      await sdk.intentions.toggle(id);
      addLog(`Toggled intention ${id}`);
      load();
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  const run = async (id: string) => {
    try {
      await sdk.intentions.run(id);
      addLog(`▶ Triggered intention ${id}`);
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  const remove = async (id: string) => {
    await sdk.intentions.delete(id);
    addLog(`Deleted intention ${id}`);
    load();
  };

  return (
    <>
      <div className="page-header">
        <h2>🗓️ Schedules — <code>sdk.intentions</code></h2>
        <p>Scheduled AI tasks with cron expressions. The AI agent runs these automatically.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <Input placeholder="Name (e.g. Daily Standup)" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Cron (e.g. */30 * * * *)" value={cron} onChange={(e) => setCron(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Input.TextArea
          placeholder="AI prompt (e.g. Summarize today's news about AI)"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          style={{ flex: 1 }}
        />
        <Button type="primary" onClick={create}>Create</Button>
      </div>

      {intentions.length === 0 ? (
        <Empty description="No scheduled intentions" />
      ) : (
        <ul className="todo-list">
          {intentions.map((i: any) => (
            <li key={i.id} className="todo-item">
              <Switch size="small" checked={i.enabled} onChange={() => toggle(i.id)} />
              <span className="todo-text">
                <strong>{i.name}</strong>{" "}
                <Tag>{i.cron_expression}</Tag>
                <br />
                <small style={{ color: "#888" }}>{i.prompt?.slice(0, 80)}…</small>
              </span>
              <div className="todo-actions">
                <Button size="small" onClick={() => run(i.id)}>▶ Run</Button>
                <Button size="small" danger onClick={() => remove(i.id)}>✕</Button>
              </div>
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
