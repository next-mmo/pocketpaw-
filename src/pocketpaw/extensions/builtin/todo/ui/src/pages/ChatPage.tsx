import { useState, useRef } from "react";
import { Button, Input } from "antd";
import { sdk } from "../sdk";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<{ abort: () => void } | null>(null);

  const addLog = (msg: string) => {
    setLog((p) => [...p.slice(-60), msg]);
  };

  const sendBlocking = async () => {
    const text = input.trim();
    if (!text) return;
    addLog(`→ You: ${text}`);
    setInput("");
    try {
      const result = await sdk.chat.send(text);
      addLog(`← AI: ${result.text || result.content || JSON.stringify(result).slice(0, 200)}`);
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  const sendStreaming = () => {
    const text = input.trim();
    if (!text) return;
    addLog(`→ You (stream): ${text}`);
    setInput("");
    setStreaming(true);

    let buffer = "";
    const sub = sdk.chat.stream(text, {}, {
      onChunk(chunk: string) {
        buffer += chunk;
      },
      onDone(full: string) {
        addLog(`← AI: ${full || buffer}`);
        setStreaming(false);
      },
      onError(err: Error) {
        addLog(`❌ Stream error: ${err.message}`);
        setStreaming(false);
      },
    });
    abortRef.current = sub;
  };

  const stopStream = () => {
    abortRef.current?.abort();
    setStreaming(false);
    addLog("⏹ Stream aborted");
  };

  const listSessions = async () => {
    try {
      const sessions = await sdk.sessions.list(10);
      const list = Array.isArray(sessions) ? sessions : sessions.sessions || [];
      addLog(`📋 Sessions (${list.length}):`);
      list.slice(0, 5).forEach((s: any) => {
        addLog(`  • ${s.key || s.id} — ${s.title || s.preview || "untitled"}`);
      });
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>💬 Chat — <code>sdk.chat</code> + <code>sdk.sessions</code></h2>
        <p>Send messages to the AI agent. Supports blocking (<code>send</code>) and streaming (<code>stream</code>) modes.</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <Input
          placeholder="Ask the AI something…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={sendBlocking}
          style={{ flex: 1 }}
          disabled={streaming}
        />
        <Button type="primary" onClick={sendBlocking} disabled={streaming}>Send</Button>
        <Button onClick={sendStreaming} disabled={streaming}>Stream</Button>
        {streaming && <Button danger onClick={stopStream}>Stop</Button>}
      </div>

      <Button size="small" onClick={listSessions} style={{ marginBottom: 16 }}>
        📋 List Sessions
      </Button>

      <div className="log-area" style={{ minHeight: 200, maxHeight: 400 }}>
        {log.map((l, i) => (
          <div
            key={i}
            className={`log-line ${l.startsWith("→") ? "info" : l.startsWith("←") ? "success" : l.startsWith("❌") ? "error" : ""}`}
          >
            {l}
          </div>
        ))}
      </div>
    </>
  );
}
