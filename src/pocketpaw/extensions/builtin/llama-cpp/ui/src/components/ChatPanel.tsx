import { useCallback, useEffect, useRef, useState } from "react";
import { Bubble, Sender } from "@ant-design/x";
import { Typography, Space, Button, Tooltip } from "antd";
import {
  DeleteOutlined,
  ClearOutlined,
  RobotOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useChatStore, type Message } from "../stores/chatStore";
import { useServerStore, API_BASE, PLUGIN_ID } from "../stores/serverStore";

const { Text } = Typography;

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
  const { status, url, selectedModel } = useServerStore();

  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConv?.messages ?? [];

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;
      if (status !== "running" || !url) return;

      let convId = activeConversationId;
      if (!convId) {
        convId = createConversation(selectedModel || "default");
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
        // Build message history for context
        const store = useChatStore.getState();
        const conv = store.conversations.find((c) => c.id === convId);
        const history = (conv?.messages ?? [])
          .filter((m) => !m.loading)
          .map((m) => ({ role: m.role, content: m.content }));

        // Use proxy endpoint to avoid CORS issues
        const proxyUrl = `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/proxy/v1/chat/completions`;
        const res = await fetch(proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            stream: true,
            max_tokens: 1024,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
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
      status,
      url,
      selectedModel,
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

  const serverNotReady = status !== "running";

  // Convert messages to Bubble.List items
  const bubbleItems = messages.map((msg) => ({
    key: msg.id,
    role: msg.role as string,
    content: msg.content || (msg.loading ? "" : ""),
    loading: msg.loading,
  }));

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
          padding: "12px 16px",
          borderBottom: "1px solid #303030",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <Space>
          <RobotOutlined style={{ fontSize: 18, color: "#1677ff" }} />
          <Text strong style={{ color: "#e0e0e0", fontSize: 15 }}>
            {activeConv?.title ?? "Llama Chat"}
          </Text>
        </Space>
        <Space>
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
        ref={listRef}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px",
        }}
      >
        {messages.length === 0 && !serverNotReady && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              flexDirection: "column",
              gap: 12,
              opacity: 0.5,
            }}
          >
            <RobotOutlined style={{ fontSize: 48, color: "#1677ff" }} />
            <Text style={{ color: "#888", fontSize: 16 }}>
              Start a conversation
            </Text>
          </div>
        )}

        {serverNotReady && (
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
              Server is not running. Go to Settings tab to start the server.
            </Text>
          </div>
        )}

        <Bubble.List
          items={bubbleItems.map((item) => ({
            key: item.key,
            loading: item.loading,
            content: item.content,
            placement:
              item.role === "user" ? ("end" as const) : ("start" as const),
            avatar:
              item.role === "user"
                ? { icon: <UserOutlined />, style: { background: "#1677ff" } }
                : { icon: <RobotOutlined />, style: { background: "#722ed1" } },
            messageRender: (content: string) => (
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {content}
              </div>
            ),
            style: {
              maxWidth: "85%",
            },
          }))}
          style={{ minHeight: messages.length > 0 ? 100 : 0 }}
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
          disabled={serverNotReady}
          placeholder={
            serverNotReady ? "Start the server first..." : "Type a message..."
          }
        />
      </div>
    </div>
  );
}
