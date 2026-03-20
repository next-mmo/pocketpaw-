import { useCallback, useRef, useState } from "react";
import { Bubble, Sender, Prompts } from "@ant-design/x";
import { Typography, Space, Button, Tooltip, Tag } from "antd";
import {
  DeleteOutlined,
  ClearOutlined,
  RobotOutlined,
  UserOutlined,
  BulbOutlined,
  CodeOutlined,
  FileTextOutlined,
  TranslationOutlined,
} from "@ant-design/icons";
import { Avatar } from "antd";
import { useChatStore, type Message } from "../stores/chatStore";
import { useServerStore } from "../stores/serverStore";
import {
  useProviderStore,
  getCompletionEndpoint,
} from "../stores/providerStore";
import ModelSwitcher from "./ModelSwitcher";

const { Text } = Typography;

// ── Role-based bubble configuration ─────────────────────────────────
const role: React.ComponentProps<typeof Bubble.List>["role"] = {
  user: {
    placement: "end",
  },
  assistant: {
    placement: "start",
    typing: true,
  },
};

// ── Starter prompts ─────────────────────────────────────────────────
const STARTER_PROMPTS = [
  {
    key: "explain",
    icon: <BulbOutlined style={{ color: "#faad14" }} />,
    label: "Explain a concept",
    description: "Break down something complex",
  },
  {
    key: "code",
    icon: <CodeOutlined style={{ color: "#52c41a" }} />,
    label: "Write some code",
    description: "Generate code for a task",
  },
  {
    key: "summarize",
    icon: <FileTextOutlined style={{ color: "#1677ff" }} />,
    label: "Summarize text",
    description: "Condense long content",
  },
  {
    key: "translate",
    icon: <TranslationOutlined style={{ color: "#eb2f96" }} />,
    label: "Translate text",
    description: "Convert between languages",
  },
];

const PROMPT_PREFILLS: Record<string, string> = {
  explain: "Explain in simple terms: ",
  code: "Write code to: ",
  summarize: "Summarize the following:\n\n",
  translate: "Translate the following to English:\n\n",
};

export default function ChatPanel() {
  const {
    conversations,
    activeConversationId,
    createConversation,
    addMessage,
    updateMessage,
    setMessageLoading,
    deleteConversation,
  } = useChatStore();
  const { status: localStatus } = useServerStore();
  const { providers, activeProviderId, activeModelId } = useProviderStore();

  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConv?.messages ?? [];
  const activeProvider = providers.find((p) => p.id === activeProviderId);

  // Determine if sending is possible
  const canSend = (() => {
    if (!activeProvider?.enabled) return false;
    if (activeProvider.type === "local" && localStatus !== "running")
      return false;
    if (!activeModelId) return false;
    return true;
  })();

  const getPlaceholder = () => {
    if (!activeProvider?.enabled) return "Enable a provider first...";
    if (activeProvider.type === "local" && localStatus !== "running")
      return "Start the local server first...";
    if (!activeModelId) return "Select a model first...";
    return "Type a message... (Shift+Enter for new line)";
  };

  // ── Send message with streaming ───────────────────────────────────
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming || !canSend || !activeProvider) return;

      const modelLabel = activeModelId;
      let convId = activeConversationId;
      if (!convId) {
        convId = createConversation(modelLabel);
      }

      // Add user message
      const userMsg: Message = {
        id: `msg-${Date.now()}-u`,
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };
      addMessage(convId, userMsg);
      setInputValue("");

      // Add placeholder assistant message
      const assistantId = `msg-${Date.now()}-a`;
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        loading: true,
      };
      addMessage(convId, assistantMsg);

      // Stream response
      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Build message history
        const store = useChatStore.getState();
        const conv = store.conversations.find((c) => c.id === convId);
        const history = (conv?.messages ?? [])
          .filter((m) => !m.loading)
          .map((m) => ({ role: m.role, content: m.content }));

        // Get provider-specific endpoint
        const { url, headers } = getCompletionEndpoint(activeProvider);

        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: activeModelId,
            messages: history,
            stream: true,
            max_tokens: 1024,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          throw new Error(
            `${activeProvider.name} error (${res.status}): ${errBody.slice(0, 200)}`,
          );
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                accumulated += delta;
                updateMessage(convId!, assistantId, accumulated);
              }
            } catch {
              // skip parse errors
            }
          }
        }

        setMessageLoading(convId!, assistantId, false);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          setMessageLoading(convId!, assistantId, false);
        } else {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          updateMessage(convId!, assistantId, `⚠️ Error: ${errorMsg}`);
          setMessageLoading(convId!, assistantId, false);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [
      activeConversationId,
      canSend,
      activeProvider,
      activeModelId,
      isStreaming,
      createConversation,
      addMessage,
      updateMessage,
      setMessageLoading,
    ],
  );

  const handleStop = () => {
    abortRef.current?.abort();
  };

  // ── Convert messages to Bubble.List items ─────────────────────────
  const bubbleItems = messages.map((msg) => ({
    key: msg.id,
    role: msg.role as string,
    content: msg.content || "",
    loading: msg.loading,
  }));

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#141414",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid #303030",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          gap: 8,
        }}
      >
        <Space style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <RobotOutlined
            style={{ fontSize: 16, color: "#1677ff", flexShrink: 0 }}
          />
          <Text
            strong
            style={{
              color: "#e0e0e0",
              fontSize: 13,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {activeConv?.title ?? "New Chat"}
          </Text>
          {activeConv && activeProvider && (
            <Tag
              color={
                activeProvider.type === "local"
                  ? "green"
                  : activeProvider.type === "openrouter"
                    ? "purple"
                    : "blue"
              }
              style={{ fontSize: 10, lineHeight: "16px" }}
            >
              {activeProvider.name}
            </Tag>
          )}
        </Space>
        <Space size={4}>
          <ModelSwitcher />
          {activeConversationId && (
            <Tooltip title="Delete conversation">
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => deleteConversation(activeConversationId)}
                style={{ color: "#999" }}
              />
            </Tooltip>
          )}
          <Tooltip title="New chat">
            <Button
              type="text"
              size="small"
              icon={<ClearOutlined />}
              onClick={() => {
                useChatStore.getState().setActiveConversation(null);
              }}
              style={{ color: "#999" }}
            />
          </Tooltip>
        </Space>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Empty state: starter prompts */}
        {messages.length === 0 && canSend && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div style={{ textAlign: "center", opacity: 0.7 }}>
              <RobotOutlined
                style={{ fontSize: 48, color: "#1677ff", marginBottom: 12 }}
              />
              <div>
                <Text style={{ color: "#ccc", fontSize: 16 }}>
                  Start a conversation
                </Text>
              </div>
              {activeProvider && (
                <Text style={{ color: "#555", fontSize: 12 }}>
                  Using {activeProvider.name} · {activeModelId}
                </Text>
              )}
            </div>
            <Prompts
              items={STARTER_PROMPTS}
              onItemClick={({ data }) => {
                const prefill =
                  PROMPT_PREFILLS[data.key] || "";
                setInputValue(prefill);
              }}
              wrap
              styles={{
                item: {
                  flex: "none",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid #303030",
                  borderRadius: 8,
                },
              }}
            />
          </div>
        )}

        {/* Provider not ready state */}
        {!canSend && messages.length === 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              flexDirection: "column",
              gap: 12,
              opacity: 0.6,
            }}
          >
            <RobotOutlined style={{ fontSize: 48, color: "#faad14" }} />
            <Text style={{ color: "#faad14", fontSize: 14 }}>
              {!activeProvider?.enabled
                ? "No provider enabled. Go to the Providers tab to set one up."
                : activeProvider.type === "local" && localStatus !== "running"
                  ? "Local server is not running. Go to Settings to start it."
                  : "Select a model from the dropdown above."}
            </Text>
          </div>
        )}

        {/* Chat bubbles using @ant-design/x roles config */}
        <Bubble.List
          role={role}
          items={bubbleItems.map((item) => ({
            key: item.key,
            role: item.role as "user" | "assistant",
            loading: item.loading,
            content: item.content,
            avatar:
              item.role === "user" ? (
                <Avatar
                  icon={<UserOutlined />}
                  style={{ background: "#1677ff" }}
                />
              ) : (
                <Avatar
                  icon={<RobotOutlined />}
                  style={{ background: "#722ed1" }}
                />
              ),
            messageRender: (content: string) => (
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {content}
              </div>
            ),
            style: {
              maxWidth: "85%",
            },
          }))}
          autoScroll
          style={{
            minHeight: messages.length > 0 ? 100 : 0,
            flex: messages.length > 0 ? 1 : undefined,
          }}
        />
      </div>

      {/* Input */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #303030",
          flexShrink: 0,
        }}
      >
        <Sender
          value={inputValue}
          onChange={setInputValue}
          onSubmit={sendMessage}
          onCancel={handleStop}
          loading={isStreaming}
          disabled={!canSend}
          placeholder={getPlaceholder()}
        />
      </div>
    </div>
  );
}
