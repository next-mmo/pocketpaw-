import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppId } from '@/lib/apps';
import { useChatStream, type SSEEvent } from '@/hooks/usePocketPaw';
import { useActivityStore } from '@/stores/activityStore';
import { useConnectionStore } from '@/stores/connectionStore';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
};

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[75%] rounded-[18px] px-4 py-2.5 ${
          isUser
            ? 'bg-[#007AFF] text-white shadow-md shadow-blue-500/15'
            : 'bg-black/6 text-black shadow-sm shadow-black/5 dark:bg-white/8 dark:text-white'
        }`}
      >
        <p className="whitespace-pre-wrap text-[14px] leading-[20px]">
          {message.content}
          {message.isStreaming && (
            <span className="ml-1 inline-block h-3 w-[2px] animate-pulse bg-current" />
          )}
        </p>
        <p
          className={`mt-1 text-[10px] ${
            isUser ? 'text-white/65' : 'text-black/35 dark:text-white/35'
          }`}
        >
          {message.isStreaming ? 'Typing…' : time}
        </p>
      </div>
    </div>
  );
}

function ToolIndicator({ name }: { name: string }) {
  return (
    <div className="my-1.5 flex items-center gap-2 pl-2">
      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
      <span className="text-[11px] text-black/40 dark:text-white/35">
        Using tool: <span className="font-medium">{name}</span>
      </span>
    </div>
  );
}

export default function MessagesApp(_props: { appId: AppId }) {
  const backendStatus = useConnectionStore((s) => s.backendStatus);
  const activity = useActivityStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      role: 'assistant',
      content: "Hi! I'm PocketPaw, your AI assistant. How can I help you today?",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamingIdRef = useRef<string | null>(null);
  const { streamChat, abort } = useChatStream();

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);
    setActiveTool(null);
    activity.beginStream();

    // Create a placeholder streaming message
    const streamId = crypto.randomUUID();
    streamingIdRef.current = streamId;
    const streamingMsg: ChatMessage = {
      id: streamId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, streamingMsg]);

    let streamSettled = false;

    try {
      await streamChat(text, sessionId, (event: SSEEvent) => {
        switch (event.event) {
          case 'stream_start': {
            const sid = event.data.session_id as string | undefined;
            if (sid) {
              setSessionId(sid);
              activity.setSessionId(sid);
            }
            break;
          }
          case 'chunk': {
            const chunk = (event.data.content as string) ?? '';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId ? { ...m, content: m.content + chunk } : m,
              ),
            );
            break;
          }
          case 'tool_start': {
            const toolName = (event.data.tool as string) ?? 'tool';
            setActiveTool(toolName);
            activity.pushToolStart(toolName, event.data.input);
            break;
          }
          case 'tool_result': {
            setActiveTool(null);
            activity.pushToolResult(
              (event.data.tool as string) ?? activeTool ?? 'tool',
              event.data.output,
            );
            break;
          }
          case 'thinking': {
            activity.pushThinking((event.data.content as string) ?? '');
            break;
          }
          case 'ask_user_question': {
            activity.pushAskUserQuestion(
              (event.data.question as string) ?? '',
              (event.data.options as unknown[]) ?? [],
            );
            break;
          }
          case 'stream_end': {
            streamSettled = true;
            activity.completeStream(event.data.usage);
            // Finalize the message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId
                  ? { ...m, isStreaming: false, timestamp: Date.now() }
                  : m,
              ),
            );
            break;
          }
          case 'error': {
            streamSettled = true;
            const detail = (event.data.detail as string) ?? 'An error occurred';
            activity.pushError(detail);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId
                  ? { ...m, content: `⚠️ ${detail}`, isStreaming: false }
                  : m,
              ),
            );
            break;
          }
        }
      });
    } catch (err) {
      // If aborted, don't show error
      if (err instanceof DOMException && err.name === 'AbortError') {
        streamSettled = true;
        return;
      }

      streamSettled = true;
      activity.pushError('Could not reach the backend. Make sure PocketPaw is running.');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamId
            ? {
                ...m,
                content: '⚠️ Could not reach the backend. Make sure PocketPaw is running.',
                isStreaming: false,
              }
            : m,
        ),
      );
    } finally {
      if (!streamSettled) {
        activity.stopStream();
      }
      setIsStreaming(false);
      setActiveTool(null);
      streamingIdRef.current = null;
    }
  }, [input, isStreaming, sessionId, streamChat]);

  const handleStop = useCallback(() => {
    abort();
    activity.stopStream('The live run was stopped from Messages.');
    setIsStreaming(false);
    setActiveTool(null);
    if (streamingIdRef.current) {
      const sid = streamingIdRef.current;
      setMessages((prev) =>
        prev.map((m) => (m.id === sid ? { ...m, isStreaming: false } : m)),
      );
    }
  }, [abort, activity]);

  const isOffline = backendStatus === 'offline' || backendStatus === 'error';

  return (
    <div className="flex h-full flex-col">
      {/* Conversation header */}
      <div className="flex items-center gap-3 border-b border-black/8 bg-white/40 px-5 py-3 backdrop-blur-lg dark:border-white/5 dark:bg-white/3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-purple-600 text-[14px] text-white shadow-md shadow-blue-500/20">
          🐾
        </div>
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold text-black dark:text-white">PocketPaw</h3>
          <p className="text-[11px] text-black/50 dark:text-white/45">
            {isStreaming ? 'Typing…' : isOffline ? 'Offline' : 'Online'}
          </p>
        </div>
        <div
          className={`h-2 w-2 rounded-full ${isOffline ? 'bg-zinc-300 dark:bg-zinc-600' : isStreaming ? 'animate-pulse bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'}`}
        />
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {activeTool && <ToolIndicator name={activeTool} />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar — iMessage style */}
      <div className="border-t border-black/8 bg-white/50 px-4 py-3 backdrop-blur-lg dark:border-white/5 dark:bg-white/3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={isOffline ? 'Backend is offline…' : 'Message PocketPaw…'}
            disabled={isOffline}
            className="min-h-[36px] flex-1 rounded-full border border-black/12 bg-black/3 px-4 py-2 text-[14px] text-black placeholder:text-black/35 focus:border-blue-500/50 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30 dark:focus:border-blue-400/50"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white shadow-md shadow-red-500/20 transition-all hover:bg-red-600 active:scale-95"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || isOffline}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#007AFF] text-white shadow-md shadow-blue-500/20 transition-all hover:bg-[#0066DD] active:scale-95 disabled:opacity-40 disabled:shadow-none"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
