import { ConfigProvider, theme } from "antd";
import { useEffect, useState } from "react";
import { ready } from "./sdk";

import TodosPage from "./pages/TodosPage";
import RemindersPage from "./pages/RemindersPage";
import IntentionsPage from "./pages/IntentionsPage";
import MemoryPage from "./pages/MemoryPage";
import SkillsPage from "./pages/SkillsPage";
import ChatPage from "./pages/ChatPage";
import EventsPage from "./pages/EventsPage";
import NotificationsPage from "./pages/NotificationsPage";
import CommandsPage from "./pages/CommandsPage";
import ToolsPage from "./pages/ToolsPage";
import SettingsPage from "./pages/SettingsPage";
import HealthPage from "./pages/HealthPage";

type View =
  | "todos"
  | "reminders"
  | "intentions"
  | "memory"
  | "skills"
  | "chat"
  | "events"
  | "notifications"
  | "commands"
  | "tools"
  | "settings"
  | "health";

const NAV: { section: string; items: { key: View; icon: string; label: string }[] }[] = [
  {
    section: "Core",
    items: [
      { key: "todos", icon: "📝", label: "Todos" },
      { key: "chat", icon: "💬", label: "Chat" },
      { key: "reminders", icon: "⏰", label: "Reminders" },
      { key: "intentions", icon: "🗓️", label: "Schedules" },
    ],
  },
  {
    section: "Knowledge",
    items: [
      { key: "memory", icon: "🧠", label: "Memory" },
      { key: "skills", icon: "⚡", label: "Skills" },
      { key: "events", icon: "📡", label: "Events" },
    ],
  },
  {
    section: "OpenClaw-Inspired",
    items: [
      { key: "notifications", icon: "🔔", label: "Notifications" },
      { key: "commands", icon: "⌨️", label: "Commands" },
      { key: "tools", icon: "🛠️", label: "Agent Tools" },
      { key: "settings", icon: "⚙️", label: "Settings" },
    ],
  },
  {
    section: "System",
    items: [{ key: "health", icon: "💚", label: "Health" }],
  },
];

export default function App() {
  const [view, setView] = useState<View>("todos");
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    ready().then(() => setSdkReady(true));
  }, []);

  const pages: Record<View, React.ReactNode> = {
    todos: <TodosPage />,
    reminders: <RemindersPage />,
    intentions: <IntentionsPage />,
    memory: <MemoryPage />,
    skills: <SkillsPage />,
    chat: <ChatPage />,
    events: <EventsPage />,
    notifications: <NotificationsPage />,
    commands: <CommandsPage />,
    tools: <ToolsPage />,
    settings: <SettingsPage />,
    health: <HealthPage />,
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#667eea",
          borderRadius: 8,
          colorBgContainer: "#1f1f2e",
          colorBgElevated: "#262640",
          colorBorder: "#2a2a40",
          colorText: "#e0e0e0",
          colorTextSecondary: "#888",
          fontSize: 13,
        },
      }}
    >
      <div className="app-layout">
        <nav className="sidebar">
          <div className="sidebar-header">
            <span>🧩 SDK Showcase</span>
            <span className="badge">v2</span>
          </div>

          {NAV.map((section) => (
            <div className="sidebar-section" key={section.section}>
              <div className="sidebar-section-label">{section.section}</div>
              {section.items.map((item) => (
                <button
                  key={item.key}
                  className={`sidebar-item ${view === item.key ? "active" : ""}`}
                  onClick={() => setView(item.key)}
                >
                  <span className="icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <main className="main-content">
          {sdkReady ? pages[view] : <div style={{ padding: 40, color: '#888' }}>Connecting to PocketPaw SDK…</div>}
        </main>
      </div>
    </ConfigProvider>
  );
}
