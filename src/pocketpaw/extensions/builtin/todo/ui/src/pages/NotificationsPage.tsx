import { useState } from "react";
import { Button, Input, Select } from "antd";
import { sdk } from "../sdk";

export default function NotificationsPage() {
  const [title, setTitle] = useState("Hello from SDK!");
  const [message, setMessage] = useState("This toast was sent by an extension.");
  const [level, setLevel] = useState("info");
  const [broadcastEvent, setBroadcastEvent] = useState("test_event");
  const [broadcastData, setBroadcastData] = useState('{"key": "value"}');
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLog((p) => [...p.slice(-30), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const sendNotification = async () => {
    try {
      const result = await sdk.notifications.send(title, message, level, 5000);
      addLog(`✅ Notification sent to ${result.to} clients`);
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  const broadcast = async () => {
    try {
      let data: Record<string, any> = {};
      try { data = JSON.parse(broadcastData); } catch { /* use empty */ }
      const result = await sdk.notifications.broadcast(broadcastEvent, data);
      addLog(`✅ Broadcast: ${result.event}`);
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>🔔 Notifications — <code>sdk.notifications</code></h2>
        <p>
          Push toasts to the dashboard and broadcast custom events on the system bus.
          Inspired by OpenClaw — extensions can surface information outside their iframe!
        </p>
      </div>

      <div className="module-grid">
        <div className="module-card">
          <div className="module-card-header">
            <span className="emoji">🔔</span>
            <h3>Push Toast</h3>
            <span className="scope-badge">notifications.write</span>
          </div>
          <p>Send a toast notification visible on the main dashboard.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Message" value={message} onChange={(e) => setMessage(e.target.value)} />
            <Select value={level} onChange={setLevel} options={[
              { value: "info", label: "ℹ️ Info" },
              { value: "success", label: "✅ Success" },
              { value: "warning", label: "⚠️ Warning" },
              { value: "error", label: "❌ Error" },
            ]} />
            <Button type="primary" onClick={sendNotification}>Send Notification</Button>
          </div>
        </div>

        <div className="module-card">
          <div className="module-card-header">
            <span className="emoji">📢</span>
            <h3>Broadcast Event</h3>
            <span className="scope-badge">notifications.write</span>
          </div>
          <p>Emit a custom event on the system bus. Other extensions can listen via <code>sdk.events.subscribe()</code>.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Input placeholder="Event name" value={broadcastEvent} onChange={(e) => setBroadcastEvent(e.target.value)} />
            <Input.TextArea placeholder='Data (JSON)' value={broadcastData} onChange={(e) => setBroadcastData(e.target.value)} rows={2} />
            <Button type="primary" onClick={broadcast}>Broadcast</Button>
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
