import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { antiBrowserApi, type ProxyStatus, type ProxyType } from '../api';
import { useAntiBrowserStore } from '../store';
import {
  DIALOG_CLASS,
  EmptyState,
  FIELD_CLASS,
  GLASS_CARD_CLASS,
  INFO_TILE_CLASS,
  LoadingState,
  MetricPill,
  PAGE_WRAP_CLASS,
  PageHeader,
  SELECT_CLASS,
} from './common';

const STATUS_STYLES: Record<ProxyStatus, string> = {
  alive: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300',
  dead: 'border-rose-400/25 bg-rose-400/10 text-rose-700 dark:text-rose-300',
  unchecked: 'border-black/[0.06] bg-white/72 text-black/56 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/58',
};

export default function ProxiesPage() {
  const proxies = useAntiBrowserStore((state) => state.proxies);
  const loading = useAntiBrowserStore((state) => state.loadingProxies);
  const fetchProxies = useAntiBrowserStore((state) => state.fetchProxies);
  const fetchStats = useAntiBrowserStore((state) => state.fetchStats);

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [type, setType] = useState<ProxyType>('http');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('8080');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const refresh = useCallback(() => {
    void fetchProxies();
    void fetchStats();
  }, [fetchProxies, fetchStats]);

  const filteredProxies = useMemo(() => {
    if (!search.trim()) {
      return proxies;
    }

    const query = search.toLowerCase();
    return proxies.filter((proxy) => {
      return (
        proxy.host.toLowerCase().includes(query) ||
        proxy.id.toLowerCase().includes(query) ||
        proxy.country?.toLowerCase().includes(query)
      );
    });
  }, [proxies, search]);

  const aliveCount = proxies.filter((proxy) => proxy.status === 'alive').length;
  const deadCount = proxies.filter((proxy) => proxy.status === 'dead').length;

  const handleCreate = async () => {
    if (!host.trim()) {
      return;
    }

    setCreating(true);
    try {
      await antiBrowserApi.addProxy({
        type,
        host: host.trim(),
        port: Number(port) || 8080,
        username: username.trim() || undefined,
        password: password.trim() || undefined,
      });
      setDialogOpen(false);
      setHost('');
      setPort('8080');
      setUsername('');
      setPassword('');
      setType('http');
      refresh();
    } catch (error) {
      console.error('Failed to create proxy:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (proxyId: string) => {
    setDeletingId(proxyId);
    try {
      await antiBrowserApi.deleteProxy(proxyId);
      refresh();
    } catch (error) {
      console.error('Failed to delete proxy:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCheckAll = async () => {
    setCheckingAll(true);
    try {
      await antiBrowserApi.checkProxies();
      refresh();
    } catch (error) {
      console.error('Failed to check proxies:', error);
    } finally {
      setCheckingAll(false);
    }
  };

  if (loading && proxies.length === 0) {
    return <LoadingState label="Loading proxies..." />;
  }

  return (
    <div className={PAGE_WRAP_CLASS}>
      <PageHeader
        title="Proxies"
        description="Track health, latency, and credentials for the routes feeding browser profiles and actor runs."
        actions={
          <>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search proxies..."
              className={`${FIELD_CLASS} w-[220px]`}
            />
            <Button
              variant="outline"
              className="rounded-full border-white/45 bg-white/72 dark:bg-white/[0.06]"
              disabled={checkingAll || proxies.length === 0}
              onClick={() => void handleCheckAll()}
            >
              {checkingAll ? 'Checking...' : 'Check All'}
            </Button>
            <Button
              className="rounded-full bg-black/82 px-4 text-white hover:bg-black/72 dark:bg-white dark:text-black dark:hover:bg-white/90"
              onClick={() => setDialogOpen(true)}
            >
              Add Proxy
            </Button>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <MetricPill label="Total" value={proxies.length} />
        <MetricPill label="Alive" value={aliveCount} tone="success" />
        <MetricPill label="Dead" value={deadCount} tone="danger" />
      </div>

      {filteredProxies.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No proxies configured"
            description="Add HTTP or SOCKS5 endpoints, check them, and assign only healthy routes to active browser sessions."
            action={
              <Button
                className="rounded-full bg-black/82 px-4 text-white hover:bg-black/72 dark:bg-white dark:text-black dark:hover:bg-white/90"
                onClick={() => setDialogOpen(true)}
              >
                Add First Proxy
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {filteredProxies.map((proxy) => {
            const status = proxy.status ?? 'unchecked';

            return (
              <div key={proxy.id} className={`${GLASS_CARD_CLASS} overflow-hidden p-0`}>
                <div className="flex flex-col gap-4 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-[18px] font-semibold tracking-[-0.03em] text-black dark:text-white">
                        {proxy.host}:{proxy.port}
                      </div>
                      <div
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${STATUS_STYLES[status]}`}
                      >
                        {status}
                      </div>
                    </div>
                    <div className="mt-1 text-[14px] text-black/52 dark:text-white/48">
                      {proxy.type.toUpperCase()} {proxy.username ? `with auth as ${proxy.username}` : 'without authentication'}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    className="rounded-full text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
                    disabled={deletingId === proxy.id}
                    onClick={() => void handleDelete(proxy.id)}
                  >
                    {deletingId === proxy.id ? 'Removing...' : 'Remove'}
                  </Button>
                </div>

                <div className="border-t border-black/[0.06] px-5 py-4 dark:border-white/8">
                  <div className="grid gap-3 lg:grid-cols-4">
                    <div className={INFO_TILE_CLASS}>
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/36 dark:text-white/34">
                        Country
                      </div>
                      <div className="mt-2 text-[14px] font-medium text-black/74 dark:text-white/72">
                        {proxy.country || 'Unknown'}
                      </div>
                    </div>
                    <div className={INFO_TILE_CLASS}>
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/36 dark:text-white/34">
                        Latency
                      </div>
                      <div className="mt-2 text-[14px] font-medium text-black/74 dark:text-white/72">
                        {proxy.latency_ms != null ? `${proxy.latency_ms} ms` : 'N/A'}
                      </div>
                    </div>
                    <div className={INFO_TILE_CLASS}>
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/36 dark:text-white/34">
                        Type
                      </div>
                      <div className="mt-2 text-[14px] font-medium text-black/74 dark:text-white/72">
                        {proxy.type.toUpperCase()}
                      </div>
                    </div>
                    <div className={INFO_TILE_CLASS}>
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/36 dark:text-white/34">
                        Proxy ID
                      </div>
                      <div className="mt-2 font-mono text-[12px] text-black/72 dark:text-white/72">
                        {proxy.id}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={`${DIALOG_CLASS} sm:max-w-lg`}>
          <DialogHeader>
            <DialogTitle>Add Proxy</DialogTitle>
            <DialogDescription>Save a proxy endpoint for stealth sessions and actor execution.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-black/46 dark:text-white/46">Type</label>
              <select value={type} onChange={(event) => setType(event.target.value as ProxyType)} className={SELECT_CLASS}>
                <option value="http">HTTP</option>
                <option value="socks5">SOCKS5</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-black/46 dark:text-white/46">Port</label>
              <input
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(event) => setPort(event.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs text-black/46 dark:text-white/46">Host</label>
              <input
                type="text"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                className={FIELD_CLASS}
                placeholder="proxy.example.com"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-black/46 dark:text-white/46">Username</label>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className={FIELD_CLASS}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-black/46 dark:text-white/46">Password</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={FIELD_CLASS}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full border-white/45 bg-white/72 dark:bg-white/[0.06]"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-full bg-black/82 text-white hover:bg-black/72 dark:bg-white dark:text-black dark:hover:bg-white/90"
              disabled={creating || !host.trim()}
              onClick={() => void handleCreate()}
            >
              {creating ? 'Adding...' : 'Add Proxy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
