import { useState } from 'react';
import type { AppId } from '@/lib/apps';
import { useMemories, useDeleteMemory, useMemoryStats } from '@/hooks/usePocketPaw';
import { useConnectionStore } from '@/stores/connectionStore';

function formatTimestamp(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' at ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

export default function NotesApp(_props: { appId: AppId }) {
  const backendStatus = useConnectionStore((s) => s.backendStatus);
  const { data: memories, isLoading, error } = useMemories();
  const { data: stats } = useMemoryStats();
  const deleteMemory = useDeleteMemory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const isOffline = backendStatus === 'offline' || backendStatus === 'error';
  const items = memories ?? [];
  const filtered = searchQuery
    ? items.filter(
        (m) =>
          m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.tags ?? []).some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())),
      )
    : items;

  const selected = filtered.find((m) => m.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="flex h-full">
      {/* Sidebar — note list */}
      <div className="flex w-[260px] flex-col border-r border-black/8 bg-white/50 backdrop-blur-xl dark:border-white/5 dark:bg-white/3">
        {/* Search */}
        <div className="border-b border-black/6 px-3 py-2 dark:border-white/5">
          <div className="flex items-center gap-2 rounded-lg bg-black/4 px-2.5 py-1.5 dark:bg-white/6">
            <svg className="h-3.5 w-3.5 text-black/35 dark:text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories…"
              className="flex-1 bg-transparent text-[12px] text-black placeholder:text-black/30 focus:outline-none dark:text-white dark:placeholder:text-white/25"
            />
          </div>
        </div>

        {/* Counter */}
        <div className="border-b border-black/5 px-4 py-1.5 dark:border-white/4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-black/30 dark:text-white/25">
            {filtered.length} {filtered.length === 1 ? 'memory' : 'memories'}
            {stats?.backend && ` · ${stats.backend}`}
          </p>
        </div>

        {/* Note list */}
        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-500" />
            </div>
          )}
          {error && (
            <div className="px-4 py-6 text-center text-[12px] text-red-400">
              Failed to load memories
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-[28px]">🧠</p>
              <p className="mt-2 text-[12px] text-black/35 dark:text-white/30">
                {isOffline ? 'Backend offline' : searchQuery ? 'No matches' : 'No memories yet'}
              </p>
            </div>
          )}
          {filtered.map((item) => {
            const isActive = item.id === (selected?.id ?? null);
            return (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full border-b border-black/4 px-4 py-3 text-left transition-colors dark:border-white/3 ${
                  isActive
                    ? 'bg-amber-500/10 dark:bg-amber-400/8'
                    : 'hover:bg-black/3 dark:hover:bg-white/3'
                }`}
              >
                <p className="truncate text-[13px] font-medium text-black dark:text-white">
                  {item.content.slice(0, 60)}
                </p>
                <p className="mt-0.5 text-[10px] text-black/35 dark:text-white/30">
                  {formatTimestamp(item.timestamp)}
                </p>
                {(item.tags ?? []).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {item.tags!.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:bg-amber-400/10 dark:text-amber-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content — selected memory */}
      <div className="flex flex-1 flex-col bg-white/20 dark:bg-white/1">
        {selected ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/5 px-6 py-3 dark:border-white/5">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-black/30 dark:text-white/25">
                  Memory
                </p>
                <p className="mt-0.5 text-[11px] text-black/45 dark:text-white/35">
                  {formatTimestamp(selected.timestamp)}
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm('Delete this memory?')) {
                    deleteMemory.mutate(selected.id);
                    setSelectedId(null);
                  }
                }}
                disabled={deleteMemory.isPending}
                className="rounded-lg px-2.5 py-1.5 text-[11px] text-red-500 transition-colors hover:bg-red-500/8 active:bg-red-500/15 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-400/8"
              >
                Delete
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto px-6 py-5">
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-black/80 dark:text-white/75">
                {selected.content}
              </p>

              {(selected.tags ?? []).length > 0 && (
                <div className="mt-6 flex flex-wrap gap-1.5">
                  {selected.tags!.map((tag) => (
                    <span key={tag} className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:bg-amber-400/10 dark:text-amber-400">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-[42px]">🧠</p>
              <p className="mt-3 text-[14px] font-medium text-black/30 dark:text-white/20">
                PocketPaw Memory
              </p>
              <p className="mt-1 text-[12px] text-black/20 dark:text-white/15">
                Select a memory to view its details
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
