import { useCallback, useRef, useState } from 'react';
import type { AppId } from '@/lib/apps';
import { apiClient } from '@/lib/http/client';
import { useConnectionStore } from '@/stores/connectionStore';

type LogEntry = {
  id: string;
  type: 'command' | 'response' | 'error' | 'system';
  content: string;
  timestamp: number;
};

const HELP_TEXT = `PocketPaw Terminal — Available commands:

  /health          Show backend health status
  /version         Show backend version info
  /backends        List available AI backends
  /skills          List installed skills
  /channels        Show channel status
  /extensions      List extensions
  /memory          Show recent memories
  /chat <msg>      Send a chat message to your AI agent
  /clear           Clear terminal
  /help            Show this help message

  Any other text will be sent as a chat message.
`;

export default function TerminalApp(_props: { appId: AppId }) {
  const backendStatus = useConnectionStore((s) => s.backendStatus);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: '0',
      type: 'system',
      content: 'PocketPaw Terminal v1.0\nType /help for available commands.\n',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addLog = useCallback(
    (type: LogEntry['type'], content: string) => {
      setLogs((prev) => [...prev, { id: crypto.randomUUID(), type, content, timestamp: Date.now() }]);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      });
    },
    [],
  );

  const executeCommand = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      addLog('command', `❯ ${text}`);
      setHistory((prev) => [...prev, text]);
      setHistoryIndex(-1);

      if (text === '/clear') {
        setLogs([]);
        return;
      }

      if (text === '/help') {
        addLog('response', HELP_TEXT);
        return;
      }

      const apiCommands: Record<string, string> = {
        '/health': '/api/v1/health',
        '/version': '/api/v1/version',
        '/backends': '/api/v1/backends',
        '/skills': '/api/v1/skills',
        '/channels': '/api/channels/status',
        '/extensions': '/api/v1/extensions',
        '/memory': '/api/v1/memory',
      };

      const cmd = text.split(' ')[0];

      if (apiCommands[cmd]) {
        try {
          const res = await apiClient.get(apiCommands[cmd]);
          addLog('response', JSON.stringify(res.data, null, 2));
        } catch (err) {
          addLog(
            'error',
            `Error: ${err instanceof Error ? err.message : 'Request failed'}`,
          );
        }
        return;
      }

      // Chat command or plain text → send as chat
      const chatText = text.startsWith('/chat ') ? text.slice(6) : text;
      try {
        const res = await apiClient.post('/api/v1/chat', { message: chatText });
        addLog('response', res.data?.response ?? res.data?.message ?? JSON.stringify(res.data));
      } catch (err) {
        addLog(
          'error',
          `Error: ${err instanceof Error ? err.message : 'Chat request failed'}`,
        );
      }
    },
    [addLog],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void executeCommand(input);
        setInput('');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (history.length > 0) {
          const newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
          setHistoryIndex(newIndex);
          setInput(history[history.length - 1 - newIndex] ?? '');
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setInput(history[history.length - 1 - newIndex] ?? '');
        } else {
          setHistoryIndex(-1);
          setInput('');
        }
      }
    },
    [input, history, historyIndex, executeCommand],
  );

  const isOffline = backendStatus === 'offline' || backendStatus === 'error';

  return (
    <div
      className="flex h-full flex-col bg-[#1E1E1E] font-mono"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Terminal header bar */}
      <div className="flex items-center gap-2 border-b border-white/8 bg-[#2D2D2D] px-4 py-1.5">
        <span className="text-[12px] font-semibold text-white/60">pocketpaw</span>
        <span className="text-[11px] text-white/30">—</span>
        <span className="text-[11px] text-white/35">
          {isOffline ? '⚠ offline' : '● connected'}
        </span>
      </div>

      {/* Scrollable output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto px-4 py-3 text-[13px] leading-[20px]"
      >
        {logs.map((entry) => (
          <pre
            key={entry.id}
            className={`whitespace-pre-wrap ${
              entry.type === 'command'
                ? 'text-emerald-400'
                : entry.type === 'error'
                  ? 'text-red-400'
                  : entry.type === 'system'
                    ? 'text-amber-300/80'
                    : 'text-white/80'
            }`}
          >
            {entry.content}
          </pre>
        ))}
      </div>

      {/* Input line */}
      <div className="flex items-center border-t border-white/8 bg-[#2D2D2D] px-4 py-2">
        <span className="mr-2 text-[13px] text-emerald-400">❯</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isOffline ? 'backend offline…' : 'type a command…'}
          disabled={isOffline}
          spellCheck={false}
          autoFocus
          className="flex-1 border-none bg-transparent text-[13px] text-white/90 caret-emerald-400 outline-none placeholder:text-white/25"
        />
      </div>
    </div>
  );
}
