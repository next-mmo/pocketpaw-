import { useCallback, useState } from 'react';
import type { AppId } from '@/lib/apps';
import { useReminders, useAddReminder, useDeleteReminder } from '@/hooks/usePocketPaw';
import { useConnectionStore } from '@/stores/connectionStore';

function formatTime(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
      ', ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

export default function RemindersApp(_props: { appId: AppId }) {
  const backendStatus = useConnectionStore((s) => s.backendStatus);
  const { data, isLoading, error } = useReminders();
  const addReminder = useAddReminder();
  const deleteReminder = useDeleteReminder();
  const [input, setInput] = useState('');

  const isOffline = backendStatus === 'offline' || backendStatus === 'error';
  const reminders = data?.reminders ?? [];

  const handleAdd = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    try {
      await addReminder.mutateAsync(text);
      setInput('');
    } catch {
      /* error handled by mutation */
    }
  }, [input, addReminder]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-black/6 bg-white/40 px-6 py-4 backdrop-blur-xl dark:border-white/5 dark:bg-white/3">
        <h2 className="text-[20px] font-bold text-blue-600 dark:text-blue-400">Reminders</h2>
        <p className="mt-0.5 text-[12px] text-black/40 dark:text-white/30">
          {reminders.length} {reminders.length === 1 ? 'reminder' : 'reminders'}
        </p>
      </div>

      {/* Add reminder input */}
      <div className="border-b border-black/5 px-6 py-3 dark:border-white/4">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-500/40">
            <svg className="h-2.5 w-2.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAdd();
              }
            }}
            placeholder={isOffline ? 'Backend offline…' : 'Add a reminder (e.g. "in 5 minutes call mom")…'}
            disabled={isOffline || addReminder.isPending}
            className="flex-1 bg-transparent text-[14px] text-black placeholder:text-black/30 focus:outline-none dark:text-white dark:placeholder:text-white/25"
          />
          {input.trim() && (
            <button
              onClick={() => void handleAdd()}
              disabled={addReminder.isPending}
              className="rounded-lg bg-blue-500 px-3 py-1 text-[11px] font-medium text-white shadow-sm transition-all hover:bg-blue-600 active:scale-95 disabled:opacity-50"
            >
              {addReminder.isPending ? 'Adding…' : 'Add'}
            </button>
          )}
        </div>
      </div>

      {/* Reminders list */}
      <div className="flex-1 overflow-auto px-6 py-2">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
          </div>
        )}

        {error && (
          <div className="py-8 text-center text-[13px] text-red-400">
            Failed to load reminders
          </div>
        )}

        {!isLoading && reminders.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-[42px]">🔔</p>
            <p className="mt-3 text-[14px] font-medium text-black/30 dark:text-white/20">
              No reminders
            </p>
            <p className="mt-1 text-[12px] text-black/20 dark:text-white/15">
              Try &quot;in 30 minutes check the oven&quot;
            </p>
          </div>
        )}

        {reminders.map((reminder) => (
          <div
            key={reminder.id}
            className="group flex items-start gap-3 border-b border-black/4 py-3 dark:border-white/3"
          >
            {/* Circle checkbox */}
            <button
              onClick={() => {
                if (confirm('Mark as done? This will delete the reminder.')) {
                  deleteReminder.mutate(reminder.id);
                }
              }}
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-blue-400/50 transition-colors hover:border-blue-500 hover:bg-blue-500/10 dark:border-blue-400/30 dark:hover:border-blue-400"
            />

            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-snug text-black dark:text-white">
                {reminder.text}
              </p>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-black/35 dark:text-white/30">
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {formatTime(reminder.trigger_at)}
                </span>
                <span className="font-medium text-blue-500 dark:text-blue-400">
                  {reminder.time_remaining}
                </span>
              </div>
            </div>

            {/* Delete button */}
            <button
              onClick={() => deleteReminder.mutate(reminder.id)}
              disabled={deleteReminder.isPending}
              className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-black/25 opacity-0 transition-all hover:bg-red-500/8 hover:text-red-500 group-hover:opacity-100 dark:text-white/20 dark:hover:text-red-400"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
