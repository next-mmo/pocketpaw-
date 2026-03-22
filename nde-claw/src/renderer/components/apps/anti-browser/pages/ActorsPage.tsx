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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { antiBrowserApi, type Actor, type ActorRun } from '../api';
import { useAntiBrowserStore } from '../store';
import {
  EmptyState,
  FIELD_CLASS,
  LoadingState,
  MetricPill,
  PageHeader,
  TEXTAREA_CLASS,
  formatDateTime,
  timeAgo,
} from './common';

const DEFAULT_SCRIPT = `// Runs inside each selected browser page.
const title = document.title;
const url = window.location.href;

return {
  title,
  url,
  timestamp: Date.now(),
};`;

function ProfilePicker({
  selectedIds,
  onChange,
  items,
}: {
  selectedIds: string[];
  onChange: (next: string[]) => void;
  items: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="max-h-44 space-y-2 overflow-auto rounded-md border border-border/60 bg-background/40 p-3">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No profiles available.</p>
      ) : (
        items.map((profile) => {
          const checked = selectedIds.includes(profile.id);
          return (
            <label
              key={profile.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/30"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange([...selectedIds, profile.id]);
                  } else {
                    onChange(selectedIds.filter((id) => id !== profile.id));
                  }
                }}
              />
              <span className="flex-1">{profile.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{profile.id}</span>
            </label>
          );
        })
      )}
    </div>
  );
}

export default function ActorsPage() {
  const actors = useAntiBrowserStore((state) => state.actors);
  const profiles = useAntiBrowserStore((state) => state.profiles);
  const loading = useAntiBrowserStore((state) => state.loadingActors);
  const fetchActors = useAntiBrowserStore((state) => state.fetchActors);
  const fetchStats = useAntiBrowserStore((state) => state.fetchStats);

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [runActor, setRunActor] = useState<Actor | null>(null);
  const [historyActor, setHistoryActor] = useState<Actor | null>(null);
  const [runs, setRuns] = useState<ActorRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formScript, setFormScript] = useState(DEFAULT_SCRIPT);
  const [formConcurrency, setFormConcurrency] = useState('5');
  const [formProfiles, setFormProfiles] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [runProfiles, setRunProfiles] = useState<string[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void fetchActors();
    void fetchStats();
  }, [fetchActors, fetchStats]);

  const openHistory = useCallback(async (actor: Actor) => {
    setHistoryActor(actor);
    setLoadingRuns(true);
    try {
      const response = await antiBrowserApi.listRuns(actor.id);
      setRuns(response.runs ?? []);
    } catch (error) {
      console.error('Failed to load actor runs:', error);
      setRuns([]);
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  const filteredActors = useMemo(() => {
    if (!search.trim()) {
      return actors;
    }

    const query = search.toLowerCase();
    return actors.filter((actor) => {
      return (
        actor.name.toLowerCase().includes(query) ||
        actor.description?.toLowerCase().includes(query) ||
        actor.id.toLowerCase().includes(query)
      );
    });
  }, [actors, search]);

  const profileOptions = useMemo(() => {
    return profiles.map((profile) => ({ id: profile.id, name: profile.name }));
  }, [profiles]);

  const handleCreate = async () => {
    if (!formName.trim()) {
      return;
    }

    setCreating(true);
    try {
      await antiBrowserApi.createActor({
        name: formName.trim(),
        description: formDescription.trim(),
        script: formScript,
        profile_ids: formProfiles,
        max_concurrency: Number(formConcurrency) || 5,
      });
      setCreateOpen(false);
      setFormName('');
      setFormDescription('');
      setFormScript(DEFAULT_SCRIPT);
      setFormConcurrency('5');
      setFormProfiles([]);
      refresh();
    } catch (error) {
      console.error('Failed to create actor:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (actorId: string) => {
    setDeletingId(actorId);
    try {
      await antiBrowserApi.deleteActor(actorId);
      if (historyActor?.id === actorId) {
        setHistoryActor(null);
        setRuns([]);
      }
      refresh();
    } catch (error) {
      console.error('Failed to delete actor:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRun = async () => {
    if (!runActor) {
      return;
    }

    setRunningId(runActor.id);
    try {
      await antiBrowserApi.runActor(runActor.id, {
        profile_ids: runProfiles.length > 0 ? runProfiles : runActor.profile_ids ?? [],
        input_data: {},
      });
      setRunActor(null);
      setRunProfiles([]);
      refresh();
      if (historyActor?.id === runActor.id) {
        void openHistory(runActor);
      }
    } catch (error) {
      console.error('Failed to run actor:', error);
    } finally {
      setRunningId(null);
    }
  };

  if (loading && actors.length === 0) {
    return <LoadingState label="Loading actors..." />;
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-auto p-6">
        <PageHeader
          title="Actors"
          description="Create, run, and monitor automation scripts across browser profiles."
          actions={
            <>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search actors..."
                className="w-44 rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              <Button onClick={() => setCreateOpen(true)}>New Actor</Button>
            </>
          }
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <MetricPill label="Actors" value={actors.length} />
          <MetricPill label="Assigned Profiles" value={actors.reduce((count, actor) => count + (actor.profile_ids?.length ?? 0), 0)} />
          <MetricPill
            label="Recent Runs"
            value={actors.reduce((count, actor) => count + (actor.total_runs ?? 0), 0)}
            tone="success"
          />
        </div>

        {filteredActors.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No actors yet"
              description="Create an actor to execute scripts across one or more browser profiles."
              action={<Button onClick={() => setCreateOpen(true)}>Create First Actor</Button>}
            />
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredActors.map((actor) => (
              <Card key={actor.id} className="border-border/60 bg-card/50 py-0">
                <CardHeader className="border-b border-border/50 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{actor.name}</CardTitle>
                      <CardDescription>{actor.description || 'No description provided.'}</CardDescription>
                    </div>
                    <div className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium">
                      {actor.max_concurrency ?? 5}x
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="rounded-md border border-border/50 bg-background/30 px-3 py-2">
                      Assigned profiles
                      <div className="mt-1 text-sm font-semibold text-foreground">{actor.profile_ids?.length ?? 0}</div>
                    </div>
                    <div className="rounded-md border border-border/50 bg-background/30 px-3 py-2">
                      Total runs
                      <div className="mt-1 text-sm font-semibold text-foreground">{actor.total_runs ?? 0}</div>
                    </div>
                  </div>

                  <div className="rounded-md border border-border/50 bg-black/20 p-3">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Script preview
                    </div>
                    <pre className="line-clamp-6 whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                      {actor.script?.trim() || '// No script saved.'}
                    </pre>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Last run: {timeAgo(actor.last_run)}</span>
                    <span className="font-mono">{actor.id}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setRunActor(actor);
                        setRunProfiles(actor.profile_ids ?? []);
                      }}
                    >
                      Run
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void openHistory(actor)}>
                      History
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={deletingId === actor.id}
                      onClick={() => void handleDelete(actor.id)}
                    >
                      {deletingId === actor.id ? 'Deleting...' : 'Delete'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {historyActor ? (
        <aside className="flex w-96 shrink-0 flex-col border-l border-border/60 bg-card/40">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">{historyActor.name}</div>
              <div className="text-xs text-muted-foreground">Run history</div>
            </div>
            <Button size="icon-xs" variant="ghost" onClick={() => setHistoryActor(null)}>
              X
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {loadingRuns ? (
              <LoadingState label="Loading runs..." />
            ) : runs.length === 0 ? (
              <EmptyState
                title="No runs yet"
                description="Start this actor to create its first execution record."
                className="py-8"
              />
            ) : (
              <div className="space-y-3">
                {runs.map((run) => (
                  <Card key={run.id} className="border-border/60 bg-card/70 py-0">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">Run {run.id}</div>
                          <div className="text-xs text-muted-foreground">{formatDateTime(run.started_at)}</div>
                        </div>
                        <div className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium uppercase">
                          {run.status}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-md border border-border/50 bg-background/30 px-2 py-2 text-muted-foreground">
                          Profiles
                          <div className="mt-1 text-sm font-semibold text-foreground">
                            {run.profile_ids?.length ?? 0}
                          </div>
                        </div>
                        <div className="rounded-md border border-border/50 bg-background/30 px-2 py-2 text-muted-foreground">
                          Results
                          <div className="mt-1 text-sm font-semibold text-foreground">
                            {run.results?.length ?? 0}
                          </div>
                        </div>
                        <div className="rounded-md border border-border/50 bg-background/30 px-2 py-2 text-muted-foreground">
                          Errors
                          <div className="mt-1 text-sm font-semibold text-foreground">
                            {run.errors?.length ?? 0}
                          </div>
                        </div>
                      </div>

                      {run.errors && run.errors.length > 0 ? (
                        <div className="space-y-2 rounded-md border border-red-500/20 bg-red-500/5 p-3">
                          {run.errors.map((error, index) => (
                            <div key={`${run.id}-${index}`} className="text-xs text-red-300">
                              [{error.profile_id}] {error.error}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="text-xs text-muted-foreground">
                        Finished: {run.finished_at ? formatDateTime(run.finished_at) : 'Still running'}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </aside>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Actor</DialogTitle>
            <DialogDescription>
              Define a reusable browser automation task and assign one or more default profiles.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  className={FIELD_CLASS}
                  placeholder="Google Maps scraper"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Max concurrency</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={formConcurrency}
                  onChange={(event) => setFormConcurrency(event.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Description</label>
              <input
                type="text"
                value={formDescription}
                onChange={(event) => setFormDescription(event.target.value)}
                className={FIELD_CLASS}
                placeholder="What this actor automates"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Assigned profiles</label>
              <ProfilePicker selectedIds={formProfiles} onChange={setFormProfiles} items={profileOptions} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Script</label>
              <textarea
                value={formScript}
                onChange={(event) => setFormScript(event.target.value)}
                className={TEXTAREA_CLASS}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={creating || !formName.trim()} onClick={() => void handleCreate()}>
              {creating ? 'Creating...' : 'Create Actor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!runActor}
        onOpenChange={(open) => {
          if (!open) {
            setRunActor(null);
            setRunProfiles([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Run Actor</DialogTitle>
            <DialogDescription>
              {runActor ? `Select profiles for "${runActor.name}".` : 'Select profiles for this actor.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
              This actor will run against the selected browser profiles with a concurrency limit of{' '}
              <span className="font-semibold text-foreground">{runActor?.max_concurrency ?? 5}</span>.
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Profiles</label>
              <ProfilePicker selectedIds={runProfiles} onChange={setRunProfiles} items={profileOptions} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRunActor(null);
                setRunProfiles([]);
              }}
            >
              Cancel
            </Button>
            <Button disabled={!runActor || runningId === runActor.id} onClick={() => void handleRun()}>
              {runActor && runningId === runActor.id ? 'Starting...' : 'Start Run'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
