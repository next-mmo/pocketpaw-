import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  loading?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;

  // Actions
  createConversation: (model: string) => string;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (
    conversationId: string,
    messageId: string,
    content: string,
  ) => void;
  setMessageLoading: (
    conversationId: string,
    messageId: string,
    loading: boolean,
  ) => void;
  clearConversations: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,

      createConversation: (model: string) => {
        const id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const conv: Conversation = {
          id,
          title: "New Chat",
          messages: [],
          model,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          conversations: [conv, ...state.conversations],
          activeConversationId: id,
        }));
        return id;
      },

      deleteConversation: (id: string) => {
        set((state) => {
          const filtered = state.conversations.filter((c) => c.id !== id);
          return {
            conversations: filtered,
            activeConversationId:
              state.activeConversationId === id
                ? (filtered[0]?.id ?? null)
                : state.activeConversationId,
          };
        });
      },

      setActiveConversation: (id: string | null) => {
        set({ activeConversationId: id });
      },

      addMessage: (conversationId: string, message: Message) => {
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            // Auto-title from first user message
            const title =
              c.messages.length === 0 && message.role === "user"
                ? message.content.slice(0, 40) +
                  (message.content.length > 40 ? "…" : "")
                : c.title;
            return {
              ...c,
              title,
              messages: [...c.messages, message],
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      updateMessage: (
        conversationId: string,
        messageId: string,
        content: string,
      ) => {
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, content } : m,
              ),
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      setMessageLoading: (
        conversationId: string,
        messageId: string,
        loading: boolean,
      ) => {
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, loading } : m,
              ),
            };
          }),
        }));
      },

      clearConversations: () => {
        set({ conversations: [], activeConversationId: null });
      },
    }),
    {
      name: "llama-cpp-chat",
    },
  ),
);
