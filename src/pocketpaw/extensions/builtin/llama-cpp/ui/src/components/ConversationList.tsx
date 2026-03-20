import { useMemo } from "react";
import { Conversations } from "@ant-design/x";
import {
  PlusOutlined,
  MessageOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { Button, Typography } from "antd";
import { useChatStore } from "../stores/chatStore";

const { Text } = Typography;

/**
 * Conversation sidebar using @ant-design/x <Conversations> component.
 * Replaces the previous hand-rolled list with native grouping, context menus,
 * keyboard shortcuts, and creation button support.
 */
export default function ConversationList() {
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    createConversation,
    deleteConversation,
    renameConversation,
  } = useChatStore();

  // Group conversations by time period
  const items = useMemo(() => {
    const now = Date.now();
    const DAY = 86_400_000;

    return conversations.map((conv) => {
      const age = now - conv.createdAt;
      let group = "older";
      if (age < DAY) group = "today";
      else if (age < 2 * DAY) group = "yesterday";
      else if (age < 7 * DAY) group = "this_week";
      else if (age < 30 * DAY) group = "this_month";

      return {
        key: conv.id,
        label: conv.title || "New Chat",
        icon: <MessageOutlined />,
        group,
        timestamp: new Date(conv.createdAt),
      };
    });
  }, [conversations]);

  const groupLabels: Record<string, string> = {
    today: "Today",
    yesterday: "Yesterday",
    this_week: "This Week",
    this_month: "This Month",
    older: "Older",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#1a1a1a",
      }}
    >
      {/* New Chat button */}
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

      {/* Empty state */}
      {conversations.length === 0 && (
        <div
          style={{
            padding: 20,
            textAlign: "center",
            opacity: 0.4,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <MessageOutlined style={{ fontSize: 32 }} />
          <Text type="secondary">No conversations yet</Text>
        </div>
      )}

      {/* Conversation list with antdx Conversations component */}
      {conversations.length > 0 && (
        <div style={{ flex: 1, overflow: "auto" }}>
          <Conversations
            items={items}
            activeKey={activeConversationId ?? undefined}
            onActiveChange={(key) => setActiveConversation(key)}
            groupable={{
              label: (group) => groupLabels[group] || group,
              collapsible: true,
              defaultExpandedKeys: ["today", "yesterday", "this_week"],
            }}
            menu={(item) => ({
              items: [
                {
                  key: "rename",
                  label: "Rename",
                  icon: <EditOutlined />,
                },
                {
                  key: "delete",
                  label: "Delete",
                  icon: <DeleteOutlined />,
                  danger: true,
                },
              ],
              onClick: ({ key: menuKey }) => {
                if (menuKey === "delete") {
                  deleteConversation(item.key as string);
                } else if (menuKey === "rename") {
                  const newTitle = prompt(
                    "Rename conversation:",
                    (item.label as string) || "",
                  );
                  if (newTitle?.trim()) {
                    renameConversation(item.key as string, newTitle.trim());
                  }
                }
              },
            })}
            style={{
              background: "transparent",
              borderRight: "none",
            }}
          />
        </div>
      )}
    </div>
  );
}
