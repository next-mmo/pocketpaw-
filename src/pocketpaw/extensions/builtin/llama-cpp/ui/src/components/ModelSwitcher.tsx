import { useEffect, useMemo, useState } from "react";
import { Select, Space, Tag, Typography, Tooltip, Badge } from "antd";
import {
  SwapOutlined,
  ThunderboltOutlined,
  CloudOutlined,
  ApiOutlined,
  CodeOutlined,
} from "@ant-design/icons";
import {
  useProviderStore,
  type ProviderConfig,
} from "../stores/providerStore";
import { useServerStore } from "../stores/serverStore";

const { Text } = Typography;

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  local: <ThunderboltOutlined />,
  openrouter: <CloudOutlined />,
  codex: <CodeOutlined />,
  custom: <ApiOutlined />,
};

const PROVIDER_COLORS: Record<string, string> = {
  local: "#52c41a",
  openrouter: "#722ed1",
  codex: "#1677ff",
  custom: "#fa8c16",
};

export default function ModelSwitcher() {
  const {
    providers,
    activeProviderId,
    activeModelId,
    setActiveProvider,
    setActiveModel,
    fetchModels,
  } = useProviderStore();
  const { status: localStatus } = useServerStore();
  const [loading, setLoading] = useState(false);

  // Only show enabled providers
  const enabledProviders = useMemo(
    () => providers.filter((p) => p.enabled),
    [providers],
  );

  const activeProvider = providers.find((p) => p.id === activeProviderId);

  // Fetch models when provider changes
  useEffect(() => {
    if (!activeProvider) return;
    // Skip local provider if server isn't running
    if (activeProvider.type === "local" && localStatus !== "running") return;
    // Skip if models already loaded recently (within 5 min)
    if (
      activeProvider.models.length > 0 &&
      Date.now() - activeProvider.modelsFetchedAt < 300_000
    )
      return;

    setLoading(true);
    fetchModels(activeProvider.id).finally(() => setLoading(false));
  }, [activeProviderId, localStatus, activeProvider, fetchModels]);

  // Build model options for the active provider
  const modelOptions = useMemo(() => {
    if (!activeProvider) return [];
    return activeProvider.models.map((m) => ({
      label: (
        <Space size={4}>
          <span>{m.name || m.id}</span>
          {m.isFree && (
            <Tag
              color="green"
              style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px" }}
            >
              FREE
            </Tag>
          )}
        </Space>
      ),
      value: m.id,
    }));
  }, [activeProvider]);

  const handleProviderChange = (providerId: string) => {
    setActiveProvider(providerId);
    // Reset model selection
    const provider = providers.find((p) => p.id === providerId);
    if (provider?.models.length) {
      setActiveModel(provider.models[0].id);
    } else {
      setActiveModel("");
    }
  };

  const isLocalDisabled =
    activeProvider?.type === "local" && localStatus !== "running";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
        flexShrink: 1,
      }}
    >
      <Tooltip title="Switch Provider">
        <SwapOutlined style={{ color: "#666", fontSize: 12, flexShrink: 0 }} />
      </Tooltip>

      {/* Provider selector */}
      <Select
        value={activeProviderId}
        onChange={handleProviderChange}
        size="small"
        variant="borderless"
        style={{ minWidth: 110, maxWidth: 140 }}
        popupMatchSelectWidth={false}
        options={enabledProviders.map((p) => ({
          label: (
            <Space size={4}>
              <span style={{ color: PROVIDER_COLORS[p.type] }}>
                {PROVIDER_ICONS[p.type]}
              </span>
              <span>{p.name}</span>
              {p.type === "local" && (
                <Badge
                  status={localStatus === "running" ? "success" : "default"}
                  style={{ marginLeft: 2 }}
                />
              )}
            </Space>
          ),
          value: p.id,
        }))}
      />

      {/* Model selector */}
      <Select
        value={activeModelId || undefined}
        onChange={setActiveModel}
        size="small"
        variant="borderless"
        style={{ minWidth: 140, maxWidth: 260, flex: 1 }}
        popupMatchSelectWidth={false}
        loading={loading}
        placeholder={
          isLocalDisabled
            ? "Start server first"
            : modelOptions.length === 0
              ? "No models"
              : "Select model"
        }
        disabled={isLocalDisabled || modelOptions.length === 0}
        options={modelOptions}
        showSearch
        filterOption={(input, option) =>
          (option?.value as string)?.toLowerCase().includes(input.toLowerCase())
        }
        notFoundContent={
          <Text type="secondary" style={{ fontSize: 12, padding: 8 }}>
            {isLocalDisabled
              ? "Start the local server to see models"
              : "No models available. Configure API key in Providers tab."}
          </Text>
        }
      />
    </div>
  );
}
