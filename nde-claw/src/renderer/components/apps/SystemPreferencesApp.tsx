import type { AppId } from '@/lib/apps';
import { useVersion, useHealth, useBackends, useChannels, useSkills } from '@/hooks/usePocketPaw';
import { useConnectionStore } from '@/stores/connectionStore';

function StatusDot({ status }: { status: 'online' | 'offline' | 'connecting' | 'error' }) {
  const colorMap = {
    online: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]',
    offline: 'bg-zinc-400',
    connecting: 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.5)]',
    error: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.7)]',
  };

  return <span className={`inline-block h-[10px] w-[10px] rounded-full ${colorMap[status]}`} />;
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-3">
      <span className="text-[11px] font-bold uppercase tracking-[1.8px] text-black/45 dark:text-white/45">
        {label}
      </span>
      <h3 className="mt-0.5 text-[17px] font-semibold text-black dark:text-white">{title}</h3>
    </div>
  );
}

function GlassPanel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[20px] border border-white/35 bg-white/65 p-4 shadow-lg shadow-black/8 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06] ${className}`}
    >
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[13px] text-black/65 dark:text-white/60">{label}</span>
      <span className="text-[13px] font-medium text-black dark:text-white">{value}</span>
    </div>
  );
}

export default function SystemPreferencesApp(_props: { appId: AppId }) {
  const backendStatus = useConnectionStore((s) => s.backendStatus);
  const { data: version, isLoading: versionLoading } = useVersion();
  const { data: health } = useHealth();
  const { data: backends } = useBackends();
  const { data: channels } = useChannels();
  const { data: skills } = useSkills();

  const availableBackends = Array.isArray(backends) ? backends.filter((b) => b.available) : [];
  const channelList = Array.isArray(channels) ? channels : [];
  const runningChannels = channelList.filter((c) => c.running);
  const configuredChannels = channelList.filter((c) => c.configured);

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Hero */}
      <div className="border-b border-black/8 bg-gradient-to-b from-white/50 to-transparent px-6 pb-5 pt-5 dark:border-white/5 dark:from-white/[0.03]">
        <div className="flex items-center gap-3">
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-gradient-to-br from-blue-500 to-purple-600 text-[22px] text-white shadow-lg shadow-blue-500/20">
            🐾
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[20px] font-bold text-black dark:text-white">PocketPaw</h2>
              <StatusDot status={backendStatus} />
            </div>
            <p className="text-[13px] text-black/55 dark:text-white/55">
              {versionLoading
                ? 'Connecting…'
                : version
                  ? `v${version.version} · ${version.agent_backend}`
                  : 'Backend offline'}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* System Status */}
          <GlassPanel>
            <SectionHeader label="System" title="Health Status" />
            <div className="divide-y divide-black/6 dark:divide-white/6">
              <StatRow
                label="Status"
                value={
                  <span className="flex items-center gap-1.5">
                    <StatusDot status={backendStatus} />
                    <span className="capitalize">{backendStatus}</span>
                  </span>
                }
              />
              <StatRow
                label="Health"
                value={
                  <span
                    className={
                      health?.status === 'healthy'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }
                  >
                    {health?.status ?? '—'}
                  </span>
                }
              />
              <StatRow label="Backend" value={version?.agent_backend ?? '—'} />
              <StatRow label="Python" value={version?.python?.split(' ')[0] ?? '—'} />
            </div>
          </GlassPanel>

          {/* Agent Backends */}
          <GlassPanel>
            <SectionHeader label="AI" title="Agent Backends" />
            {backends ? (
              <div className="space-y-2">
                {backends.map((b) => (
                  <div
                    key={b.name}
                    className="flex items-center justify-between rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${b.available ? 'bg-emerald-400' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                      />
                      <span className="text-[13px] font-medium text-black dark:text-white">
                        {b.displayName}
                      </span>
                      {b.beta && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          BETA
                        </span>
                      )}
                    </div>
                    <span className="text-[12px] text-black/50 dark:text-white/40">
                      {b.capabilities.join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-black/50 dark:text-white/50">Loading…</p>
            )}
          </GlassPanel>

          {/* Channels */}
          <GlassPanel>
            <SectionHeader label="Communication" title="Channels" />
            {channelList.length > 0 ? (
              <div className="space-y-2">
                {channelList.map((ch) => (
                  <div
                    key={ch.channel}
                    className="flex items-center justify-between rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]"
                  >
                    <div className="flex items-center gap-2">
                      <StatusDot status={ch.running ? 'online' : ch.configured ? 'offline' : 'error'} />
                      <span className="text-[13px] font-medium text-black dark:text-white">
                        {ch.display_name}
                      </span>
                    </div>
                    <span className="text-[12px] text-black/45 dark:text-white/40">
                      {ch.running ? 'Active' : ch.configured ? 'Stopped' : 'Not configured'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-black/50 dark:text-white/50">Loading…</p>
            )}
            <div className="mt-3 flex items-center gap-3">
              <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-semibold text-black/55 dark:bg-white/[0.06] dark:text-white/50">
                {runningChannels.length} active
              </span>
              <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-semibold text-black/55 dark:bg-white/[0.06] dark:text-white/50">
                {configuredChannels.length} configured
              </span>
            </div>
          </GlassPanel>

          {/* Skills */}
          <GlassPanel>
            <SectionHeader label="Capabilities" title="Installed Skills" />
            {skills ? (
              <div className="max-h-[200px] space-y-1.5 overflow-auto">
                {skills.slice(0, 12).map((skill) => (
                  <div
                    key={skill.name}
                    className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]"
                  >
                    <span className="block text-[13px] font-medium text-black dark:text-white">
                      {skill.name}
                    </span>
                    <span className="line-clamp-1 text-[12px] text-black/50 dark:text-white/45">
                      {skill.description}
                    </span>
                  </div>
                ))}
                {skills.length > 12 && (
                  <p className="px-1 text-[12px] text-black/40 dark:text-white/35">
                    +{skills.length - 12} more skills
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-black/50 dark:text-white/50">Loading…</p>
            )}
            <div className="mt-3">
              <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-semibold text-black/55 dark:bg-white/[0.06] dark:text-white/50">
                {skills?.length ?? 0} skills loaded
              </span>
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
