import { useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import {
  Button,
  Modal,
  Input,
  Select,
  message,
  Tag,
  Tooltip,
  Popconfirm,
  Space,
  Empty,
  Spin,
  Drawer,
  Descriptions,
} from "antd";
import {
  PlusOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CameraOutlined,
  EyeOutlined,
  WindowsOutlined,
  AppleOutlined,
  ChromeOutlined,
} from "@ant-design/icons";

const OS_ICONS: Record<string, React.ReactNode> = {
  windows: <WindowsOutlined />,
  macos: <AppleOutlined />,
  linux: <span>🐧</span>,
};

const AVATAR_COLORS = [
  "linear-gradient(135deg, #667eea, #764ba2)",
  "linear-gradient(135deg, #f093fb, #f5576c)",
  "linear-gradient(135deg, #4facfe, #00f2fe)",
  "linear-gradient(135deg, #43e97b, #38f9d7)",
  "linear-gradient(135deg, #fa709a, #fee140)",
  "linear-gradient(135deg, #a18cd1, #fbc2eb)",
  "linear-gradient(135deg, #fccb90, #d57eeb)",
  "linear-gradient(135deg, #e0c3fc, #8ec5fc)",
];

export default function ProfilesPage() {
  const profiles = useStore((s) => s.profiles);
  const loading = useStore((s) => s.loadingProfiles);
  const fetchProfiles = useStore((s) => s.fetchProfiles);
  const fetchStats = useStore((s) => s.fetchStats);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formGroup, setFormGroup] = useState("default");
  const [formOS, setFormOS] = useState("windows");
  const [formTags, setFormTags] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setCreating(true);
    try {
      await api.createProfile({
        name: formName,
        group: formGroup,
        os_type: formOS,
        tags: formTags,
      });
      message.success("Profile created with unique fingerprint");
      setCreateOpen(false);
      setFormName("");
      setFormTags([]);
      fetchProfiles();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleLaunch = async (id: string) => {
    try {
      await api.launchProfile(id);
      message.success("Browser launched");
      fetchProfiles();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleStop = async (id: string) => {
    try {
      await api.stopProfile(id);
      message.info("Browser stopped");
      fetchProfiles();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteProfile(id);
      message.success("Profile deleted");
      fetchProfiles();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleRegenFingerprint = async (id: string) => {
    try {
      await api.regenerateFingerprint(id);
      message.success("Fingerprint regenerated");
      fetchProfiles();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleScreenshot = async (id: string) => {
    try {
      const resp = await api.screenshotProfile(id);
      setScreenshot(resp.image);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const openDetail = (p: any) => {
    setSelectedProfile(p);
    setDetailOpen(true);
  };

  return (
    <div className="content-area">
      <div className="fade-in">
        <div className="page-header">
          <div>
            <h2>Browser Profiles</h2>
            <p style={{ color: "#555", marginTop: 4, fontSize: 13 }}>
              {profiles.length} profile{profiles.length !== 1 ? "s" : ""} •{" "}
              {profiles.filter((p: any) => p.status === "running").length} active
            </p>
          </div>
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
            New Profile
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 80 }}>
            <Spin size="large" />
          </div>
        ) : profiles.length === 0 ? (
          <Empty
            description="No profiles yet"
            style={{ marginTop: 80 }}
          >
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              Create First Profile
            </Button>
          </Empty>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {profiles.map((p: any, i: number) => (
              <div key={p.id} className="profile-card" style={{ animationDelay: `${i * 0.03}s` }}>
                {/* Avatar */}
                <div
                  className="profile-avatar"
                  style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                >
                  {p.name?.[0]?.toUpperCase() || "?"}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "#e0e0e0" }}>
                      {p.name}
                    </span>
                    <span className={`status-dot ${p.status || "stopped"}`} />
                    <span className={`os-badge ${p.os_type || "windows"}`}>
                      {OS_ICONS[p.os_type] || OS_ICONS.windows} {p.os_type}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>
                    ID: {p.id} • Group: {p.group || "default"}
                    {p.tags?.length > 0 && (
                      <span style={{ marginLeft: 8 }}>
                        {p.tags.map((t: string) => (
                          <span key={t} className="tag-badge" style={{ marginLeft: 4 }}>{t}</span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>

                {/* Fingerprint preview */}
                <Tooltip title="View Fingerprint Details">
                  <div
                    style={{
                      padding: "4px 12px",
                      borderRadius: 8,
                      background: "rgba(102,126,234,0.08)",
                      fontSize: 11,
                      color: "#8a9cf7",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    onClick={(e) => { e.stopPropagation(); openDetail(p); }}
                  >
                    🔒 {p.fingerprint?.user_agent?.slice(0, 30) || "Fingerprint"}...
                  </div>
                </Tooltip>

                {/* Actions */}
                <Space size={4}>
                  {p.status === "running" ? (
                    <>
                      <Tooltip title="Screenshot">
                        <Button
                          size="small"
                          icon={<CameraOutlined />}
                          onClick={(e) => { e.stopPropagation(); handleScreenshot(p.id); }}
                        />
                      </Tooltip>
                      <Tooltip title="Stop">
                        <Button
                          size="small"
                          danger
                          icon={<PauseCircleOutlined />}
                          onClick={(e) => { e.stopPropagation(); handleStop(p.id); }}
                        />
                      </Tooltip>
                    </>
                  ) : (
                    <Tooltip title="Launch Browser">
                      <Button
                        size="small"
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        onClick={(e) => { e.stopPropagation(); handleLaunch(p.id); }}
                        style={{ background: "#52c41a", border: "none" }}
                      />
                    </Tooltip>
                  )}
                  <Tooltip title="Regen Fingerprint">
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={(e) => { e.stopPropagation(); handleRegenFingerprint(p.id); }}
                    />
                  </Tooltip>
                  <Popconfirm title="Delete this profile?" onConfirm={() => handleDelete(p.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>
                </Space>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create Modal ── */}
      <Modal
        title="Create Browser Profile"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="Create Profile"
        styles={{ body: { paddingTop: 16 } }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Profile Name</label>
            <Input
              placeholder="e.g. Shopping Account #1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              onPressEnter={handleCreate}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Operating System</label>
              <Select
                value={formOS}
                onChange={setFormOS}
                style={{ width: "100%" }}
                options={[
                  { value: "windows", label: "🪟 Windows" },
                  { value: "macos", label: "🍎 macOS" },
                  { value: "linux", label: "🐧 Linux" },
                ]}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Group</label>
              <Input
                placeholder="default"
                value={formGroup}
                onChange={(e) => setFormGroup(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Tags</label>
            <Select
              mode="tags"
              placeholder="Add tags..."
              value={formTags}
              onChange={setFormTags}
              style={{ width: "100%" }}
            />
          </div>
        </div>
      </Modal>

      {/* ── Profile Detail Drawer ── */}
      <Drawer
        title={selectedProfile?.name || "Profile Details"}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedProfile(null); }}
        width={500}
      >
        {selectedProfile && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="ID">{selectedProfile.id}</Descriptions.Item>
              <Descriptions.Item label="OS">{selectedProfile.os_type}</Descriptions.Item>
              <Descriptions.Item label="Group">{selectedProfile.group}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <span className={`status-dot ${selectedProfile.status || "stopped"}`} />
                {selectedProfile.status || "stopped"}
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 8 }}>
              <h4 style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>FINGERPRINT</h4>
              <div
                style={{
                  background: "#0d1117",
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 11,
                  fontFamily: "'SF Mono', Consolas, monospace",
                  color: "#8b949e",
                  maxHeight: 300,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(selectedProfile.fingerprint, null, 2)}
              </div>
            </div>

            {selectedProfile.proxy?.type !== "none" && (
              <Descriptions column={1} size="small" bordered title="Proxy">
                <Descriptions.Item label="Type">{selectedProfile.proxy.type}</Descriptions.Item>
                <Descriptions.Item label="Host">{selectedProfile.proxy.host}</Descriptions.Item>
                <Descriptions.Item label="Port">{selectedProfile.proxy.port}</Descriptions.Item>
              </Descriptions>
            )}
          </div>
        )}
      </Drawer>

      {/* ── Screenshot Modal ── */}
      <Modal
        title="Live Screenshot"
        open={!!screenshot}
        onCancel={() => setScreenshot(null)}
        footer={null}
        width={800}
      >
        {screenshot && (
          <img
            src={`data:image/png;base64,${screenshot}`}
            alt="Browser screenshot"
            style={{ width: "100%", borderRadius: 8 }}
          />
        )}
      </Modal>
    </div>
  );
}
