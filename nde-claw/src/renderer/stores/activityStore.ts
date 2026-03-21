import { create } from 'zustand';

const MAX_ACTIVITY_ENTRIES = 250;

export type ActivityEntryKind =
  | 'session'
  | 'status'
  | 'thinking'
  | 'tool_start'
  | 'tool_result'
  | 'ask_user_question'
  | 'error';

export type ActivityEntryTone = 'neutral' | 'info' | 'warning' | 'success' | 'error';

export type ActivityUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ActivityEntry = {
  id: string;
  kind: ActivityEntryKind;
  label: string;
  title: string;
  detail: string;
  tone: ActivityEntryTone;
  timestamp: number;
};

type ActivityStoreState = {
  entries: ActivityEntry[];
  sessionId: string | null;
  isStreaming: boolean;
  activeTool: string | null;
  lastUsage: ActivityUsage | null;
  lastEventAt: number | null;
  clear: () => void;
  beginStream: () => void;
  setSessionId: (sessionId: string) => void;
  pushThinking: (content: string) => void;
  pushToolStart: (tool: string, input?: unknown) => void;
  pushToolResult: (tool: string, output?: unknown) => void;
  pushAskUserQuestion: (question: string, options?: unknown[]) => void;
  pushError: (detail: string) => void;
  completeStream: (usage?: unknown) => void;
  stopStream: (reason?: string) => void;
};

type ActivityStoreSnapshot = {
  entries: ActivityEntry[];
  sessionId: string | null;
  isStreaming: boolean;
  activeTool: string | null;
  lastUsage: ActivityUsage | null;
  lastEventAt: number | null;
};

export function createInitialActivityState(): ActivityStoreSnapshot {
  return {
    entries: [],
    sessionId: null,
    isStreaming: false,
    activeTool: null,
    lastUsage: null,
    lastEventAt: null,
  };
}

export function formatActivityDetail(value: unknown, fallback = ''): string {
  if (value == null) {
    return fallback;
  }

  const detail =
    typeof value === 'string'
      ? value.trim()
      : JSON.stringify(value, null, 2);

  if (!detail) {
    return fallback;
  }

  return detail.length > 1200 ? `${detail.slice(0, 1197)}...` : detail;
}

export function normalizeActivityUsage(value: unknown): ActivityUsage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const usage = value as Record<string, unknown>;
  const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? usage.totalTokens ?? inputTokens + outputTokens);

  if (![inputTokens, outputTokens, totalTokens].every((item) => Number.isFinite(item))) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function appendEntry(entries: ActivityEntry[], entry: ActivityEntry) {
  return [...entries, entry].slice(-MAX_ACTIVITY_ENTRIES);
}

function createEntry(
  kind: ActivityEntryKind,
  label: string,
  title: string,
  detail: string,
  tone: ActivityEntryTone,
): ActivityEntry {
  return {
    id: crypto.randomUUID(),
    kind,
    label,
    title,
    detail,
    tone,
    timestamp: Date.now(),
  };
}

function withEntry(
  state: ActivityStoreSnapshot,
  entry: ActivityEntry,
  extra: Partial<ActivityStoreSnapshot> = {},
) {
  return {
    ...extra,
    entries: appendEntry(state.entries, entry),
    lastEventAt: entry.timestamp,
  };
}

function formatUsageDetail(usage: ActivityUsage | null) {
  if (!usage) {
    return 'The response finished without token metadata.';
  }

  return `Input: ${usage.inputTokens.toLocaleString()} | Output: ${usage.outputTokens.toLocaleString()} | Total: ${usage.totalTokens.toLocaleString()}`;
}

export const useActivityStore = create<ActivityStoreState>()((set) => ({
  ...createInitialActivityState(),

  clear: () => set(createInitialActivityState()),

  beginStream: () =>
    set((state) =>
      withEntry(
        state,
        createEntry(
          'status',
          'Run',
          'Request started',
          'Messages opened a live agent run.',
          'info',
        ),
        {
          isStreaming: true,
          activeTool: null,
        },
      ),
    ),

  setSessionId: (sessionId) =>
    set((state) => {
      if (state.sessionId === sessionId) {
        return { sessionId };
      }

      return withEntry(
        state,
        createEntry('session', 'Session', 'Attached live session', sessionId, 'neutral'),
        { sessionId },
      );
    }),

  pushThinking: (content) =>
    set((state) =>
      withEntry(
        state,
        createEntry(
          'thinking',
          'Thinking',
          'Model reasoning',
          formatActivityDetail(content, 'The model is reasoning through the next step.'),
          'info',
        ),
        {
          isStreaming: true,
        },
      ),
    ),

  pushToolStart: (tool, input) =>
    set((state) =>
      withEntry(
        state,
        createEntry(
          'tool_start',
          'Tool',
          tool ? `Running ${tool}` : 'Tool started',
          formatActivityDetail(input, 'Waiting for tool output.'),
          'warning',
        ),
        {
          isStreaming: true,
          activeTool: tool || 'tool',
        },
      ),
    ),

  pushToolResult: (tool, output) =>
    set((state) =>
      withEntry(
        state,
        createEntry(
          'tool_result',
          'Result',
          tool ? `${tool} finished` : 'Tool finished',
          formatActivityDetail(output, 'Tool completed without output.'),
          'success',
        ),
        {
          activeTool: null,
        },
      ),
    ),

  pushAskUserQuestion: (question, options = []) =>
    set((state) => {
      const optionLabel = options.length
        ? `\nOptions: ${options.map((item) => String(item)).join(', ')}`
        : '';

      return withEntry(
        state,
        createEntry(
          'ask_user_question',
          'Question',
          'Agent needs user input',
          `${formatActivityDetail(question, 'The agent has a follow-up question.')}${optionLabel}`,
          'warning',
        ),
        {
          isStreaming: true,
        },
      );
    }),

  pushError: (detail) =>
    set((state) =>
      withEntry(
        state,
        createEntry(
          'error',
          'Error',
          'Agent error',
          formatActivityDetail(detail, 'The request ended with an error.'),
          'error',
        ),
        {
          isStreaming: false,
          activeTool: null,
        },
      ),
    ),

  completeStream: (usageValue) =>
    set((state) => {
      const usage = normalizeActivityUsage(usageValue);

      return withEntry(
        state,
        createEntry(
          'status',
          'Run',
          'Response finished',
          formatUsageDetail(usage),
          'neutral',
        ),
        {
          isStreaming: false,
          activeTool: null,
          lastUsage: usage,
        },
      );
    }),

  stopStream: (reason = 'The live run was stopped before completion.') =>
    set((state) =>
      withEntry(
        state,
        createEntry('status', 'Run', 'Request stopped', reason, 'neutral'),
        {
          isStreaming: false,
          activeTool: null,
        },
      ),
    ),
}));
