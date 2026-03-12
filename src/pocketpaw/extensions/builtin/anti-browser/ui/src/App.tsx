import { ConfigProvider, theme } from "antd";
import { useEffect } from "react";
import { useStore } from "./store";
import Sidebar from "./components/Sidebar";
import DashboardPage from "./components/DashboardPage";
import ProfilesPage from "./components/ProfilesPage";
import ActorsPage from "./components/ActorsPage";
import TeamPage from "./components/TeamPage";
import ProxiesPage from "./components/ProxiesPage";

export default function App() {
  const view = useStore((s) => s.view);

  useEffect(() => {
    // Load initial data
    const store = useStore.getState();
    store.fetchStats();
    store.fetchProfiles();
    store.fetchGroups();
    store.fetchActors();
    store.fetchTeam();
    store.fetchProxies();
  }, []);

  const pages: Record<string, React.ReactNode> = {
    dashboard: <DashboardPage />,
    profiles: <ProfilesPage />,
    actors: <ActorsPage />,
    team: <TeamPage />,
    proxies: <ProxiesPage />,
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#667eea",
          borderRadius: 10,
          colorBgContainer: "#141420",
          colorBgElevated: "#1a1a2e",
          colorBorder: "#252540",
          colorText: "#e0e0e0",
          colorTextSecondary: "#888",
          fontSize: 13,
        },
      }}
    >
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: "hidden" }}>
          {pages[view] || <DashboardPage />}
        </main>
      </div>
    </ConfigProvider>
  );
}
