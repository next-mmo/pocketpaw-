import {
  DashboardOutlined,
  ChromeOutlined,
  RobotOutlined,
  TeamOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
  ShopOutlined,
  SettingOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { useStore } from "../store";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: <DashboardOutlined /> },
  { key: "profiles", label: "Profiles", icon: <ChromeOutlined /> },
  { key: "actors", label: "Actors", icon: <RobotOutlined /> },
  { key: "discovery", label: "Actor Store", icon: <ShopOutlined /> },
  { key: "team", label: "Team", icon: <TeamOutlined /> },
  { key: "proxies", label: "Proxies", icon: <GlobalOutlined /> },
] as const;

export default function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  return (
    <div className="sidebar" style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", paddingTop: 12 }}>
      {/* Logo */}
      <div style={{ padding: "16px 20px 24px", display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
          }}
        >
          <ThunderboltOutlined style={{ color: "#fff" }} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#e8e8e8", lineHeight: 1.2 }}>
            Anti-Browser
          </div>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase" }}>
            v1.0.0
          </div>
        </div>
      </div>

      {/* Nav Items */}
      <div style={{ flex: 1 }}>
        <div style={{ padding: "0 12px 8px", fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1.5 }}>
          Navigation
        </div>
        {NAV_ITEMS.map((item) => (
          <div
            key={item.key}
            className={`sidebar-item ${view === item.key ? "active" : ""}`}
            onClick={() => setView(item.key as any)}
          >
            <span className="icon">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}

        <div style={{ padding: "14px 12px 8px", fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1.5 }}>
          System
        </div>
        {[
          { key: "activity", label: "Activity", icon: <ClockCircleOutlined /> },
          { key: "settings", label: "Settings", icon: <SettingOutlined /> },
        ].map((item) => (
          <div
            key={item.key}
            className={`sidebar-item ${view === item.key ? "active" : ""}`}
            onClick={() => setView(item.key as any)}
          >
            <span className="icon">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ fontSize: 11, color: "#444" }}>
          Powered by Playwright
        </div>
        <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}>
          Anti-detect • Multi-actor • Team
        </div>
      </div>
    </div>
  );
}
