import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { antiBrowserApi, type ActivityEvent } from '../api';
import { useAntiBrowserStore } from '../store';
import {
  EmptyState,
  FIELD_CLASS,
  LoadingState,
  MetricPill,
  PageHeader,
  SELECT_CLASS,
  formatDateTime,
  timeAgo,
} from './common';

const PAGE_SIZE = 50;

export default function ActivityPage() {
  const profiles = useAntiBrowserStore((state) => state.profiles);

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [profileFilter, setProfileFilter] = useState('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const response = await antiBrowserApi.listActivity({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        profile_id: profileFilter || undefined,
      });
      setEvents(response.events ?? []);
      setTotal(response.total ?? 0);
    } catch (error) {
      console.error('Failed to load activity:', error);
      setEvents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, profileFilter, typeFilter]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadActivity();
    }, 10_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadActivity]);

  const visibleEvents = useMemo(() => {
    if (!search.trim()) {
      return events;
    }

    const query = search.toLowerCase();
    return events.filter((event) => {
      return (
        event.message.toLowerCase().includes(query) ||
        event.type.toLowerCase().includes(query) ||
        event.resource?.toLowerCase().includes(query) ||
        event.profile_id?.toLowerCase().includes(query)
      );
    });
  }, [events, search]);

  const eventTypes = useMemo(() => {
    return ['all', ...Array.from(new Set(events.map((event) => event.type)))];
  }, [events]);

  const badgeSummary = useMemo(() => {
    return visibleEvents.reduce<Record<string, number>>((summary, event) => {
      const key = event.type;
      summary[key] = (summary[key] ?? 0) + 1;
      return summary;
    }, {});
  }, [visibleEvents]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadActivity();
    setRefreshing(false);
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await antiBrowserApi.clearActivity(profileFilter || undefined);
      await loadActivity();
    } catch (error) {
      console.error('Failed to clear activity:', error);
    } finally {
      setClearing(false);
    }
  };

  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading && events.length === 0) {
    return <LoadingState label="Loading activity..." />;
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto p-6">
      <PageHeader
        title="Activity"
        description="Review profile launches, proxy checks, actor runs, and other operational events."
        actions={
          <>
            <Button variant="outline" disabled={refreshing} onClick={() => void handleRefresh()}>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button variant="outline" disabled={clearing || total === 0} onClick={() => void handleClear()}>
              {clearing ? 'Clearing...' : 'Clear'}
            </Button>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <MetricPill label="Total" value={total} />
        <MetricPill label="Visible" value={visibleEvents.length} />
        <MetricPill label="Profile filter" value={profileFilter || 'All'} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search activity..."
          className={`${FIELD_CLASS} lg:col-span-2`}
        />
        <select
          value={typeFilter}
          onChange={(event) => {
            setTypeFilter(event.target.value);
            setPage(1);
          }}
          className={SELECT_CLASS}
        >
          {eventTypes.map((eventType) => (
            <option key={eventType} value={eventType}>
              {eventType === 'all' ? 'All event types' : eventType}
            </option>
          ))}
        </select>
        <select
          value={profileFilter}
          onChange={(event) => {
            setProfileFilter(event.target.value);
            setPage(1);
          }}
          className={SELECT_CLASS}
        >
          <option value="">All profiles</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </div>

      {Object.keys(badgeSummary).length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(badgeSummary).map(([type, count]) => (
            <div
              key={type}
              className="rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs text-muted-foreground"
            >
              {type}
              <span className="ml-1 font-semibold text-foreground">{count}</span>
            </div>
          ))}
        </div>
      ) : null}

      {visibleEvents.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No activity found"
            description="Adjust the filters or wait for new activity to be recorded."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {visibleEvents.map((event) => {
            const profileName = profiles.find((profile) => profile.id === event.profile_id)?.name;

            return (
              <Card key={`${event.id}`} className="border-border/60 bg-card/50 py-0">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{event.message}</div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5">
                          {event.type}
                        </span>
                        {profileName ? (
                          <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5">
                            {profileName}
                          </span>
                        ) : null}
                        {event.resource ? (
                          <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5">
                            {event.resource}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>{timeAgo(event.timestamp)}</div>
                      <div>{formatDateTime(event.timestamp)}</div>
                    </div>
                  </div>

                  {event.meta && Object.keys(event.meta).length > 0 ? (
                    <pre className="overflow-auto rounded-md border border-border/50 bg-black/20 p-3 font-mono text-[11px] text-muted-foreground">
                      {JSON.stringify(event.meta, null, 2)}
                    </pre>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {total > PAGE_SIZE ? (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {maxPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= maxPage}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
