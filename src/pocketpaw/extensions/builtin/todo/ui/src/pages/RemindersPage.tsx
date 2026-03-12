import { useState, useEffect, useCallback } from "react";
import { Button, Input, Empty } from "antd";
import { sdk } from "../sdk";

export default function RemindersPage() {
  const [reminders, setReminders] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((p) => [...p.slice(-30), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await sdk.reminders.list();
      setReminders(list);
      addLog(`Loaded ${list.length} reminders`);
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  }, [addLog]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const msg = input.trim();
    if (!msg) return;
    try {
      const result = await sdk.reminders.create(msg);
      addLog(`✅ Created: ${result.message || msg} — ${result.time_remaining || ""}`);
      setInput("");
      load();
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  const remove = async (id: string) => {
    await sdk.reminders.delete(id);
    addLog(`Deleted reminder ${id}`);
    load();
  };

  return (
    <>
      <div className="page-header">
        <h2>⏰ Reminders — <code>sdk.reminders</code></h2>
        <p>Natural language scheduling. Try "in 10 minutes check on deployment" or "at 5pm standup meeting".</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Input
          placeholder='e.g. "in 30 minutes check the build"'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={create}
          style={{ flex: 1 }}
        />
        <Button type="primary" onClick={create}>Set Reminder</Button>
        <Button onClick={load}>🔄</Button>
      </div>

      {reminders.length === 0 ? (
        <Empty description="No active reminders" />
      ) : (
        <ul className="todo-list">
          {reminders.map((r: any) => (
            <li key={r.id} className="todo-item">
              <span className="todo-text">
                <strong>{r.message}</strong>
                <br />
                <small style={{ color: "#888" }}>
                  {r.time_remaining || r.trigger_at || "pending"}
                </small>
              </span>
              <Button size="small" danger onClick={() => remove(r.id)}>Delete</Button>
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
