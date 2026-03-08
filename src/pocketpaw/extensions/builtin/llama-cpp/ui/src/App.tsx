import { useCallback, useEffect, useState } from "react";
import { ConfigProvider, Layout, theme, Segmented } from "antd";
import {
  MessageOutlined,
  SettingOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import ChatPanel from "./components/ChatPanel";
import SettingsPanel from "./components/SettingsPanel";
import ConversationList from "./components/ConversationList";
import { useServerStore, API_BASE, PLUGIN_ID } from "./stores/serverStore";

const { Sider, Content } = Layout;

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("chat");
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const { status, setServerInfo, setModels, selectedModel, setSelectedModel } =
    useServerStore();

  // Poll server status at app level (always runs)
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/status`,
        );
        if (res.ok) {
          const data = await res.json();
          setServerInfo({
            status: data.status,
            port: data.port,
            url: data.url,
            error: data.error,
            pid: data.pid,
            isInstalled: data.is_installed,
            installProgress: data.install_progress,
          });
        }
      } catch {
        // ignore
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [setServerInfo]);

  // Load models at app level
  const loadModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/plugins/${PLUGIN_ID}/models`);
      if (res.ok) {
        const data = await res.json();
        const models = data.models || [];
        setModels(models);
        if (models.length && !selectedModel) {
          setSelectedModel(models[0].file);
        }
      }
    } catch {
      // ignore
    }
  }, [setModels, selectedModel, setSelectedModel]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 8,
          colorBgContainer: "#1f1f1f",
          colorBgElevated: "#262626",
          colorBorder: "#303030",
          colorText: "#e0e0e0",
          colorTextSecondary: "#888",
          fontSize: 13,
        },
        components: {
          Card: {
            headerBg: "#1a1a1a",
          },
        },
      }}
    >
      <Layout style={{ height: "100vh", background: "#141414" }}>
        {/* Conversation Sidebar — only in chat mode */}
        {activeTab === "chat" && (
          <Sider
            width={220}
            collapsible
            collapsed={siderCollapsed}
            onCollapse={setSiderCollapsed}
            collapsedWidth={0}
            trigger={null}
            style={{
              background: "#1a1a1a",
              borderRight: "1px solid #303030",
            }}
          >
            <ConversationList />
          </Sider>
        )}

        {/* Main content area */}
        <Layout style={{ background: "#141414" }}>
          {/* Tab bar */}
          <div
            style={{
              padding: "8px 16px",
              borderBottom: "1px solid #303030",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#1a1a1a",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {activeTab === "chat" && (
                <UnorderedListOutlined
                  onClick={() => setSiderCollapsed(!siderCollapsed)}
                  style={{
                    fontSize: 16,
                    color: "#888",
                    cursor: "pointer",
                    padding: 4,
                  }}
                />
              )}
              <Segmented
                value={activeTab}
                onChange={(v) => setActiveTab(v as string)}
                options={[
                  {
                    label: "Chat",
                    value: "chat",
                    icon: <MessageOutlined />,
                  },
                  {
                    label: "Settings",
                    value: "settings",
                    icon: <SettingOutlined />,
                  },
                ]}
                size="small"
              />
            </div>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background:
                  status === "running"
                    ? "#52c41a"
                    : status === "starting" || status === "installing"
                      ? "#faad14"
                      : "#ff4d4f",
                boxShadow: status === "running" ? "0 0 6px #52c41a" : "none",
              }}
              title={`Server: ${status}`}
            />
          </div>

          <Content style={{ overflow: "hidden" }}>
            {activeTab === "chat" ? <ChatPanel /> : <SettingsPanel />}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
