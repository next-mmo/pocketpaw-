import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAntiBrowserStore } from '../store';
import { antiBrowserApi, type ActivityEvent, type Profile } from '../api';

const OS_ICONS: Record<string, string> = { windows: '🪟', macos: '🍎', linux: '🐧' };
const AVATAR_GRADIENTS = [
  'from-indigo-500 to-purple-600', 'from-pink-500 to-rose-500', 'from-cyan-400 to-blue-500',
  'from-emerald-400 to-teal-500', 'from-orange-400 to-amber-500', 'from-violet-400 to-fuchsia-500',
];
const PROVIDERS = [
  { key: 'playwright', name: 'Playwright', icon: '🎭' },
  { key: 'puppeteer', name: 'Puppeteer', icon: '🤖' },
  { key: 'camoufox', name: 'Camoufox', icon: '🦊' },
  { key: 'cheerio', name: 'Cheerio', icon: '🍜' },
  { key: 'http', name: 'HTTP', icon: '⚡' },
];

function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ProfilesPage() {
  const profiles = useAntiBrowserStore((s) => s.profiles);
  const loading = useAntiBrowserStore((s) => s.loadingProfiles);
  const fetchProfiles = useAntiBrowserStore((s) => s.fetchProfiles);
  const fetchStats = useAntiBrowserStore((s) => s.fetchStats);

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formOS, setFormOS] = useState('windows');
  const [formGroup, setFormGroup] = useState('default');
  const [creating, setCreating] = useState(false);
  const [detailProfile, setDetailProfile] = useState<Profile | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  const filtered = useMemo(() => {
    if (!search) return profiles;
    const q = search.toLowerCase();
    return profiles.filter((p) =>
      p.name?.toLowerCase().includes(q) || p.id?.toLowerCase().includes(q) || p.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [profiles, search]);

  const refresh = useCallback(() => { void fetchProfiles(); void fetchStats(); }, [fetchProfiles, fetchStats]);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setCreating(true);
    try {
      await antiBrowserApi.createProfile({ name: formName, group: formGroup, os_type: formOS as Profile['os_type'] });
      setFormOpen(false);
      setFormName('');
      refresh();
    } catch (e) { console.error(e); } finally { setCreating(false); }
  };

  const handleLaunch = async (id: string) => {
    setLaunchingId(id);
    try { await antiBrowserApi.launchProfile(id); refresh(); } catch (e) { console.error(e); } finally { setLaunchingId(null); }
  };
  const handleStop = async (id: string) => {
    try { await antiBrowserApi.stopProfile(id); refresh(); } catch (e) { console.error(e); }
  };
  const handleDelete = async (id: string) => {
    try { await antiBrowserApi.deleteProfile(id); if (detailProfile?.id === id) setDetailProfile(null); refresh(); } catch (e) { console.error(e); }
  };
  const handleRegen = async (id: string) => {
    try { await antiBrowserApi.regenerateFingerprint(id); refresh(); } catch (e) { console.error(e); }
  };

  const openDetail = useCallback(async (p: Profile) => {
    setDetailProfile(p);
    try { const data = await antiBrowserApi.getProfileActivity(p.id, 30); setActivity(data.events || []); } catch { setActivity([]); }
  }, []);

  const providerOf = (key: string) => PROVIDERS.find((p) => p.key === key) || PROVIDERS[0];

  return (
    <TooltipProvider>
      <div className="flex flex-1 overflow-hidden">
        {/* Main list */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 border-b px-5 py-3 shrink-0">
            <div className="flex-1">
              <h2 className="text-base font-semibold">Browser Profiles</h2>
              <p className="text-xs text-muted-foreground">{profiles.length} profiles · {profiles.filter((p) => p.status === 'running').length} active</p>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-40 rounded-md border bg-transparent px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
            <Button size="sm" onClick={() => setFormOpen(true)}>+ New Profile</Button>
          </div>

          {/* Loading / Empty */}
          {loading && profiles.length === 0 && (
            <div className="flex flex-1 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
          )}
          {!loading && profiles.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
              <span className="text-4xl">🛡️</span>
              <p className="text-sm">No profiles yet</p>
              <Button onClick={() => setFormOpen(true)}>Create First Profile</Button>
            </div>
          )}

          {/* Table */}
          {filtered.length > 0 && (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 border-b bg-background">
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-2.5 font-medium">Profile</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">OS</th>
                    <th className="px-3 py-2.5 font-medium">Provider</th>
                    <th className="px-3 py-2.5 font-medium">Group</th>
                    <th className="px-3 py-2.5 font-medium">Tags</th>
                    <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, idx) => {
                    const prov = providerOf(p.crawler_type);
                    const isRunning = p.status === 'running';
                    return (
                      <tr key={p.id} className="border-b border-border/30 hover:bg-accent/20 cursor-pointer transition-colors" onClick={() => openDetail(p)}>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br ${AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length]} text-xs font-bold text-white shrink-0`}>
                              {p.name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <div className="font-medium text-sm">{p.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{p.id.slice(0, 12)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${isRunning ? 'bg-green-500/15 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-muted-foreground/40'}`} />
                            {isRunning ? 'Running' : 'Stopped'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">{OS_ICONS[p.os_type] || '🪟'} {p.os_type}</td>
                        <td className="px-3 py-2.5">{prov.icon} {prov.name}</td>
                        <td className="px-3 py-2.5">
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{p.group || 'default'}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          {p.tags?.length > 0
                            ? p.tags.slice(0, 2).map((t) => <span key={t} className="mr-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">{t}</span>)
                            : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {isRunning ? (
                              <Button variant="ghost" size="xs" onClick={() => handleStop(p.id)}>⏸ Stop</Button>
                            ) : (
                              <Button variant="ghost" size="xs" disabled={launchingId === p.id} onClick={() => handleLaunch(p.id)}>
                                {launchingId === p.id ? '…' : '▶ Launch'}
                              </Button>
                            )}
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-xs" onClick={() => handleRegen(p.id)}>🔄</Button></TooltipTrigger><TooltipContent>Regenerate fingerprint</TooltipContent></Tooltip>
                            <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={() => handleDelete(p.id)}>✕</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail sidebar */}
        {detailProfile && (
          <div className="flex w-72 shrink-0 flex-col border-l overflow-auto bg-card/50">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Details</span>
              <Button variant="ghost" size="icon-xs" onClick={() => setDetailProfile(null)}>✕</Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 text-lg font-bold text-white">
                  {detailProfile.name?.[0]?.toUpperCase()}
                </div>
                <div className="text-sm font-semibold">{detailProfile.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{detailProfile.id}</div>
              </div>
              <div className="space-y-1.5 text-xs">
                {([
                  ['Status', detailProfile.status === 'running' ? '🟢 Running' : '⏸ Stopped'],
                  ['OS', `${OS_ICONS[detailProfile.os_type]} ${detailProfile.os_type}`],
                  ['Provider', `${providerOf(detailProfile.crawler_type).icon} ${providerOf(detailProfile.crawler_type).name}`],
                  ['Group', detailProfile.group || 'default'],
                  ['Headless', detailProfile.headless ? 'Yes' : 'No'],
                ] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between rounded-md border px-3 py-1.5">
                    <span className="text-muted-foreground">{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Activity</div>
                {activity.length === 0
                  ? <p className="py-3 text-center text-xs text-muted-foreground">No activity yet</p>
                  : <div className="max-h-48 space-y-1 overflow-auto">
                      {activity.map((ev) => (
                        <div key={ev.id} className="border-b border-border/30 py-1.5">
                          <div className="text-[11px]">{ev.message}</div>
                          <div className="text-[10px] text-muted-foreground">{timeAgo(ev.timestamp)}</div>
                        </div>
                      ))}
                    </div>}
              </div>
            </div>
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New Browser Profile</DialogTitle>
              <DialogDescription>Create an isolated browser identity with a unique fingerprint.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Name</label>
                <input
                  autoFocus type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                  placeholder="My profile"
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-muted-foreground">OS</label>
                  <select value={formOS} onChange={(e) => setFormOS(e.target.value)} className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none">
                    <option value="windows">Windows</option>
                    <option value="macos">macOS</option>
                    <option value="linux">Linux</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-muted-foreground">Group</label>
                  <input type="text" value={formGroup} onChange={(e) => setFormGroup(e.target.value)} className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button disabled={creating || !formName.trim()} onClick={handleCreate}>{creating ? 'Creating…' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
