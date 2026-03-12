import { useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import {
  Button,
  Modal,
  Input,
  Select,
  message,
  Empty,
  Spin,
  Popconfirm,
  Tag,
  Avatar,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  UserOutlined,
  CrownOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
} from "@ant-design/icons";

const ROLE_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  admin: { color: "#f5576c", icon: <CrownOutlined />, label: "Admin" },
  manager: { color: "#667eea", icon: <SafetyCertificateOutlined />, label: "Manager" },
  operator: { color: "#52c41a", icon: <ToolOutlined />, label: "Operator" },
};

const MEMBER_GRADIENTS = [
  "linear-gradient(135deg, #667eea, #764ba2)",
  "linear-gradient(135deg, #f093fb, #f5576c)",
  "linear-gradient(135deg, #4facfe, #00f2fe)",
  "linear-gradient(135deg, #43e97b, #38f9d7)",
  "linear-gradient(135deg, #fa709a, #fee140)",
];

export default function TeamPage() {
  const team = useStore((s) => s.team);
  const loading = useStore((s) => s.loadingTeam);
  const fetchTeam = useStore((s) => s.fetchTeam);
  const fetchStats = useStore((s) => s.fetchStats);

  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("operator");
  const [formEmail, setFormEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setCreating(true);
    try {
      await api.addTeamMember({ name: formName, role: formRole, email: formEmail });
      message.success("Team member added");
      setCreateOpen(false);
      setFormName("");
      setFormEmail("");
      fetchTeam();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.removeTeamMember(id);
      message.success("Member removed");
      fetchTeam();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleRoleChange = async (id: string, role: string) => {
    try {
      await api.updateTeamMember(id, { role });
      message.success("Role updated");
      fetchTeam();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  return (
    <div className="content-area">
      <div className="fade-in">
        <div className="page-header">
          <div>
            <h2>Team Management</h2>
            <p style={{ color: "#555", marginTop: 4, fontSize: 13 }}>
              {team.length} member{team.length !== 1 ? "s" : ""} • Role-based access control
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
            Add Member
          </Button>
        </div>

        {/* Role legend */}
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 8,
                background: `${cfg.color}10`,
                border: `1px solid ${cfg.color}25`,
                fontSize: 12,
                color: cfg.color,
              }}
            >
              {cfg.icon} {cfg.label}
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>
        ) : team.length === 0 ? (
          <Empty description="No team members" style={{ marginTop: 80 }}>
            <Button type="primary" onClick={() => setCreateOpen(true)}>Add First Member</Button>
          </Empty>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {team.map((member: any, i: number) => {
              const rc = ROLE_CONFIG[member.role] || ROLE_CONFIG.operator;
              return (
                <div
                  key={member.id}
                  className="glass-card"
                  style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <Avatar
                      size={48}
                      style={{
                        background: MEMBER_GRADIENTS[i % MEMBER_GRADIENTS.length],
                        fontSize: 20,
                        fontWeight: 700,
                      }}
                    >
                      {member.name?.[0]?.toUpperCase() || "?"}
                    </Avatar>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: "#e0e0e0" }}>
                        {member.name}
                      </div>
                      <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                        {member.email || "No email"}
                      </div>
                    </div>
                    <Popconfirm title="Remove member?" onConfirm={() => handleDelete(member.id)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Tag
                      color={rc.color}
                      style={{
                        borderRadius: 6,
                        padding: "2px 10px",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {rc.icon} {rc.label}
                    </Tag>
                    <Select
                      size="small"
                      value={member.role}
                      onChange={(v) => handleRoleChange(member.id, v)}
                      options={[
                        { value: "admin", label: "👑 Admin" },
                        { value: "manager", label: "🛡️ Manager" },
                        { value: "operator", label: "🔧 Operator" },
                      ]}
                      style={{ width: 130 }}
                    />
                  </div>

                  <div style={{ fontSize: 11, color: "#444" }}>
                    ID: {member.id} • Added:{" "}
                    {member.created_at ? new Date(member.created_at * 1000).toLocaleDateString() : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create Modal ── */}
      <Modal
        title="Add Team Member"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="Add Member"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
          <div>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Name</label>
            <Input
              placeholder="e.g. John Doe"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Email</label>
            <Input
              placeholder="john@example.com"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Role</label>
            <Select
              value={formRole}
              onChange={setFormRole}
              style={{ width: "100%" }}
              options={[
                { value: "admin", label: "👑 Admin — Full access to all profiles, actors, and settings" },
                { value: "manager", label: "🛡️ Manager — Can manage profiles and run actors" },
                { value: "operator", label: "🔧 Operator — Can view and run assigned profiles" },
              ]}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
