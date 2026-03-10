import { ConfigProvider, theme } from "antd";
import WanGPDashboard from "./components/WanGPDashboard";

export default function App() {
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
      }}
    >
      <WanGPDashboard />
    </ConfigProvider>
  );
}
