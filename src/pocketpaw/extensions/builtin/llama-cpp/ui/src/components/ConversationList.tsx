import { Button, Typography, Space, Tooltip } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import { useChatStore } from "../stores/chatStore";

const { Text } = Typography;

export default function ConversationList() {
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    createConversation,
    deleteConversation,
  } = useChatStore();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#1a1a1a",
        borderRight: "1px solid #303030",
      }}
    >
      <div
        style={{
          padding: "12px",
          borderBottom: "1px solid #303030",
        }}
      >
        <Button
          type="primary"
          icon={<PlusOutlined />}
          block
          onClick={() => createConversation("default")}
        >
          New Chat
        </Button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "4px" }}>
        {conversations.length === 0 && (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              opacity: 0.4,
            }}
          >
            <MessageOutlined style={{ fontSize: 32, marginBottom: 8 }} />
            <br />
            <Text type="secondary">No conversations yet</Text>
          </div>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => setActiveConversation(conv.id)}
            style={{
              padding: "8px 12px",
              margin: "2px 0",
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background:
                conv.id === activeConversationId
                  ? "rgba(22, 119, 255, 0.15)"
                  : "transparent",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (conv.id !== activeConversationId) {
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              }
            }}
            onMouseLeave={(e) => {
              if (conv.id !== activeConversationId) {
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            <Space
              direction="vertical"
              size={0}
              style={{ flex: 1, minWidth: 0 }}
            >
              <Text
                ellipsis
                style={{
                  color: conv.id === activeConversationId ? "#1677ff" : "#ccc",
                  fontSize: 13,
                  fontWeight: conv.id === activeConversationId ? 600 : 400,
                }}
              >
                {conv.title}
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {conv.messages.length} messages
              </Text>
            </Space>
            <Tooltip title="Delete">
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(conv.id);
                }}
                style={{ color: "#666", flexShrink: 0 }}
              />
            </Tooltip>
          </div>
        ))}
      </div>
    </div>
  );
}
