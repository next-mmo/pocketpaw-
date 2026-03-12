import { useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import {
  Button,
  Modal,
  Input,
  Select,
  InputNumber,
  message,
  Empty,
  Spin,
  Popconfirm,
  Tag,
  Space,
  Progress,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

const STATUS_MAP: Record<string, { color: string; icon: React.ReactNode }> = {
  alive: { color: "#52c41a", icon: <CheckCircleOutlined /> },
  dead: { color: "#ff4d4f", icon: <CloseCircleOutlined /> },
  unchecked: { color: "#888", icon: <SyncOutlined /> },
};

export default function ProxiesPage() {
  const proxies = useStore((s) => s.proxies);
  const loading = useStore((s) => s.loadingProxies);
  const fetchProxies = useStore((s) => s.fetchProxies);
  const fetchStats = useStore((s) => s.fetchStats);

  const [createOpen, setCreateOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  // Form
  const [formType, setFormType] = useState("http");
  const [formHost, setFormHost] = useState("");
  const [formPort, setFormPort] = useState(8080);
  const [formUser, setFormUser] = useState("");
  const [formPass, setFormPass] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!formHost.trim()) return;
    setCreating(true);
    try {
      await api.addProxy({
        type: formType,
        host: formHost,
        port: formPort,
        username: formUser,
        password: formPass,
      });
      message.success("Proxy added");
      setCreateOpen(false);
      setFormHost("");
      setFormUser("");
      setFormPass("");
      fetchProxies();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteProxy(id);
      message.success("Proxy removed");
      fetchProxies();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleCheckAll = async () => {
    setChecking(true);
    try {
      const resp = await api.checkProxies();
      const alive = resp.proxies?.filter((p: any) => p.status === "alive").length || 0;
      message.success(`Health check complete: ${alive}/${resp.proxies?.length || 0} alive`);
      fetchProxies();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setChecking(false);
    }
  };

  const alive = proxies.filter((p: any) => p.status === "alive").length;
  const dead = proxies.filter((p: any) => p.status === "dead").length;

  return (
    <div className="content-area">
      <div className="fade-in">
        <div className="page-header">
          <div>
            <h2>Proxy Management</h2>
            <p style={{ color: "#555", marginTop: 4, fontSize: 13 }}>
              {proxies.length} prox{proxies.length !== 1 ? "ies" : "y"} •{" "}
              <span style={{ color: "#52c41a" }}>{alive} alive</span>{" "}
              <span style={{ color: "#ff4d4f" }}>{dead > 0 ? `• ${dead} dead` : ""}</span>
            </p>
          </div>
          <Space>
            <Button
              icon={<ThunderboltOutlined />}
              onClick={handleCheckAll}
              loading={checking}
              style={{ borderRadius: 10, height: 38 }}
            >
              Check All
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              style={{
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                border: "none",
                height: 38,
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              Add Proxy
            </Button>
          </Space>
        </div>

        {/* Health overview */}
        {proxies.length > 0 && (
          <div
            className="glass-card"
            style={{ padding: 20, marginBottom: 24, display: "flex", alignItems: "center", gap: 24 }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>PROXY HEALTH</div>
              <Progress
                percent={proxies.length > 0 ? Math.round((alive / proxies.length) * 100) : 0}
                strokeColor={{ from: "#667eea", to: "#52c41a" }}
                trailColor="rgba(255,255,255,0.05)"
                size="small"
              />
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#52c41a" }}>{alive}</div>
                <div style={{ fontSize: 11, color: "#555" }}>Alive</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#ff4d4f" }}>{dead}</div>
                <div style={{ fontSize: 11, color: "#555" }}>Dead</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#888" }}>
                  {proxies.length - alive - dead}
                </div>
                <div style={{ fontSize: 11, color: "#555" }}>Unchecked</div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>
        ) : proxies.length === 0 ? (
          <Empty description="No proxies configured" style={{ marginTop: 80 }}>
            <Button type="primary" onClick={() => setCreateOpen(true)}>Add First Proxy</Button>
          </Empty>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {proxies.map((px: any) => {
              const st = STATUS_MAP[px.status] || STATUS_MAP.unchecked;
              return (
                <div key={px.id} className="profile-card">
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: `${st.color}15`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      color: st.color,
                      flexShrink: 0,
                    }}
                  >
                    <GlobalOutlined />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#e0e0e0" }}>
                      {px.host}:{px.port}
                    </div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                      {px.type?.toUpperCase()} {px.username ? `• Auth: ${px.username}` : "• No auth"}{" "}
                      {px.country ? `• ${px.country}` : ""}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {px.latency_ms != null && (
                      <span style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: px.latency_ms < 200 ? "#52c41a" : px.latency_ms < 500 ? "#faad14" : "#ff4d4f",
                      }}>
                        {px.latency_ms}ms
                      </span>
                    )}
                    <Tag
                      icon={st.icon}
                      color={px.status === "alive" ? "success" : px.status === "dead" ? "error" : "default"}
                      style={{ borderRadius: 6, margin: 0 }}
                    >
                      {px.status}
                    </Tag>
                  </div>

                  <Popconfirm title="Delete proxy?" onConfirm={() => handleDelete(px.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create Modal ── */}
      <Modal
        title="Add Proxy"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="Add Proxy"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Type</label>
              <Select
                value={formType}
                onChange={setFormType}
                style={{ width: "100%" }}
                options={[
                  { value: "http", label: "HTTP" },
                  { value: "socks5", label: "SOCKS5" },
                ]}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Host</label>
              <Input
                placeholder="proxy.example.com"
                value={formHost}
                onChange={(e) => setFormHost(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Port</label>
              <InputNumber
                min={1}
                max={65535}
                value={formPort}
                onChange={(v) => setFormPort(v || 8080)}
                style={{ width: "100%" }}
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Username (optional)</label>
              <Input
                placeholder="user"
                value={formUser}
                onChange={(e) => setFormUser(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Password (optional)</label>
              <Input.Password
                placeholder="pass"
                value={formPass}
                onChange={(e) => setFormPass(e.target.value)}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
