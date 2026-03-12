import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useStore } from "../store";
import { api } from "../api";
import {
  Input,
  Tag,
  Button,
  message,
  Select,
  Drawer,
  Descriptions,
  Tabs,
  Empty,
  Spin,
  Tooltip,
  Segmented,
  Badge,
  Skeleton,
} from "antd";
import {
  SearchOutlined,
  DownloadOutlined,
  StarFilled,
  UserOutlined,
  ThunderboltOutlined,
  FireFilled,
  RocketOutlined,
  GlobalOutlined,
  ShoppingCartOutlined,
  LineChartOutlined,
  CommentOutlined,
  FileSearchOutlined,
  BulbOutlined,
  SafetyOutlined,
  MailOutlined,
  CloudServerOutlined,
  ApiOutlined,
  AppstoreOutlined,
  ReloadOutlined,
  LinkOutlined,
  ExperimentOutlined,
  DollarOutlined,
  CheckCircleFilled,
  LoadingOutlined,
  HomeOutlined,
  CarOutlined,
  ReadOutlined,
  BankOutlined,
  ToolOutlined,
} from "@ant-design/icons";

const { Search } = Input;

// ── Types ───────────────────────────────────────────────────────────────

interface StoreActor {
  id: string;
  name: string;
  slug: string;
  author: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  runs: string;
  runs_raw?: number;
  users?: string;
  users_raw?: number;
  rating: number;
  reviews: number;
  tags: string[];
  featured?: boolean;
  source: "apify" | "builtin";
  apify_url?: string;
  is_paid?: boolean;
  pricing_model?: string;
  last_modified?: string;
  version?: string;
  // detail fields
  readme?: string;
  default_run_options?: Record<string, any>;
  example_run_input?: Record<string, any>;
  versions?: { version: string; build_tag: string; source_type: string }[];
}

// ── Local categories with icons ─────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  all: <RocketOutlined />,
  "social-media": <CommentOutlined />,
  "e-commerce": <ShoppingCartOutlined />,
  seo: <LineChartOutlined />,
  "lead-gen": <MailOutlined />,
  "ai-agents": <BulbOutlined />,
  scraping: <GlobalOutlined />,
  security: <SafetyOutlined />,
  data: <FileSearchOutlined />,
  automation: <ToolOutlined />,
  "real-estate": <HomeOutlined />,
  travel: <CarOutlined />,
  jobs: <UserOutlined />,
  news: <ReadOutlined />,
  finance: <BankOutlined />,
};

const DEFAULT_CATEGORIES = [
  { key: "all", label: "All" },
  { key: "social-media", label: "Social Media" },
  { key: "e-commerce", label: "E-commerce" },
  { key: "seo", label: "SEO Tools" },
  { key: "lead-gen", label: "Lead Gen" },
  { key: "ai-agents", label: "AI & ML" },
  { key: "scraping", label: "Scraping" },
  { key: "data", label: "Data" },
  { key: "automation", label: "Automation" },
];

// ── Built-in actor templates ────────────────────────────────────────────

const BUILTIN_TEMPLATES: StoreActor[] = [
  {
    id: "google-maps-scraper",
    name: "Google Maps Scraper",
    slug: "anti-browser/google-maps-scraper",
    author: "Anti-Browser",
    description:
      "Extract data from Google Maps locations and businesses. Get reviews, contact info, opening hours, prices, photos, and ratings.",
    category: "scraping",
    icon: "🗺️",
    color: "#4285f4",
    runs: "304K",
    rating: 4.7,
    reviews: 967,
    tags: ["maps", "business", "reviews", "locations"],
    featured: true,
    source: "builtin",
  },
  {
    id: "website-content-crawler",
    name: "Website Content Crawler",
    slug: "anti-browser/website-content-crawler",
    author: "Anti-Browser",
    description:
      "Crawl websites and extract text content for AI models, LLM applications, vector databases, or RAG pipelines. Powered by Crawlee.",
    category: "ai-agents",
    icon: "🕷️",
    color: "#764ba2",
    runs: "107K",
    rating: 4.3,
    reviews: 174,
    tags: ["crawler", "content", "ai", "rag", "llm", "crawlee"],
    featured: true,
    source: "builtin",
  },
  {
    id: "instagram-scraper",
    name: "Instagram Scraper",
    slug: "anti-browser/instagram-scraper",
    author: "Anti-Browser",
    description:
      "Scrape Instagram posts, profiles, reels, and comments. Extract media URLs, engagement metrics, follower counts, hashtags, and captions.",
    category: "social-media",
    icon: "📸",
    color: "#e1306c",
    runs: "195K",
    rating: 4.7,
    reviews: 317,
    tags: ["instagram", "social", "posts", "reels"],
    featured: true,
    source: "builtin",
  },
  {
    id: "tiktok-scraper",
    name: "TikTok Scraper",
    slug: "anti-browser/tiktok-scraper",
    author: "Anti-Browser",
    description:
      "Extract data from TikTok videos, hashtags, and user profiles. Scrape engagement metrics, video URLs, captions, and music info.",
    category: "social-media",
    icon: "🎵",
    color: "#000000",
    runs: "138K",
    rating: 4.7,
    reviews: 219,
    tags: ["tiktok", "video", "social", "hashtags"],
    source: "builtin",
  },
  {
    id: "twitter-scraper",
    name: "Tweet Scraper V2",
    slug: "anti-browser/tweet-scraper",
    author: "Anti-Browser",
    description:
      "Lightning-fast Twitter/X scraping. Extract tweets, profiles, lists, and search results. Supports advanced search operators.",
    category: "social-media",
    icon: "🐦",
    color: "#1da1f2",
    runs: "41K",
    rating: 4.3,
    reviews: 146,
    tags: ["twitter", "x", "tweets", "social"],
    featured: true,
    source: "builtin",
  },
  {
    id: "ecommerce-scraper",
    name: "E-commerce Scraping Tool",
    slug: "anti-browser/ecommerce-scraper",
    author: "Anti-Browser",
    description:
      "Scrape product data from any e-commerce site. Extract prices, descriptions, images, reviews, and availability.",
    category: "e-commerce",
    icon: "🛒",
    color: "#ff9900",
    runs: "5.5K",
    rating: 4.5,
    reviews: 36,
    tags: ["ecommerce", "prices", "products"],
    source: "builtin",
  },
  {
    id: "linkedin-scraper",
    name: "LinkedIn Profile Scraper",
    slug: "anti-browser/linkedin-scraper",
    author: "Anti-Browser",
    description:
      "Scrape LinkedIn profiles with email discovery. Extract job titles, companies, education, skills, and contact information.",
    category: "lead-gen",
    icon: "💼",
    color: "#0a66c2",
    runs: "28K",
    rating: 4.5,
    reviews: 89,
    tags: ["linkedin", "leads", "email", "b2b"],
    featured: true,
    source: "builtin",
  },
  {
    id: "seo-audit",
    name: "SEO Audit Tool",
    slug: "anti-browser/seo-audit",
    author: "Anti-Browser",
    description:
      "Comprehensive SEO analysis for any webpage. Check meta tags, headings, images, links, page speed, and mobile-friendliness.",
    category: "seo",
    icon: "📊",
    color: "#34d399",
    runs: "12K",
    rating: 4.6,
    reviews: 52,
    tags: ["seo", "audit", "meta", "rankings"],
    source: "builtin",
  },
];

// ── Component ───────────────────────────────────────────────────────────

export default function DiscoveryPage() {
  const profiles = useStore((s) => s.profiles);
  const fetchActors = useStore((s) => s.fetchActors);
  const fetchStats = useStore((s) => s.fetchStats);

  // Active tab: "featured" | "apify-store"
  const [activeTab, setActiveTab] = useState<string>("featured");

  // Search & filters
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Apify store state
  const [storeActors, setStoreActors] = useState<StoreActor[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeTotal, setStoreTotal] = useState(0);
  const [storeOffset, setStoreOffset] = useState(0);
  const [storeHasMore, setStoreHasMore] = useState(false);
  const [storeSortBy, setStoreSortBy] = useState("popularity");
  const storeLimit = 24;

  // Crawlee status
  const [crawleeAvailable, setCrawleeAvailable] = useState<boolean | null>(null);
  const [crawlers, setCrawlers] = useState<any[]>([]);

  // Detail drawer
  const [detailActor, setDetailActor] = useState<StoreActor | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);

  // Search debounce
  const searchTimerRef = useRef<any>(null);

  // ── Init: Check crawlee status ──
  useEffect(() => {
    api.crawleeStatus().then((data: any) => {
      setCrawleeAvailable(data.available);
      setCrawlers(data.crawlers || []);
    }).catch(() => setCrawleeAvailable(false));
  }, []);

  // ── Fetch Apify Store actors ──
  const fetchStoreActors = useCallback(
    async (reset = false) => {
      setStoreLoading(true);
      try {
        const offset = reset ? 0 : storeOffset;
        const data = await api.storeListActors({
          search: search.trim(),
          category: selectedCategory !== "all" ? selectedCategory : undefined,
          limit: storeLimit,
          offset,
          sort_by: storeSortBy,
        });
        if (reset) {
          setStoreActors(data.actors || []);
        } else {
          setStoreActors((prev) => [...prev, ...(data.actors || [])]);
        }
        setStoreTotal(data.total || 0);
        setStoreOffset(offset + storeLimit);
        setStoreHasMore(data.has_more || false);
      } catch (e: any) {
        console.error("Failed to fetch store actors:", e);
        message.error("Failed to load Apify Store");
      } finally {
        setStoreLoading(false);
      }
    },
    [search, selectedCategory, storeOffset, storeSortBy],
  );

  // Auto-fetch when switching to Apify Store tab or changing filters
  useEffect(() => {
    if (activeTab === "apify-store") {
      setStoreOffset(0);
      fetchStoreActors(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedCategory, storeSortBy]);

  // Debounced search for Apify Store
  useEffect(() => {
    if (activeTab !== "apify-store") return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setStoreOffset(0);
      fetchStoreActors(true);
    }, 500);
    return () => clearTimeout(searchTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── Built-in actor filtering ──
  const filteredBuiltin = useMemo(() => {
    let result = BUILTIN_TEMPLATES;
    if (selectedCategory !== "all") {
      result = result.filter((a) => a.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.tags.some((t) => t.includes(q)) ||
          a.author.toLowerCase().includes(q),
      );
    }
    return result;
  }, [search, selectedCategory]);

  const featuredBuiltin = BUILTIN_TEMPLATES.filter((a) => a.featured);

  // ── Detail drawer ──
  const handleOpenDetail = async (actor: StoreActor) => {
    setDetailActor(actor);

    if (actor.source === "apify" && actor.slug) {
      setDetailLoading(true);
      try {
        const data = await api.storeGetActor(actor.slug);
        if (data.actor) {
          setDetailActor(data.actor);
        }
      } catch {
        // keep the summary version
      } finally {
        setDetailLoading(false);
      }
    }
  };

  // ── Install handler ──
  const handleInstall = async (actor: StoreActor) => {
    setInstalling(actor.id || actor.slug);
    try {
      if (actor.source === "apify") {
        await api.storeInstallActor(actor.slug);
      } else {
        await api.createActor({
          name: actor.name,
          description: actor.description,
          script: "",
          profile_ids: selectedProfiles,
          max_concurrency: 5,
          input_schema: {},
        });
      }
      message.success(`"${actor.name}" installed successfully!`);
      setDetailActor(null);
      setSelectedProfiles([]);
      fetchActors();
      fetchStats();
    } catch (e: any) {
      message.error(e.message || "Installation failed");
    } finally {
      setInstalling(null);
    }
  };

  // ── Current actors for the grid ──
  const isStoreTab = activeTab === "apify-store";
  const currentActors = isStoreTab ? storeActors : filteredBuiltin;
  const showFeatured = !isStoreTab && selectedCategory === "all" && !search.trim();

  return (
    <div className="content-area">
      <div className="fade-in">
        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
                <span className="gradient-text">Actor Store</span>
              </h2>
              <p style={{ color: "#555", fontSize: 13, margin: 0 }}>
                Discover and install automation actors. Browse{" "}
                <a
                  href="https://apify.com/store"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#667eea" }}
                >
                  Apify Store
                </a>
                {" "}or use built-in templates.
                {crawleeAvailable !== null && (
                  <Tooltip title={crawleeAvailable ? "Crawlee Python is installed and ready" : "Install crawlee[all] to enable advanced crawling"}>
                    <Tag
                      color={crawleeAvailable ? "success" : "warning"}
                      style={{ marginLeft: 8, borderRadius: 10, fontSize: 10, cursor: "help" }}
                    >
                      <ExperimentOutlined style={{ marginRight: 3 }} />
                      Crawlee {crawleeAvailable ? "Ready" : "Not Installed"}
                    </Tag>
                  </Tooltip>
                )}
              </p>
            </div>
            {isStoreTab && (
              <Button
                icon={<ReloadOutlined />}
                loading={storeLoading}
                onClick={() => { setStoreOffset(0); fetchStoreActors(true); }}
                style={{ borderRadius: 8 }}
              >
                Refresh
              </Button>
            )}
          </div>
        </div>

        {/* ── Tab switcher ── */}
        <div style={{ marginBottom: 20 }}>
          <Segmented
            value={activeTab}
            onChange={(v) => setActiveTab(v as string)}
            options={[
              {
                value: "featured",
                icon: <AppstoreOutlined />,
                label: "Built-in Templates",
              },
              {
                value: "apify-store",
                icon: <CloudServerOutlined />,
                label: (
                  <span>
                    Apify Store
                    <Badge
                      count="Live"
                      style={{
                        marginLeft: 6,
                        backgroundColor: "#52c41a",
                        fontSize: 9,
                        height: 16,
                        lineHeight: "16px",
                        borderRadius: 8,
                      }}
                    />
                  </span>
                ),
              },
            ]}
            style={{
              background: "rgba(255,255,255,0.04)",
              borderRadius: 10,
              padding: 2,
            }}
          />
        </div>

        {/* ── Search bar ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <Search
            placeholder={isStoreTab ? "Search 19,000+ actors on Apify Store..." : "Search built-in actors..."}
            size="large"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<SearchOutlined style={{ color: "#555" }} />}
            style={{ maxWidth: 520 }}
            styles={{
              input: {
                background: "rgba(255,255,255,0.04)",
                borderColor: "rgba(255,255,255,0.08)",
              },
            }}
          />
          {isStoreTab && (
            <Select
              value={storeSortBy}
              onChange={setStoreSortBy}
              style={{ width: 150 }}
              options={[
                { value: "popularity", label: "🔥 Popular" },
                { value: "newest", label: "🆕 Newest" },
                { value: "alphabetical", label: "🔤 A-Z" },
              ]}
            />
          )}
        </div>

        {/* ── Category pills ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {DEFAULT_CATEGORIES.map((cat) => (
            <div
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                transition: "all 0.2s ease",
                background:
                  selectedCategory === cat.key
                    ? "linear-gradient(135deg, rgba(102,126,234,0.25), rgba(118,75,162,0.2))"
                    : "rgba(255,255,255,0.03)",
                border:
                  selectedCategory === cat.key
                    ? "1px solid rgba(102,126,234,0.4)"
                    : "1px solid rgba(255,255,255,0.06)",
                color: selectedCategory === cat.key ? "#b8c5ff" : "#777",
              }}
            >
              {CATEGORY_ICONS[cat.key] || <RocketOutlined />} {cat.label}
            </div>
          ))}
        </div>

        {/* ── Crawlee status banner (when on store tab) ── */}
        {isStoreTab && crawlers.length > 0 && (
          <div
            style={{
              marginBottom: 20,
              padding: "12px 16px",
              borderRadius: 12,
              background: "linear-gradient(135deg, rgba(102,126,234,0.08), rgba(118,75,162,0.05))",
              border: "1px solid rgba(102,126,234,0.15)",
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 12,
              color: "#aaa",
            }}
          >
            <ExperimentOutlined style={{ fontSize: 18, color: "#667eea" }} />
            <div style={{ flex: 1 }}>
              <strong style={{ color: "#c8d0ff" }}>Powered by Crawlee for Python</strong>
              <span style={{ margin: "0 6px", color: "#444" }}>·</span>
              Available crawlers:
              {crawlers.map((c: any) => (
                <Tag key={c.type} style={{ marginLeft: 6, borderRadius: 10, fontSize: 10 }}>
                  {c.icon} {c.name}
                </Tag>
              ))}
            </div>
          </div>
        )}

        {/* ── Featured section (built-in tab only) ── */}
        {showFeatured && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <FireFilled style={{ color: "#f97316", fontSize: 18 }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0", margin: 0 }}>
                Featured Actors
              </h3>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 16,
              }}
            >
              {featuredBuiltin.map((actor) => (
                <ActorCard
                  key={actor.id}
                  actor={actor}
                  featured
                  onSelect={() => handleOpenDetail(actor)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Actors grid ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0", margin: 0 }}>
              {isStoreTab ? "Apify Store" : selectedCategory === "all" ? "All Templates" : DEFAULT_CATEGORIES.find((c) => c.key === selectedCategory)?.label}
              <span style={{ color: "#555", fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
                ({isStoreTab ? storeTotal : currentActors.length})
              </span>
            </h3>
          </div>

          {/* Loading skeleton */}
          {storeLoading && currentActors.length === 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 16,
              }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass-card" style={{ padding: 20 }}>
                  <Skeleton active paragraph={{ rows: 3 }} />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!storeLoading && currentActors.length === 0 && (
            <Empty
              description={isStoreTab ? "No actors found in Apify Store" : "No built-in actors found"}
              style={{ marginTop: 60 }}
            />
          )}

          {/* Actor cards */}
          {currentActors.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 16,
                paddingBottom: 16,
              }}
            >
              {currentActors.map((actor) => (
                <ActorCard
                  key={actor.id || actor.slug}
                  actor={actor}
                  onSelect={() => handleOpenDetail(actor)}
                />
              ))}
            </div>
          )}

          {/* Load more (Apify Store) */}
          {isStoreTab && storeHasMore && (
            <div style={{ textAlign: "center", padding: "20px 0 32px" }}>
              <Button
                size="large"
                loading={storeLoading}
                onClick={() => fetchStoreActors(false)}
                style={{
                  borderRadius: 10,
                  height: 44,
                  paddingInline: 40,
                  fontWeight: 600,
                  background: "rgba(255,255,255,0.04)",
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                Load More Actors
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Actor Detail Drawer ── */}
      <Drawer
        title={null}
        open={!!detailActor}
        onClose={() => { setDetailActor(null); setSelectedProfiles([]); }}
        width={580}
        styles={{ body: { padding: 0, display: "flex", flexDirection: "column" } }}
      >
        {detailActor && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Header banner */}
            <div
              style={{
                background: `linear-gradient(135deg, ${detailActor.color}20, ${detailActor.color}05)`,
                borderBottom: `1px solid ${detailActor.color}30`,
                padding: "28px 24px",
                position: "relative",
              }}
            >
              {/* Source badge */}
              <div style={{ position: "absolute", top: 12, right: 16 }}>
                {detailActor.source === "apify" ? (
                  <Tag
                    style={{
                      borderRadius: 8,
                      fontSize: 10,
                      fontWeight: 600,
                      background: "linear-gradient(135deg, #00d68f15, #00b87c15)",
                      border: "1px solid #00d68f30",
                      color: "#00d68f",
                    }}
                  >
                    <CloudServerOutlined style={{ marginRight: 3 }} /> Apify Store
                  </Tag>
                ) : (
                  <Tag
                    style={{
                      borderRadius: 8,
                      fontSize: 10,
                      fontWeight: 600,
                      background: "linear-gradient(135deg, #667eea15, #764ba215)",
                      border: "1px solid #667eea30",
                      color: "#667eea",
                    }}
                  >
                    <AppstoreOutlined style={{ marginRight: 3 }} /> Built-in
                  </Tag>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: `${detailActor.color}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 28,
                    border: `1px solid ${detailActor.color}30`,
                  }}
                >
                  {detailActor.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: "#e8e8e8", margin: 0 }}>
                    {detailActor.name}
                  </h2>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                    {detailActor.slug}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                    {detailActor.rating > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#faad14" }}>
                        <StarFilled /> {detailActor.rating}
                        <span style={{ color: "#555" }}>({detailActor.reviews})</span>
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: "#888" }}>
                      <ThunderboltOutlined style={{ marginRight: 4 }} />
                      {detailActor.runs} runs
                    </span>
                    {detailActor.users && (
                      <span style={{ fontSize: 12, color: "#888" }}>
                        <UserOutlined style={{ marginRight: 4 }} />
                        {detailActor.users} users
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: "#888" }}>
                      <UserOutlined style={{ marginRight: 4 }} />
                      {detailActor.author}
                    </span>
                    {detailActor.is_paid && (
                      <Tag color="gold" style={{ borderRadius: 6, fontSize: 10 }}>
                        <DollarOutlined /> Paid
                      </Tag>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs content */}
            <div style={{ flex: 1, overflow: "auto", padding: "0 24px" }}>
              {detailLoading ? (
                <div style={{ padding: 40, textAlign: "center" }}>
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 32, color: "#667eea" }} />} />
                  <p style={{ color: "#666", marginTop: 12 }}>Loading actor details...</p>
                </div>
              ) : (
                <Tabs
                  defaultActiveKey="about"
                  items={[
                    {
                      key: "about",
                      label: "About",
                      children: (
                        <div style={{ paddingBottom: 24 }}>
                          <p style={{ color: "#999", fontSize: 13, lineHeight: 1.8, marginBottom: 20 }}>
                            {detailActor.readme || detailActor.description}
                          </p>

                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                            {(detailActor.tags || []).slice(0, 12).map((t) => (
                              <Tag key={t} style={{ borderRadius: 12 }}>
                                {t}
                              </Tag>
                            ))}
                          </div>

                          {/* Apify link */}
                          {detailActor.apify_url && (
                            <Button
                              type="link"
                              icon={<LinkOutlined />}
                              href={detailActor.apify_url}
                              target="_blank"
                              style={{ padding: 0, fontSize: 12, color: "#667eea" }}
                            >
                              View on Apify Store →
                            </Button>
                          )}

                          {/* Input schema / example */}
                          {detailActor.example_run_input && Object.keys(detailActor.example_run_input).length > 0 && (
                            <div style={{ marginTop: 20 }}>
                              <h4 style={{ fontSize: 13, color: "#888", marginBottom: 10 }}>EXAMPLE INPUT</h4>
                              <div
                                style={{
                                  background: "#0d1117",
                                  borderRadius: 10,
                                  padding: 14,
                                  fontSize: 11,
                                  fontFamily: "'SF Mono', Consolas, monospace",
                                  color: "#c9d1d9",
                                  maxHeight: 200,
                                  overflow: "auto",
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {JSON.stringify(detailActor.example_run_input, null, 2)}
                              </div>
                            </div>
                          )}

                          {/* Versions */}
                          {detailActor.versions && detailActor.versions.length > 0 && (
                            <div style={{ marginTop: 20 }}>
                              <h4 style={{ fontSize: 13, color: "#888", marginBottom: 10 }}>VERSIONS</h4>
                              <Descriptions column={1} size="small" bordered styles={{ label: { background: "rgba(255,255,255,0.02)", width: 120 } }}>
                                {detailActor.versions.map((v) => (
                                  <Descriptions.Item key={v.version} label={v.version}>
                                    <Tag style={{ borderRadius: 6 }}>{v.source_type || "source"}</Tag>
                                    {v.build_tag && <span style={{ color: "#555", fontSize: 11, marginLeft: 6 }}>{v.build_tag}</span>}
                                  </Descriptions.Item>
                                ))}
                              </Descriptions>
                            </div>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: "crawlee",
                      label: (
                        <span>
                          <ExperimentOutlined style={{ marginRight: 4 }} />
                          Crawlee Config
                        </span>
                      ),
                      children: (
                        <div style={{ paddingBottom: 24 }}>
                          <p style={{ color: "#888", fontSize: 12, marginBottom: 16 }}>
                            This actor will be executed using <strong style={{ color: "#b8c5ff" }}>Crawlee for Python</strong>.
                            Choose the crawler type and configure execution options.
                          </p>

                          {crawlers.map((c: any) => (
                            <div
                              key={c.type}
                              className="glass-card"
                              style={{
                                padding: 16,
                                marginBottom: 10,
                                display: "flex",
                                alignItems: "center",
                                gap: 14,
                              }}
                            >
                              <span style={{ fontSize: 24 }}>{c.icon}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: "#e0e0e0" }}>
                                  {c.name}
                                </div>
                                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                                  {c.description}
                                </div>
                              </div>
                              {c.requires_browser && (
                                <Tag style={{ borderRadius: 6, fontSize: 10 }}>Browser</Tag>
                              )}
                            </div>
                          ))}

                          {!crawleeAvailable && (
                            <div
                              style={{
                                marginTop: 16,
                                padding: "14px 16px",
                                borderRadius: 10,
                                background: "rgba(250, 173, 20, 0.08)",
                                border: "1px solid rgba(250, 173, 20, 0.2)",
                                fontSize: 12,
                                color: "#faad14",
                              }}
                            >
                              ⚠️ Crawlee is not installed. Run{" "}
                              <code style={{ background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: 4 }}>
                                pip install "crawlee[all]"
                              </code>{" "}
                              to enable crawler execution.
                            </div>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </div>

            {/* Install bar */}
            <div
              style={{
                background: "rgba(20,20,30,0.95)",
                backdropFilter: "blur(20px)",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                padding: "16px 24px",
              }}
            >
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>
                  Assign to profiles (optional)
                </label>
                <Select
                  mode="multiple"
                  placeholder="Select profiles..."
                  value={selectedProfiles}
                  onChange={setSelectedProfiles}
                  style={{ width: "100%" }}
                  size="small"
                  options={profiles.map((p: any) => ({
                    value: p.id,
                    label: `${p.name} (${p.id})`,
                  }))}
                />
              </div>
              <Button
                type="primary"
                size="large"
                block
                icon={installing === (detailActor.id || detailActor.slug) ? <LoadingOutlined /> : <DownloadOutlined />}
                loading={installing === (detailActor.id || detailActor.slug)}
                onClick={() => handleInstall(detailActor)}
                style={{
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  border: "none",
                  height: 44,
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                Install Actor{detailActor.source === "apify" ? " from Apify" : ""}
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ── Actor Card Component ────────────────────────────────────────────────

function ActorCard({
  actor,
  featured,
  onSelect,
}: {
  actor: StoreActor;
  featured?: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className="glass-card glow-border"
      onClick={onSelect}
      style={{
        padding: 20,
        cursor: "pointer",
        transition: "all 0.25s ease",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Featured badge */}
      {featured && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "linear-gradient(135deg, #f97316, #ef4444)",
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 4,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          <FireFilled style={{ marginRight: 3 }} /> Featured
        </div>
      )}

      {/* Source badge */}
      {actor.source === "apify" && !featured && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            fontSize: 9,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 4,
            background: "rgba(0, 214, 143, 0.1)",
            border: "1px solid rgba(0, 214, 143, 0.2)",
            color: "#00d68f",
          }}
        >
          Apify
        </div>
      )}

      {/* Icon + Info */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: `${actor.color}15`,
            border: `1px solid ${actor.color}25`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            flexShrink: 0,
          }}
        >
          {actor.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#e8e8e8", lineHeight: 1.3 }}>
            {actor.name}
          </div>
          <div style={{ fontSize: 11, color: "#667eea", marginTop: 2 }}>{actor.slug}</div>
        </div>
      </div>

      {/* Description */}
      <p
        style={{
          fontSize: 12,
          color: "#777",
          lineHeight: 1.6,
          margin: 0,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {actor.description}
      </p>

      {/* Footer stats */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "auto",
          paddingTop: 8,
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#888" }}>
          <UserOutlined style={{ fontSize: 11 }} />
          {actor.author}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {actor.is_paid && (
            <Tag color="gold" style={{ borderRadius: 6, fontSize: 9, margin: 0 }}>
              <DollarOutlined /> Paid
            </Tag>
          )}
          <span style={{ fontSize: 12, color: "#888" }}>
            <ThunderboltOutlined style={{ marginRight: 3, color: "#52c41a" }} />
            {actor.runs}
          </span>
          {actor.rating > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: "#faad14" }}>
              <StarFilled style={{ fontSize: 11 }} />
              {actor.rating}
              <span style={{ color: "#555", fontSize: 10 }}>({actor.reviews})</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
