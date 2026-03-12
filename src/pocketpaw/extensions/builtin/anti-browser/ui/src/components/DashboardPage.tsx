import { useStore } from "../store";
import {
  ChromeOutlined,
  RobotOutlined,
  TeamOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
  ArrowUpOutlined,
} from "@ant-design/icons";
import { Spin } from "antd";

const STAT_CARDS = [
  { key: "total_profiles", label: "Total Profiles", icon: <ChromeOutlined />, color: "#667eea" },
  { key: "active_profiles", label: "Active Sessions", icon: <ThunderboltOutlined />, color: "#52c41a" },
  { key: "total_actors", label: "Actors", icon: <RobotOutlined />, color: "#764ba2" },
  { key: "total_team_members", label: "Team Members", icon: <TeamOutlined />, color: "#1890ff" },
  { key: "total_proxies", label: "Proxies", icon: <GlobalOutlined />, color: "#faad14" },
  { key: "alive_proxies", label: "Alive Proxies", icon: <ArrowUpOutlined />, color: "#13c2c2" },
];

export default function DashboardPage() {
  const stats = useStore((s) => s.stats);
  const loading = useStore((s) => s.loadingStats);
  const setView = useStore((s) => s.setView);

  if (loading || !stats) {
    return (
      <div className="content-area" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="content-area">
      <div className="fade-in">
        {/* Header */}
        <div className="page-header">
          <div>
            <h2>
              <span className="gradient-text">Command Center</span>
            </h2>
            <p style={{ color: "#555", marginTop: 4, fontSize: 13 }}>
              Manage all browser profiles, actors, and team from one place
            </p>
          </div>
        </div>

        {/* Stat Grid */}
        <div className="grid-4" style={{ marginBottom: 32 }}>
          {STAT_CARDS.map((card, i) => (
            <div
              key={card.key}
              className="stat-card"
              style={{ animationDelay: `${i * 0.05}s`, cursor: "pointer" }}
              onClick={() => {
                if (card.key.includes("profile")) setView("profiles");
                else if (card.key.includes("actor")) setView("actors");
                else if (card.key.includes("team")) setView("team");
                else if (card.key.includes("prox")) setView("proxies");
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="stat-value">{stats[card.key] ?? 0}</div>
                  <div className="stat-label">{card.label}</div>
                </div>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: `${card.color}15`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    color: card.color,
                  }}
                >
                  {card.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick access cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div
            className="glass-card glow-border"
            style={{ padding: 24, cursor: "pointer" }}
            onClick={() => setView("profiles")}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e0e0e0", marginBottom: 8 }}>
              🛡️ Browser Profiles
            </div>
            <p style={{ color: "#666", fontSize: 13, lineHeight: 1.6 }}>
              Create isolated browser identities with unique fingerprints.
              Each profile has its own cookies, storage, timezone, WebGL, canvas, and audio fingerprint.
            </p>
          </div>

          <div
            className="glass-card glow-border"
            style={{ padding: 24, cursor: "pointer" }}
            onClick={() => setView("actors")}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e0e0e0", marginBottom: 8 }}>
              🤖 Actors (Automation)
            </div>
            <p style={{ color: "#666", fontSize: 13, lineHeight: 1.6 }}>
              Apify-style actors that run scripts across multiple profiles concurrently.
              Define input schemas, set concurrency limits, and schedule runs.
            </p>
          </div>

          <div
            className="glass-card glow-border"
            style={{ padding: 24, cursor: "pointer" }}
            onClick={() => setView("team")}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e0e0e0", marginBottom: 8 }}>
              👥 Team Control
            </div>
            <p style={{ color: "#666", fontSize: 13, lineHeight: 1.6 }}>
              Manage team members with role-based access. Admins, managers, and operators
              collaborate on shared profiles with activity tracking.
            </p>
          </div>

          <div
            className="glass-card glow-border"
            style={{ padding: 24, cursor: "pointer" }}
            onClick={() => setView("proxies")}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e0e0e0", marginBottom: 8 }}>
              🌐 Proxy Orchestration
            </div>
            <p style={{ color: "#666", fontSize: 13, lineHeight: 1.6 }}>
              Manage HTTP and SOCKS5 proxies. Auto-check health, measure latency,
              and assign proxies to profiles for geo-diverse browsing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
