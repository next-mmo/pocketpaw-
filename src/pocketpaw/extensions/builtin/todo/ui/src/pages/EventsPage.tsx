import { useState, useEffect, useRef } from "react";
import { Button, Tag } from "antd";
import { sdk } from "../sdk";

interface EventEntry {
  type: string;
  data: any;
  time: string;
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const subRef = useRef<{ abort: () => void } | null>(null);

  const connect = () => {
    if (subRef.current) subRef.current.abort();

    const sub = sdk.events.subscribe({
      onEvent(type: string, data: any) {
        setEvents((prev) => [
          { type, data, time: new Date().toLocaleTimeString() },
          ...prev.slice(0, 99),
        ]);
      },
      onError(err: any) {
        console.error("SSE error:", err);
        setConnected(false);
      },
    });
    subRef.current = sub;
    setConnected(true);
  };

  const disconnect = () => {
    subRef.current?.abort();
    subRef.current = null;
    setConnected(false);
  };

  useEffect(() => {
    return () => { subRef.current?.abort(); };
  }, []);

  return (
    <>
      <div className="page-header">
        <h2>📡 Events — <code>sdk.events</code></h2>
        <p>Real-time Server-Sent Events stream from the PocketPaw system bus. See agent completions, tool calls, and more.</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        {connected ? (
          <>
            <span className="status-dot green" />
            <span style={{ color: "#3fb950", fontSize: 13 }}>Connected</span>
            <Button danger size="small" onClick={disconnect}>Disconnect</Button>
          </>
        ) : (
          <>
            <span className="status-dot gray" />
            <span style={{ color: "#888", fontSize: 13 }}>Disconnected</span>
            <Button type="primary" size="small" onClick={connect}>Connect</Button>
          </>
        )}
        <span style={{ marginLeft: "auto", color: "#555", fontSize: 12 }}>
          {events.length} events captured
        </span>
        {events.length > 0 && (
          <Button size="small" onClick={() => setEvents([])}>Clear</Button>
        )}
      </div>

      <div className="event-stream">
        {events.length === 0 ? (
          <p style={{ color: "#555", textAlign: "center", padding: 20 }}>
            {connected ? "Waiting for events…" : "Click Connect to start listening"}
          </p>
        ) : (
          events.map((e, i) => (
            <div key={i} className="event-item">
              <span className="event-time">{e.time}</span>
              <Tag color="blue" style={{ fontSize: 10 }}>{e.type}</Tag>
              <span style={{ color: "#aaa", fontSize: 11, fontFamily: "monospace" }}>
                {JSON.stringify(e.data).slice(0, 120)}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
