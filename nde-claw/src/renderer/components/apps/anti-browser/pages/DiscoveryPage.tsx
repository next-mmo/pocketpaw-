import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { antiBrowserApi, type CrawleeStatus, type StoreActor } from '../api';
import { useAntiBrowserStore } from '../store';
import {
  EmptyState,
  FIELD_CLASS,
  LoadingState,
  MetricPill,
  PageHeader,
  SELECT_CLASS,
} from './common';

const STORE_LIMIT = 24;
const CATEGORY_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'social-media', label: 'Social Media' },
  { key: 'e-commerce', label: 'E-commerce' },
  { key: 'seo', label: 'SEO' },
  { key: 'lead-gen', label: 'Lead Gen' },
  { key: 'ai-agents', label: 'AI & ML' },
  { key: 'scraping', label: 'Scraping' },
  { key: 'data', label: 'Data' },
  { key: 'automation', label: 'Automation' },
];

const BUILTIN_TEMPLATES: StoreActor[] = [
  {
    id: 'google-maps-scraper',
    name: 'Google Maps Scraper',
    slug: 'anti-browser/google-maps-scraper',
    author: 'Anti-Browser',
    description:
      'Extract business locations, reviews, contact details, and opening hours from Google Maps.',
    category: 'scraping',
    icon: 'GM',
    color: '#4285f4',
    runs: '304K',
    rating: 4.7,
    reviews: 967,
    tags: ['maps', 'reviews', 'locations'],
    featured: true,
    source: 'builtin',
  },
  {
    id: 'website-content-crawler',
    name: 'Website Content Crawler',
    slug: 'anti-browser/website-content-crawler',
    author: 'Anti-Browser',
    description:
      'Crawl websites with Crawlee and extract content for RAG pipelines, vector stores, or LLM ingestion.',
    category: 'ai-agents',
    icon: 'WC',
    color: '#764ba2',
    runs: '107K',
    rating: 4.3,
    reviews: 174,
    tags: ['crawler', 'content', 'rag', 'llm'],
    featured: true,
    source: 'builtin',
  },
  {
    id: 'instagram-scraper',
    name: 'Instagram Scraper',
    slug: 'anti-browser/instagram-scraper',
    author: 'Anti-Browser',
    description:
      'Collect posts, reels, comments, media URLs, and engagement metrics from Instagram profiles.',
    category: 'social-media',
    icon: 'IG',
    color: '#e1306c',
    runs: '195K',
    rating: 4.7,
    reviews: 317,
    tags: ['instagram', 'social', 'reels'],
    featured: true,
    source: 'builtin',
  },
  {
    id: 'linkedin-scraper',
    name: 'LinkedIn Profile Scraper',
    slug: 'anti-browser/linkedin-scraper',
    author: 'Anti-Browser',
    description:
      'Extract profile details, company information, and lead-generation fields from LinkedIn.',
    category: 'lead-gen',
    icon: 'LI',
    color: '#0a66c2',
    runs: '28K',
    rating: 4.5,
    reviews: 89,
    tags: ['linkedin', 'leads', 'b2b'],
    featured: true,
    source: 'builtin',
  },
  {
    id: 'seo-audit',
    name: 'SEO Audit Tool',
    slug: 'anti-browser/seo-audit',
    author: 'Anti-Browser',
    description:
      'Inspect headings, meta tags, images, links, and page structure for a quick SEO review.',
    category: 'seo',
    icon: 'SEO',
    color: '#34d399',
    runs: '12K',
    rating: 4.6,
    reviews: 52,
    tags: ['seo', 'audit', 'metadata'],
    source: 'builtin',
  },
];

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
    <div className="max-h-40 space-y-2 overflow-auto rounded-md border border-border/60 bg-background/40 p-3">
      {items.map((profile) => {
        const checked = selectedIds.includes(profile.id);
        return (
          <label key={profile.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/30">
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
      })}
    </div>
  );
}

function normalizeActor(actor: StoreActor, fallbackSource: 'apify' | 'builtin'): StoreActor {
  return {
    ...actor,
    source: actor.source ?? fallbackSource,
    icon: actor.icon ?? actor.name.slice(0, 2).toUpperCase(),
    color: actor.color ?? '#667eea',
    tags: actor.tags ?? [],
    runs: actor.runs ?? '0',
    rating: actor.rating ?? 0,
    reviews: actor.reviews ?? 0,
  };
}

export default function DiscoveryPage() {
  const profiles = useAntiBrowserStore((state) => state.profiles);
  const fetchActors = useAntiBrowserStore((state) => state.fetchActors);
  const fetchStats = useAntiBrowserStore((state) => state.fetchStats);

  const [mode, setMode] = useState<'templates' | 'store'>('templates');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy] = useState('popularity');
  const [storeActors, setStoreActors] = useState<StoreActor[]>([]);
  const [storeTotal, setStoreTotal] = useState(0);
  const [storeOffset, setStoreOffset] = useState(0);
  const [storeHasMore, setStoreHasMore] = useState(false);
  const [storeLoading, setStoreLoading] = useState(false);
  const [crawlee, setCrawlee] = useState<CrawleeStatus | null>(null);

  const [detailActor, setDetailActor] = useState<StoreActor | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);

  const refreshStore = useCallback(
    async (reset: boolean) => {
      setStoreLoading(true);
      try {
        const offset = reset ? 0 : storeOffset;
        const response = await antiBrowserApi.storeListActors({
          search: search.trim() || undefined,
          category: category !== 'all' ? category : undefined,
          limit: STORE_LIMIT,
          offset,
          sort_by: sortBy,
        });

        const actors = (response.actors ?? []).map((actor) => normalizeActor(actor, 'apify'));
        setStoreActors((current) => (reset ? actors : [...current, ...actors]));
        setStoreTotal(response.total ?? 0);
        setStoreHasMore(response.has_more ?? false);
        setStoreOffset(offset + STORE_LIMIT);
      } catch (error) {
        console.error('Failed to fetch actor store:', error);
        if (reset) {
          setStoreActors([]);
          setStoreTotal(0);
          setStoreHasMore(false);
          setStoreOffset(0);
        }
      } finally {
        setStoreLoading(false);
      }
    },
    [category, search, sortBy, storeOffset],
  );

  useEffect(() => {
    void antiBrowserApi.crawleeStatus()
      .then((response) => setCrawlee(response))
      .catch((error) => {
        console.error('Failed to load Crawlee status:', error);
        setCrawlee(null);
      });
  }, []);

  useEffect(() => {
    if (mode !== 'store') {
      return;
    }

    const timerId = window.setTimeout(() => {
      setStoreOffset(0);
      void refreshStore(true);
    }, 250);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [category, mode, refreshStore, search, sortBy]);

  const visibleBuiltin = useMemo(() => {
    return BUILTIN_TEMPLATES.filter((actor) => {
      if (category !== 'all' && actor.category !== category) {
        return false;
      }
      if (!search.trim()) {
        return true;
      }

      const query = search.toLowerCase();
      return (
        actor.name.toLowerCase().includes(query) ||
        actor.description.toLowerCase().includes(query) ||
        actor.author.toLowerCase().includes(query) ||
        actor.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }).map((actor) => normalizeActor(actor, 'builtin'));
  }, [category, search]);

  const visibleActors = mode === 'store' ? storeActors : visibleBuiltin;
  const profileOptions = useMemo(() => profiles.map((profile) => ({ id: profile.id, name: profile.name })), [profiles]);

  const handleOpenDetail = async (actor: StoreActor) => {
    setDetailActor(actor);
    setSelectedProfiles([]);

    if (actor.source !== 'apify' || !actor.slug) {
      return;
    }

    setDetailLoading(true);
    try {
      const detail = await antiBrowserApi.storeGetActor(actor.slug);
      setDetailActor(normalizeActor(detail, 'apify'));
    } catch (error) {
      console.error('Failed to load actor detail:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleInstall = async () => {
    if (!detailActor) {
      return;
    }

    const actorKey = detailActor.id ?? detailActor.slug;
    setInstallingId(actorKey);
    try {
      if (detailActor.source === 'apify') {
        await antiBrowserApi.storeInstallActor(detailActor.slug);
      } else {
        await antiBrowserApi.createActor({
          name: detailActor.name,
          description: detailActor.description,
          script: '',
          profile_ids: selectedProfiles,
          max_concurrency: 5,
          input_schema: detailActor.example_run_input ?? {},
        });
      }
      setDetailActor(null);
      setSelectedProfiles([]);
      void fetchActors();
      void fetchStats();
    } catch (error) {
      console.error('Failed to install actor:', error);
    } finally {
      setInstallingId(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-auto p-6">
      <PageHeader
        title="Actor Store"
        description="Browse built-in templates or pull live actor packages from the Apify Store."
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <MetricPill label="Mode" value={mode === 'store' ? 'Apify Store' : 'Templates'} />
        <MetricPill label="Visible actors" value={visibleActors.length} />
        <MetricPill
          label="Crawlee"
          value={crawlee?.available ? 'Ready' : 'Unavailable'}
          tone={crawlee?.available ? 'success' : 'warning'}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant={mode === 'templates' ? 'default' : 'outline'} onClick={() => setMode('templates')}>
          Templates
        </Button>
        <Button variant={mode === 'store' ? 'default' : 'outline'} onClick={() => setMode('store')}>
          Apify Store
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={mode === 'store' ? 'Search the store...' : 'Search templates...'}
          className={`${FIELD_CLASS} lg:col-span-2`}
        />
        <select value={category} onChange={(event) => setCategory(event.target.value)} className={SELECT_CLASS}>
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
          className={SELECT_CLASS}
          disabled={mode !== 'store'}
        >
          <option value="popularity">Most popular</option>
          <option value="newest">Newest</option>
          <option value="alphabetical">Alphabetical</option>
        </select>
      </div>

      {mode === 'store' && crawlee ? (
        <Card className="mt-4 border-border/60 bg-card/50 py-0">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div className="space-y-1">
              <div className="font-medium">
                Crawlee {crawlee.available ? 'is ready' : 'is not installed'}
              </div>
              <div className="text-muted-foreground">
                {crawlee.crawlers.length > 0
                  ? `Available providers: ${crawlee.crawlers.map((crawler) => crawler.name).join(', ')}`
                  : 'No crawler providers reported by the backend.'}
              </div>
            </div>
            {!crawlee.available ? (
              <Button
                variant="outline"
                onClick={() => {
                  void antiBrowserApi.crawleeInstall().then(() => antiBrowserApi.crawleeStatus()).then(setCrawlee).catch((error) => {
                    console.error('Failed to install Crawlee:', error);
                  });
                }}
              >
                Install Crawlee
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {storeLoading && mode === 'store' && storeActors.length === 0 ? (
        <div className="mt-6">
          <LoadingState label="Loading actor store..." />
        </div>
      ) : visibleActors.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No actors found"
            description="Try a different search term or switch between built-in templates and the live store."
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {visibleActors.map((actor) => (
            <Card
              key={actor.id ?? actor.slug}
              className="cursor-pointer border-border/60 bg-card/50 py-0 transition hover:border-primary/40 hover:bg-card/70"
              onClick={() => void handleOpenDetail(actor)}
            >
              <CardHeader className="border-b border-border/50 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-semibold text-white"
                      style={{ backgroundColor: actor.color }}
                    >
                      {actor.icon}
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-base">{actor.name}</CardTitle>
                      <CardDescription>{actor.author}</CardDescription>
                    </div>
                  </div>
                  <div className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] font-medium uppercase">
                    {actor.source}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <p className="line-clamp-3 text-sm text-muted-foreground">{actor.description}</p>

                {actor.tags && actor.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {actor.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{actor.runs} runs</span>
                  <span>
                    {actor.rating ? `${actor.rating.toFixed(1)} rating` : 'No rating'}
                    {actor.reviews ? ` · ${actor.reviews} reviews` : ''}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {mode === 'store' && storeHasMore ? (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" disabled={storeLoading} onClick={() => void refreshStore(false)}>
            {storeLoading ? 'Loading...' : `Load More (${storeTotal})`}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={!!detailActor}
        onOpenChange={(open) => {
          if (!open) {
            setDetailActor(null);
            setSelectedProfiles([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailActor?.name ?? 'Actor Detail'}</DialogTitle>
            <DialogDescription>
              {detailActor?.slug ?? 'Inspect actor details and install it into the native Anti-Browser app.'}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <LoadingState label="Loading details..." />
          ) : detailActor ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                {detailActor.readme || detailActor.description}
              </div>

              {detailActor.example_run_input && Object.keys(detailActor.example_run_input).length > 0 ? (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Example Input
                  </label>
                  <pre className="overflow-auto rounded-md border border-border/60 bg-black/20 p-3 font-mono text-[11px] text-muted-foreground">
                    {JSON.stringify(detailActor.example_run_input, null, 2)}
                  </pre>
                </div>
              ) : null}

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Assign Profiles (optional)
                </label>
                <ProfilePicker selectedIds={selectedProfiles} onChange={setSelectedProfiles} items={profileOptions} />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDetailActor(null);
                setSelectedProfiles([]);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!detailActor || installingId === (detailActor.id ?? detailActor.slug)}
              onClick={() => void handleInstall()}
            >
              {detailActor && installingId === (detailActor.id ?? detailActor.slug)
                ? 'Installing...'
                : detailActor?.source === 'apify'
                  ? 'Install From Store'
                  : 'Install Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
