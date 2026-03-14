import { useState } from "react";
import {
  Card,
  Switch,
  Input,
  Button,
  Space,
  Typography,
  Tag,
  Divider,
  message,
  Modal,
  Form,
  Select,
  Tooltip,
  Badge,
  List,
  Collapse,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  CloudOutlined,
  ApiOutlined,
  CodeOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import {
  useProviderStore,
  type ProviderConfig,
  type ProviderType,
} from "../stores/providerStore";
import { useServerStore } from "../stores/serverStore";

const { Text, Title, Paragraph } = Typography;

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  local: <ThunderboltOutlined style={{ color: "#52c41a" }} />,
  openrouter: <CloudOutlined style={{ color: "#722ed1" }} />,
  codex: <CodeOutlined style={{ color: "#1677ff" }} />,
  custom: <ApiOutlined style={{ color: "#fa8c16" }} />,
};

const PROVIDER_COLORS: Record<string, string> = {
  local: "#52c41a",
  openrouter: "#722ed1",
  codex: "#1677ff",
  custom: "#fa8c16",
};

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  local:
    "Run GGUF models locally using llama-cpp-python or node-llama-cpp. No API key needed — requires downloading a model file.",
  openrouter:
    "Access 100+ cloud models including GPT-4, Claude, Llama, Mistral, and many free models. Get your API key at openrouter.ai",
  codex:
    "Connect to a local Codex CLI server. Start it with `codex --serve` to use OAuth-based authentication.",
  custom:
    "Connect to any OpenAI-compatible API endpoint (e.g. Ollama, LiteLLM, vLLM, text-generation-webui).",
};

function ProviderCard({
  provider,
  readonly,
}: {
  provider: ProviderConfig;
  readonly?: boolean;
}) {
  const { updateProvider, removeProvider, fetchModels } = useProviderStore();
  const { status: localStatus } = useServerStore();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    "success" | "error" | null
  >(null);
  const [showKey, setShowKey] = useState(false);

  const isLocal = provider.type === "local";
  const needsApiKey = provider.type === "openrouter" || provider.type === "custom";

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await fetchModels(provider.id);
      const updated = useProviderStore
        .getState()
        .providers.find((p) => p.id === provider.id);
      if (updated && updated.models.length > 0) {
        setTestResult("success");
        message.success(
          `Connected! Found ${updated.models.length} model${updated.models.length !== 1 ? "s" : ""}.`,
        );
      } else {
        setTestResult("error");
        message.warning("Connected but no models found.");
      }
    } catch {
      setTestResult("error");
      message.error("Connection failed. Check your settings.");
    }
    setTesting(false);
  };

  const handleRefreshModels = async () => {
    setTesting(true);
    try {
      await fetchModels(provider.id);
      const updated = useProviderStore
        .getState()
        .providers.find((p) => p.id === provider.id);
      message.success(`Refreshed: ${updated?.models.length || 0} models`);
    } catch {
      message.error("Failed to refresh models");
    }
    setTesting(false);
  };

  return (
    <Card
      size="small"
      style={{
        borderColor: provider.enabled
          ? PROVIDER_COLORS[provider.type]
          : "#303030",
        borderWidth: provider.enabled ? 1 : 1,
        opacity: provider.enabled ? 1 : 0.6,
        transition: "all 0.3s",
      }}
      title={
        <Space>
          {PROVIDER_ICONS[provider.type]}
          <span>{provider.name}</span>
          {isLocal && (
            <Badge
              status={localStatus === "running" ? "success" : "default"}
              text={
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {localStatus}
                </Text>
              }
            />
          )}
          {provider.models.length > 0 && (
            <Tag style={{ fontSize: 10 }}>
              {provider.models.length} model
              {provider.models.length !== 1 ? "s" : ""}
            </Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          {testResult === "success" && (
            <CheckCircleOutlined style={{ color: "#52c41a" }} />
          )}
          {testResult === "error" && (
            <CloseCircleOutlined style={{ color: "#ff4d4f" }} />
          )}
          <Switch
            size="small"
            checked={provider.enabled}
            onChange={(checked) =>
              updateProvider(provider.id, { enabled: checked })
            }
          />
        </Space>
      }
    >
      <Text
        type="secondary"
        style={{ display: "block", marginBottom: 12, fontSize: 12 }}
      >
        {PROVIDER_DESCRIPTIONS[provider.type]}
      </Text>

      {/* API Key */}
      {needsApiKey && (
        <div style={{ marginBottom: 12 }}>
          <Text
            type="secondary"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            API Key
          </Text>
          <Space.Compact style={{ width: "100%" }}>
            <Input
              value={provider.apiKey}
              onChange={(e) =>
                updateProvider(provider.id, { apiKey: e.target.value })
              }
              placeholder={
                provider.type === "openrouter"
                  ? "sk-or-v1-..."
                  : "sk-..."
              }
              type={showKey ? "text" : "password"}
              style={{ fontFamily: "monospace", fontSize: 12 }}
            />
            <Button
              icon={showKey ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              onClick={() => setShowKey(!showKey)}
            />
          </Space.Compact>
          {provider.type === "openrouter" && (
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, marginTop: 4, display: "inline-block" }}
            >
              <LinkOutlined /> Get free API key at openrouter.ai
            </a>
          )}
        </div>
      )}

      {/* Base URL */}
      {(provider.type === "custom" || provider.type === "codex") && (
        <div style={{ marginBottom: 12 }}>
          <Text
            type="secondary"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Base URL
          </Text>
          <Input
            value={provider.baseUrl}
            onChange={(e) =>
              updateProvider(provider.id, { baseUrl: e.target.value })
            }
            placeholder="http://127.0.0.1:11434"
            style={{ fontFamily: "monospace", fontSize: 12 }}
          />
        </div>
      )}

      {/* Custom provider name */}
      {provider.type === "custom" && !readonly && (
        <div style={{ marginBottom: 12 }}>
          <Text
            type="secondary"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Display Name
          </Text>
          <Input
            value={provider.name}
            onChange={(e) =>
              updateProvider(provider.id, { name: e.target.value })
            }
            placeholder="My LLM Server"
            size="small"
          />
        </div>
      )}

      {/* Model list preview */}
      {provider.models.length > 0 && (
        <Collapse
          size="small"
          ghost
          items={[
            {
              key: "models",
              label: (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Available Models ({provider.models.length})
                </Text>
              ),
              children: (
                <List
                  size="small"
                  dataSource={provider.models.slice(0, 20)}
                  renderItem={(m) => (
                    <List.Item
                      style={{ padding: "2px 0", borderBottom: "none" }}
                    >
                      <Text
                        style={{ fontSize: 11, fontFamily: "monospace" }}
                        ellipsis
                      >
                        {m.name || m.id}
                      </Text>
                      {m.isFree && (
                        <Tag
                          color="green"
                          style={{
                            fontSize: 9,
                            lineHeight: "14px",
                            padding: "0 3px",
                            marginLeft: 4,
                          }}
                        >
                          FREE
                        </Tag>
                      )}
                    </List.Item>
                  )}
                  style={{ maxHeight: 200, overflow: "auto" }}
                />
              ),
            },
          ]}
        />
      )}

      {/* Actions */}
      <Space style={{ marginTop: 8 }}>
        {!isLocal && (
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={testing}
            onClick={handleTestConnection}
            disabled={
              needsApiKey && !provider.apiKey && provider.type !== "codex"
            }
          >
            Test & Fetch Models
          </Button>
        )}
        {isLocal && (
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={testing}
            onClick={handleRefreshModels}
            disabled={localStatus !== "running"}
          >
            Refresh Models
          </Button>
        )}
        {!readonly && provider.type === "custom" && (
          <Tooltip title="Remove this provider">
            <Button
              size="small"
              danger
              type="text"
              icon={<DeleteOutlined />}
              onClick={() => {
                removeProvider(provider.id);
                message.info(`Removed ${provider.name}`);
              }}
            />
          </Tooltip>
        )}
      </Space>
    </Card>
  );
}

export default function ProvidersPanel() {
  const { providers, addProvider } = useProviderStore();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [form] = Form.useForm();

  const handleAddProvider = () => {
    form.validateFields().then((values) => {
      const id = `custom-${Date.now()}`;
      addProvider({
        id,
        type: values.type as ProviderType,
        name: values.name || `Custom (${values.type})`,
        baseUrl: values.baseUrl || "",
        apiKey: values.apiKey || "",
        enabled: true,
        models: [],
        modelsFetchedAt: 0,
      });
      message.success("Provider added!");
      setAddModalOpen(false);
      form.resetFields();
    });
  };

  // Separate built-in vs custom providers
  const builtinProviders = providers.filter(
    (p) => p.type !== "custom" || ["local", "openrouter", "codex"].includes(p.id),
  );
  const customProviders = providers.filter(
    (p) => p.type === "custom" && !["local", "openrouter", "codex"].includes(p.id),
  );

  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%" }}>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <Title level={5} style={{ margin: 0 }}>
              Providers
            </Title>
            <Paragraph
              type="secondary"
              style={{ margin: 0, fontSize: 12 }}
            >
              Configure AI model providers. Enable the ones you want to use,
              add API keys, and switch between them in chat.
            </Paragraph>
          </div>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}
          >
            Add Provider
          </Button>
        </div>

        {/* Built-in providers */}
        {builtinProviders.map((p) => (
          <ProviderCard key={p.id} provider={p} readonly />
        ))}

        {/* Custom providers */}
        {customProviders.length > 0 && (
          <>
            <Divider style={{ margin: "4px 0" }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Custom Providers
              </Text>
            </Divider>
            {customProviders.map((p) => (
              <ProviderCard key={p.id} provider={p} />
            ))}
          </>
        )}
      </Space>

      {/* Add Provider Modal */}
      <Modal
        title="Add Custom Provider"
        open={addModalOpen}
        onOk={handleAddProvider}
        onCancel={() => {
          setAddModalOpen(false);
          form.resetFields();
        }}
        okText="Add"
        width={440}
      >
        <Form form={form} layout="vertical" initialValues={{ type: "custom" }}>
          <Form.Item
            name="type"
            label="Provider Type"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                {
                  label: (
                    <Space>
                      <ApiOutlined style={{ color: "#fa8c16" }} /> Custom
                      OpenAI-Compatible
                    </Space>
                  ),
                  value: "custom",
                },
                {
                  label: (
                    <Space>
                      <CloudOutlined style={{ color: "#722ed1" }} /> OpenRouter
                    </Space>
                  ),
                  value: "openrouter",
                },
                {
                  label: (
                    <Space>
                      <CodeOutlined style={{ color: "#1677ff" }} /> Codex CLI
                    </Space>
                  ),
                  value: "codex",
                },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="Display Name"
            rules={[{ required: true, message: "Give it a name" }]}
          >
            <Input placeholder="e.g. Ollama, LiteLLM, My Server" />
          </Form.Item>
          <Form.Item name="baseUrl" label="Base URL">
            <Input
              placeholder="http://127.0.0.1:11434"
              style={{ fontFamily: "monospace" }}
            />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key (optional)">
            <Input.Password
              placeholder="sk-..."
              style={{ fontFamily: "monospace" }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
