import { useState, useEffect, useCallback } from "react";
import { Button, Empty } from "antd";
import { sdk } from "../sdk";

export default function MemoryPage() {
  const [memories, setMemories] = useState<any[]>([]);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((p) => [...p.slice(-30), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await sdk.memory.list(50);
      setMemories(Array.isArray(list) ? list : list.memories || []);
      addLog(`Loaded ${Array.isArray(list) ? list.length : 0} memories`);
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  }, [addLog]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    try {
      await sdk.memory.delete(id);
      addLog(`Deleted memory ${id}`);
      load();
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>🧠 Memory — <code>sdk.memory</code></h2>
        <p>Browse and manage the AI's long-term memory entries.</p>
      </div>

      <Button onClick={load} style={{ marginBottom: 16 }}>🔄 Refresh</Button>

      {memories.length === 0 ? (
        <Empty description="No memories stored" />
      ) : (
        <ul className="todo-list">
          {memories.map((m: any) => (
            <li key={m.id} className="todo-item">
              <span className="todo-text">
                <strong>{m.memory || m.text || m.content || JSON.stringify(m).slice(0, 100)}</strong>
                <br />
                <small style={{ color: "#555" }}>{m.created_at || m.timestamp || ""}</small>
              </span>
              <Button size="small" danger onClick={() => remove(m.id)}>Delete</Button>
            </li>
          ))}
        </ul>
      )}

      <div className="log-area" style={{ marginTop: 16 }}>
        {log.map((l, i) => (
          <div key={i} className="log-line">{l}</div>
        ))}
      </div>
    </>
  );
}
