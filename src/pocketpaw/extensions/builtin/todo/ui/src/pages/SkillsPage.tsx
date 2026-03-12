import { useState, useEffect, useCallback } from "react";
import { Button, Empty, Tag } from "antd";
import { sdk } from "../sdk";

export default function SkillsPage() {
  const [skills, setSkills] = useState<any[]>([]);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((p) => [...p.slice(-30), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await sdk.skills.list();
      const arr = Array.isArray(list) ? list : list.skills || [];
      setSkills(arr);
      addLog(`Loaded ${arr.length} skills`);
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  }, [addLog]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page-header">
        <h2>⚡ Skills — <code>sdk.skills</code></h2>
        <p>Browse installed skills the AI agent can use. Skills are loaded from <code>~/.pocketpaw/skills/</code> and built-in paths.</p>
      </div>

      <Button onClick={load} style={{ marginBottom: 16 }}>🔄 Refresh</Button>

      {skills.length === 0 ? (
        <Empty description="No skills installed" />
      ) : (
        <div className="module-grid">
          {skills.map((s: any, idx: number) => (
            <div key={idx} className="module-card">
              <div className="module-card-header">
                <span className="emoji">⚡</span>
                <h3>{s.name || s.id || `Skill ${idx + 1}`}</h3>
                {s.user_invocable && <Tag color="green">User-invocable</Tag>}
              </div>
              <p>{s.description || "No description"}</p>
              {s.argument_hint && (
                <p style={{ fontFamily: "monospace", fontSize: 11, color: "#667eea" }}>
                  Args: {s.argument_hint}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="log-area" style={{ marginTop: 16 }}>
        {log.map((l, i) => <div key={i} className="log-line">{l}</div>)}
      </div>
    </>
  );
}
