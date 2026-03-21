import { openExternal } from '@/lib/utils/desktop';
import type { AppId } from '@/lib/apps';
import { useSystemStatus } from '@/hooks/usePocketPaw';
import { useActivityStore, type ActivityEntry, type ActivityEntryTone } from '@/stores/activityStore';
import { useConnectionStore } from '@/stores/connectionStore';

function formatClock(timestamp: number | null) {
  if (!timestamp) {
    return '--:--:--';
  }

  return new Intl.DateTimeFormat([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp);
}

function formatSessionId(sessionId: string | null) {
  if (!sessionId) {
    return 'Not attached';
  }

  return sessionId.replace(/^websocket_/, 'ws_');
}

function toneStyles(tone: ActivityEntryTone) {
  switch (tone) {
    case 'info':
      return {
        dot: 'bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.45)]',
        badge: 'bg-sky-500/12 text-sky-700 dark:bg-sky-400/12 dark:text-sky-300',
        border: 'border-sky-500/14 dark:border-sky-400/14',
      };
    case 'warning':
      return {
        dot: 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.45)]',
        badge: 'bg-amber-500/14 text-amber-700 dark:bg-amber-400/14 dark:text-amber-300',
        border: 'border-amber-500/14 dark:border-amber-400/14',
      };
    case 'success':
      return {
        dot: 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.45)]',
        badge: 'bg-emerald-500/14 text-emerald-700 dark:bg-emerald-400/14 dark:text-emerald-300',
        border: 'border-emerald-500/14 dark:border-emerald-400/14',
      };
    case 'error':
      return {
        dot: 'bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.45)]',
        badge: 'bg-rose-500/14 text-rose-700 dark:bg-rose-400/14 dark:text-rose-300',
        border: 'border-rose-500/14 dark:border-rose-400/14',
      };
    default:
      return {
        dot: 'bg-zinc-400 shadow-[0_0_12px_rgba(161,161,170,0.35)]',
        badge: 'bg-black/5 text-black/65 dark:bg-white/8 dark:text-white/60',
        border: 'border-black/8 dark:border-white/8',
      };
  }
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/45 bg-white/60 px-4 py-3 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.05]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/40 dark:text-white/35">
        {label}
      </p>
      <p className="mt-2 text-[28px] font-semibold tracking-tight text-black dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-[12px] text-black/45 dark:text-white/42">{detail}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-[12px] text-black/45 dark:text-white/40">{label}</span>
      <span className="max-w-[220px] text-right text-[12px] font-medium text-black/78 dark:text-white/80">
        {value}
      </span>
    </div>
  );
}

function SpecMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-[18px] bg-black/[0.035] px-3 py-2.5 text-center dark:bg-white/[0.04]">
      <p className="text-[10px] uppercase tracking-[0.16em] text-black/35 dark:text-white/30">
        {label}
      </p>
      <p className="mt-1 text-[15px] font-semibold text-black/80 dark:text-white/82">{value}</p>
      {note ? (
        <p className="mt-0.5 text-[10px] text-black/35 dark:text-white/30">{note}</p>
      ) : null}
    </div>
  );
}

function LegendRow({
  label,
  tone,
  description,
}: {
  label: string;
  tone: ActivityEntryTone;
  description: string;
}) {
  const styles = toneStyles(tone);

  return (
    <div className="flex items-start gap-3 py-2">
      <span className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full ${styles.dot}`} />
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-black/80 dark:text-white/78">{label}</p>
        <p className="text-[12px] text-black/45 dark:text-white/40">{description}</p>
      </div>
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const styles = toneStyles(entry.tone);

  return (
    <article
      className={`rounded-[24px] border bg-white/72 p-4 shadow-[0_24px_48px_-34px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:bg-white/[0.05] ${styles.border}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full ${styles.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${styles.badge}`}
            >
              {entry.label}
            </span>
            <span className="text-[11px] text-black/35 dark:text-white/35">
              {formatClock(entry.timestamp)}
            </span>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold tracking-tight text-black dark:text-white">
            {entry.title}
          </h3>
          <p className="mt-2 whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-black/58 dark:text-white/52">
            {entry.detail}
          </p>
        </div>
      </div>
    </article>
  );
}

export default function ActivityMonitorApp(_props: { appId: AppId }) {
  const entries = useActivityStore((state) => state.entries);
  const sessionId = useActivityStore((state) => state.sessionId);
  const isStreaming = useActivityStore((state) => state.isStreaming);
  const activeTool = useActivityStore((state) => state.activeTool);
  const lastUsage = useActivityStore((state) => state.lastUsage);
  const lastEventAt = useActivityStore((state) => state.lastEventAt);
  const clear = useActivityStore((state) => state.clear);

  const backendStatus = useConnectionStore((state) => state.backendStatus);
  const backendVersion = useConnectionStore((state) => state.version);
  const backendName = backendVersion?.agent_backend ?? 'unknown';
  const { data: systemStatus } = useSystemStatus();

  const toolCount = entries.filter((entry) => entry.kind === 'tool_start').length;
  const errorCount = entries.filter((entry) => entry.kind === 'error').length;
  const visibleEntries = [...entries].reverse();

  const cpuValue =
    systemStatus?.cpu?.percent != null
      ? `${Math.round(systemStatus.cpu.percent)}%`
      : systemStatus?.cpu?.cores
        ? `${systemStatus.cpu.cores}c`
        : '—';
  const ramValue =
    systemStatus?.memory?.percent != null
      ? `${Math.round(systemStatus.memory.percent)}%`
      : systemStatus?.memory?.total_gb != null
        ? `${systemStatus.memory.total_gb.toFixed(0)} GB`
        : '—';
  const diskValue =
    systemStatus?.disk?.percent != null ? `${Math.round(systemStatus.disk.percent)}%` : '—';
  const batteryValue =
    systemStatus?.battery?.percent != null
      ? `${Math.round(systemStatus.battery.percent)}%${systemStatus.battery.power_plugged ? ' ⚡' : ''}`
      : '—';

  return (
    <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,rgba(250,251,255,0.94),rgba(236,240,247,0.88))] text-black dark:bg-[linear-gradient(180deg,rgba(24,26,31,0.96),rgba(15,17,22,0.94))] dark:text-white">
      <div className="relative overflow-hidden border-b border-black/8 px-6 py-5 dark:border-white/6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(94,176,255,0.28),transparent_45%),radial-gradient(circle_at_top_right,rgba(255,184,107,0.2),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.84),rgba(255,255,255,0.52))] dark:bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_44%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[640px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/40 dark:text-white/35">
              Utilities
            </p>
            <h2 className="mt-2 text-[30px] font-semibold tracking-tight text-black dark:text-white">
              Activity Monitor
            </h2>
            <p className="mt-2 max-w-[560px] text-[13px] leading-6 text-black/55 dark:text-white/48">
              Live PocketPaw run telemetry for the Messages app. Tool calls, reasoning traces,
              completions, and failures appear here as they stream back from the backend.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium shadow-[0_12px_30px_-24px_rgba(15,23,42,0.7)] backdrop-blur-xl ${
                isStreaming
                  ? 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300'
                  : 'border-black/8 bg-white/55 text-black/60 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/55'
              }`}
            >
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full ${
                  isStreaming
                    ? 'animate-pulse bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.45)]'
                    : 'bg-zinc-400'
                }`}
              />
              {isStreaming ? 'Live now' : 'Idle'}
            </div>
            <button
              type="button"
              onClick={clear}
              className="rounded-full border border-black/8 bg-white/62 px-3.5 py-1.5 text-[12px] font-medium text-black/70 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.7)] backdrop-blur-xl transition-colors hover:bg-white/78 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/68 dark:hover:bg-white/[0.08]"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Events"
            value={entries.length.toLocaleString()}
            detail="Captured from the current nde-claw session."
          />
          <MetricCard
            label="Tool Calls"
            value={toolCount.toLocaleString()}
            detail={activeTool ? `Current tool: ${activeTool}` : 'No tool is running right now.'}
          />
          <MetricCard
            label="Errors"
            value={errorCount.toLocaleString()}
            detail={errorCount > 0 ? 'Investigate failed runs in the timeline.' : 'No failures recorded in this session.'}
          />
          <MetricCard
            label="Last Tokens"
            value={lastUsage ? lastUsage.totalTokens.toLocaleString() : '--'}
            detail={lastUsage ? 'Total tokens from the last completed response.' : 'Token usage appears after a completed response.'}
          />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1.65fr)_330px]">
        <section className="flex min-h-0 flex-col border-b border-black/6 xl:border-b-0 xl:border-r dark:border-white/6">
          <div className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38 dark:text-white/35">
                Event Timeline
              </p>
              <p className="mt-1 text-[12px] text-black/45 dark:text-white/40">
                Newest entries appear first.
              </p>
            </div>
            <span className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-medium text-black/55 dark:bg-white/8 dark:text-white/55">
              {isStreaming ? 'Streaming' : 'Standby'}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
            {visibleEntries.length === 0 ? (
              <div className="flex h-full min-h-[340px] items-center justify-center">
                <div className="max-w-[360px] rounded-[30px] border border-white/45 bg-white/68 px-8 py-10 text-center shadow-[0_30px_60px_-36px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.05]">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,rgba(56,189,248,0.18),rgba(251,191,36,0.18))] text-[11px] font-semibold uppercase tracking-[0.24em] text-black/55 dark:text-white/55">
                    Idle
                  </div>
                  <h3 className="mt-5 text-[20px] font-semibold tracking-tight text-black dark:text-white">
                    No activity yet
                  </h3>
                  <p className="mt-3 text-[13px] leading-6 text-black/48 dark:text-white/42">
                    Open Messages and send a prompt. Thinking, tool runs, token summaries, and
                    errors will start flowing into this monitor in real time.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pb-2">
                {visibleEntries.map((entry) => (
                  <ActivityRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="min-h-0 overflow-auto px-5 py-5">
          <div className="space-y-4">
            <section className="rounded-[26px] border border-white/45 bg-white/65 p-4 shadow-[0_22px_48px_-34px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.05]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38 dark:text-white/35">
                Live State
              </p>
              <div className="mt-3 divide-y divide-black/6 dark:divide-white/6">
                <DetailRow label="Backend" value={backendName} />
                <DetailRow label="Connection" value={backendStatus} />
                <DetailRow label="Session" value={formatSessionId(sessionId)} />
                <DetailRow label="Active tool" value={activeTool ?? 'None'} />
                <DetailRow label="Last event" value={formatClock(lastEventAt)} />
              </div>
            </section>

            <section className="rounded-[26px] border border-white/45 bg-white/65 p-4 shadow-[0_22px_48px_-34px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.05]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38 dark:text-white/35">
                System Specs
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <SpecMetric
                  label="CPU"
                  value={cpuValue}
                  note={
                    systemStatus?.cpu?.cores != null ? `${systemStatus.cpu.cores} cores` : undefined
                  }
                />
                <SpecMetric
                  label="RAM"
                  value={ramValue}
                  note={
                    systemStatus?.memory?.total_gb != null
                      ? `${systemStatus.memory.used_gb?.toFixed(1) ?? '—'} / ${systemStatus.memory.total_gb.toFixed(1)} GB`
                      : undefined
                  }
                />
                <SpecMetric
                  label="Disk"
                  value={diskValue}
                  note={
                    systemStatus?.disk?.total_gb != null
                      ? `${systemStatus.disk.used_gb?.toFixed(0) ?? '—'} / ${systemStatus.disk.total_gb.toFixed(0)} GB`
                      : undefined
                  }
                />
                <SpecMetric
                  label="Bat"
                  value={batteryValue}
                  note={systemStatus?.battery?.power_plugged ? 'Charging' : undefined}
                />
              </div>
              <div className="mt-4 space-y-1 text-center">
                <p className="text-[11px] font-mono text-black/38 dark:text-white/34">
                  v{backendVersion?.version ?? '—'}
                  {systemStatus?.label ? ` · ${systemStatus.label}` : ''}
                </p>
                {systemStatus?.uptime ? (
                  <p className="text-[10px] text-black/32 dark:text-white/28">
                    Uptime {systemStatus.uptime}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void openExternal('https://github.com/pocketpaw/pocketpaw/releases')}
                  className="text-[10px] text-black/35 underline decoration-black/20 underline-offset-2 transition-colors hover:text-black/60 dark:text-white/32 dark:decoration-white/18 dark:hover:text-white/60"
                >
                  Release notes
                </button>
              </div>
            </section>

            <section className="rounded-[26px] border border-white/45 bg-white/65 p-4 shadow-[0_22px_48px_-34px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.05]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38 dark:text-white/35">
                Token Snapshot
              </p>
              {lastUsage ? (
                <div className="mt-3 divide-y divide-black/6 dark:divide-white/6">
                  <DetailRow label="Input" value={lastUsage.inputTokens.toLocaleString()} />
                  <DetailRow label="Output" value={lastUsage.outputTokens.toLocaleString()} />
                  <DetailRow label="Total" value={lastUsage.totalTokens.toLocaleString()} />
                </div>
              ) : (
                <p className="mt-3 text-[12px] leading-6 text-black/48 dark:text-white/42">
                  No completed response has reported usage yet.
                </p>
              )}
            </section>

            <section className="rounded-[26px] border border-white/45 bg-white/65 p-4 shadow-[0_22px_48px_-34px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.05]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38 dark:text-white/35">
                Legend
              </p>
              <div className="mt-2 divide-y divide-black/6 dark:divide-white/6">
                <LegendRow
                  label="Thinking"
                  tone="info"
                  description="Model reasoning updates emitted mid-run."
                />
                <LegendRow
                  label="Tool"
                  tone="warning"
                  description="A tool call started and is waiting for output."
                />
                <LegendRow
                  label="Result"
                  tone="success"
                  description="A tool completed or the run ended successfully."
                />
                <LegendRow
                  label="Error"
                  tone="error"
                  description="The backend returned an error or the run failed."
                />
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
