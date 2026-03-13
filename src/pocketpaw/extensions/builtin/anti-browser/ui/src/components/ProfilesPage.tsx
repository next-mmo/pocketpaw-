import { useState, useMemo, useEffect, useCallback } from "react";
import { useStore } from "../store";
import { api } from "../api";
import {
  Button,
  Modal,
  Input,
  Select,
  message,
  Tag,
  Tooltip,
  Popconfirm,
  Space,
  Empty,
  Spin,
  Drawer,
  Descriptions,
  Switch,
  Table,
  Badge,
  Dropdown,
  Checkbox,
  Divider,
  Radio,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CameraOutlined,
  WindowsOutlined,
  AppleOutlined,
  ChromeOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  SearchOutlined,
  MoreOutlined,
  LinkOutlined,
  RobotOutlined,
  FilterOutlined,
  SettingOutlined,
  ClockCircleOutlined,
  EditOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  LoadingOutlined,
  RocketOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
} from "@ant-design/icons";

const OS_ICONS: Record<string, React.ReactNode> = {
  windows: <WindowsOutlined />,
  macos: <AppleOutlined />,
  linux: <span>🐧</span>,
};

const AVATAR_COLORS = [
  "linear-gradient(135deg, #667eea, #764ba2)",
  "linear-gradient(135deg, #f093fb, #f5576c)",
  "linear-gradient(135deg, #4facfe, #00f2fe)",
  "linear-gradient(135deg, #43e97b, #38f9d7)",
  "linear-gradient(135deg, #fa709a, #fee140)",
  "linear-gradient(135deg, #a18cd1, #fbc2eb)",
  "linear-gradient(135deg, #fccb90, #d57eeb)",
  "linear-gradient(135deg, #e0c3fc, #8ec5fc)",
];

// Crawler/scraper providers inspired by Apify's actor-scraper packages
const CRAWLER_PROVIDERS = [
  {
    key: "playwright",
    name: "Playwright",
    icon: "🎭",
    color: "#45ba4b",
    description: "Full browser rendering. Handles SPAs and JS-heavy pages.",
    headlessCapable: true,
    browserRequired: true,
  },
  {
    key: "puppeteer",
    name: "Puppeteer",
    icon: "🤖",
    color: "#40b5a4",
    description: "Chrome DevTools Protocol. Fast browser automation.",
    headlessCapable: true,
    browserRequired: true,
  },
  {
    key: "camoufox",
    name: "Camoufox",
    icon: "🦊",
    color: "#ff6611",
    description: "Anti-detect Firefox. Bypasses bot protections.",
    headlessCapable: true,
    browserRequired: true,
  },
  {
    key: "cheerio",
    name: "Cheerio",
    icon: "🍜",
    color: "#e88d2c",
    description: "Fast HTML parser. No browser needed.",
    headlessCapable: false,
    browserRequired: false,
  },
  {
    key: "beautifulsoup",
    name: "BeautifulSoup",
    icon: "🥣",
    color: "#3776ab",
    description: "Python HTML parser. Lightweight static scraping.",
    headlessCapable: false,
    browserRequired: false,
  },
  {
    key: "jsdom",
    name: "JSDOM",
    icon: "📄",
    color: "#f7df1e",
    description: "Virtual DOM in Node.js. Parses without rendering.",
    headlessCapable: false,
    browserRequired: false,
  },
  {
    key: "http",
    name: "HTTP / Raw",
    icon: "⚡",
    color: "#00bcd4",
    description: "Raw HTTP requests. Fastest for APIs.",
    headlessCapable: false,
    browserRequired: false,
  },
  {
    key: "sitemap",
    name: "Sitemap",
    icon: "🗺️",
    color: "#9c27b0",
    description: "Crawl via sitemap.xml. Discover all pages.",
    headlessCapable: false,
    browserRequired: false,
  },
];

const ACTIVITY_EVENT_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  profile_created: { icon: <span>➕</span>, color: "#667eea" },
  profile_launched: { icon: <PlayCircleOutlined />, color: "#52c41a" },
  profile_stopped: { icon: <PauseCircleOutlined />, color: "#888" },
  profile_updated: { icon: <EditOutlined />, color: "#faad14" },
  profile_deleted: { icon: <DeleteOutlined />, color: "#ff4d4f" },
  fingerprint_regen: { icon: <ReloadOutlined />, color: "#f5576c" },
  screenshot_taken: { icon: <CameraOutlined />, color: "#13c2c2" },
};

function timeAgo(ts: number): string {
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ProfileActivitySection({
  profileId,
  activity,
  loading,
}: {
  profileId: string;
  activity: any[];
  loading: boolean;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <h4
        style={{
          color: "#888",
          fontSize: 12,
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <ClockCircleOutlined /> ACTIVITY LOG
      </h4>
      {loading ? (
        <div style={{ textAlign: "center", padding: 20 }}>
          <Spin size="small" />
        </div>
      ) : activity.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "16px 0",
            color: "#555",
            fontSize: 12,
          }}
        >
          No activity recorded yet
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {activity.map((evt: any) => {
            const cfg = ACTIVITY_EVENT_CONFIG[evt.type] || {
              icon: <span>•</span>,
              color: "#888",
            };
            return (
              <div
                key={evt.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: `${cfg.color}15`,
                    border: `1px solid ${cfg.color}30`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    color: cfg.color,
                    flexShrink: 0,
                  }}
                >
                  {cfg.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#ccc",
                      lineHeight: 1.4,
                    }}
                  >
                    {evt.message}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#555",
                      marginTop: 2,
                    }}
                  >
                    <ClockCircleOutlined style={{ marginRight: 3 }} />
                    {timeAgo(evt.timestamp)}
                    {evt.meta && Object.keys(evt.meta).length > 0 && (
                      <span style={{ marginLeft: 8, color: "#444" }}>
                        {evt.meta.crawler_type && `• ${evt.meta.crawler_type}`}
                        {evt.meta.headless !== undefined &&
                          ` • ${evt.meta.headless ? "headless" : "visible"}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProfilesPage() {
  const profiles = useStore((s) => s.profiles);
  const actors = useStore((s) => s.actors);
  const loading = useStore((s) => s.loadingProfiles);
  const fetchProfiles = useStore((s) => s.fetchProfiles);
  const fetchStats = useStore((s) => s.fetchStats);
  const proxies = useStore((s) => s.proxies);
  const fetchProxies = useStore((s) => s.fetchProxies);

  // Fetch proxies on mount for the launch dialog
  useEffect(() => { fetchProxies(); }, []);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [searchText, setSearchText] = useState("");
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [profileActivity, setProfileActivity] = useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [crawleeAvailable, setCrawleeAvailable] = useState<boolean | null>(null);
  const [installingCrawlee, setInstallingCrawlee] = useState(false);

  // ── Launch Options Dialog state ──
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchProfileRecord, setLaunchProfileRecord] = useState<any>(null);
  const [launchStartUrl, setLaunchStartUrl] = useState("");
  const [launchHeadless, setLaunchHeadless] = useState<boolean | undefined>(undefined);
  const [launchCrawlerType, setLaunchCrawlerType] = useState<string | undefined>(undefined);
  const [launchProxyId, setLaunchProxyId] = useState<string | undefined>(undefined);
  const [launchActorId, setLaunchActorId] = useState<string | undefined>(undefined);
  const [launchViewport, setLaunchViewport] = useState<string | undefined>(undefined);
  const [launchCleanSession, setLaunchCleanSession] = useState(false);
  const [launchSessionLabel, setLaunchSessionLabel] = useState("");
  const [launching, setLaunching] = useState(false);

  // Check crawlee availability on mount
  useEffect(() => {
    api.crawleeStatus()
      .then((data: any) => setCrawleeAvailable(data.available ?? false))
      .catch(() => setCrawleeAvailable(false));
  }, []);

  const handleInstallCrawlee = async () => {
    setInstallingCrawlee(true);
    try {
      const result = await api.crawleeInstall();
      if (result.success) {
        message.success("Crawlee installed successfully!");
        setCrawleeAvailable(true);
      } else {
        message.error(result.error || "Install failed");
      }
    } catch (e: any) {
      message.error(e.message || "Install failed");
    } finally {
      setInstallingCrawlee(false);
    }
  };

  // Fetch activity when profile detail drawer opens
  const fetchProfileActivity = useCallback(async (id: string) => {
    setLoadingActivity(true);
    try {
      const data = await api.getProfileActivity(id, 50);
      setProfileActivity(data.events || []);
    } catch (e) {
      console.error("Failed to fetch profile activity:", e);
      setProfileActivity([]);
    } finally {
      setLoadingActivity(false);
    }
  }, []);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formGroup, setFormGroup] = useState("default");
  const [formOS, setFormOS] = useState("windows");
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formHeadless, setFormHeadless] = useState(true);
  const [formCrawlerType, setFormCrawlerType] = useState("playwright");
  const [formActorId, setFormActorId] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  // Available groups derived from profiles
  const availableGroups = useMemo(() => {
    const groups = new Set(profiles.map((p: any) => p.group || "default"));
    return [...groups];
  }, [profiles]);

  // Filter profiles
  const filteredProfiles = useMemo(() => {
    let result = profiles;
    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter(
        (p: any) =>
          p.name?.toLowerCase().includes(lower) ||
          p.id?.toLowerCase().includes(lower) ||
          (p.tags || []).some((t: string) => t.toLowerCase().includes(lower))
      );
    }
    if (filterGroup) {
      result = result.filter((p: any) => (p.group || "default") === filterGroup);
    }
    if (filterStatus) {
      result = result.filter((p: any) => (p.status || "stopped") === filterStatus);
    }
    return result;
  }, [profiles, searchText, filterGroup, filterStatus]);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setCreating(true);
    try {
      await api.createProfile({
        name: formName,
        group: formGroup,
        os_type: formOS,
        tags: formTags,
        headless: formHeadless,
        crawler_type: formCrawlerType,
        actor_id: formActorId || "",
      });
      message.success("Profile created with unique fingerprint");
      setCreateOpen(false);
      setFormName("");
      setFormTags([]);
      setFormHeadless(true);
      setFormCrawlerType("playwright");
      setFormActorId(undefined);
      fetchProfiles();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const openLaunchDialog = (record: any) => {
    setLaunchProfileRecord(record);
    // Pre-populate from profile defaults
    setLaunchStartUrl("");
    setLaunchHeadless(record.headless !== false);
    setLaunchCrawlerType(record.crawler_type || "playwright");
    setLaunchProxyId(undefined);
    setLaunchActorId(record.actor_id || undefined);
    setLaunchViewport(undefined);
    setLaunchCleanSession(false);
    setLaunchSessionLabel("");
    setLaunchOpen(true);
  };

  const handleConfirmLaunch = async () => {
    if (!launchProfileRecord) return;
    setLaunching(true);
    try {
      const opts: any = {};
      if (launchStartUrl.trim()) opts.start_url = launchStartUrl.trim();
      if (launchHeadless !== undefined) opts.headless = launchHeadless;
      if (launchCrawlerType) opts.crawler_type = launchCrawlerType;
      if (launchProxyId) opts.proxy_id = launchProxyId;
      if (launchActorId) opts.actor_id = launchActorId;
      if (launchViewport) opts.viewport = launchViewport;
      if (launchCleanSession) opts.clean_session = true;
      if (launchSessionLabel.trim()) opts.session_label = launchSessionLabel.trim();
      await api.launchProfile(launchProfileRecord.id, Object.keys(opts).length > 0 ? opts : undefined);
      message.success("Browser launched");
      setLaunchOpen(false);
      fetchProfiles();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLaunching(false);
    }
  };

  const handleQuickLaunch = async () => {
    if (!launchProfileRecord) return;
    setLaunching(true);
    try {
      await api.launchProfile(launchProfileRecord.id);
      message.success("Browser launched");
      setLaunchOpen(false);
      fetchProfiles();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLaunching(false);
    }
  };

  const handleStop = async (id: string) => {
    try {
      await api.stopProfile(id);
      message.info("Browser stopped");
      fetchProfiles();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteProfile(id);
      message.success("Profile deleted");
      fetchProfiles();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleBulkDelete = async () => {
    for (const id of selectedRowKeys) {
      await api.deleteProfile(id);
    }
    message.success(`Deleted ${selectedRowKeys.length} profiles`);
    setSelectedRowKeys([]);
    fetchProfiles();
    fetchStats();
  };

  const handleRegenFingerprint = async (id: string) => {
    try {
      await api.regenerateFingerprint(id);
      message.success("Fingerprint regenerated");
      fetchProfiles();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleScreenshot = async (id: string) => {
    try {
      const resp = await api.screenshotProfile(id);
      setScreenshot(resp.image);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleToggleHeadless = async (id: string, headless: boolean) => {
    try {
      await api.updateProfile(id, { headless });
      message.success(`Headless ${headless ? "enabled" : "disabled"}`);
      fetchProfiles();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleAssignActor = async (id: string, actorId: string) => {
    try {
      await api.updateProfile(id, { actor_id: actorId });
      message.success("Actor assigned");
      fetchProfiles();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleSetCrawlerType = async (id: string, crawlerType: string) => {
    try {
      await api.updateProfile(id, { crawler_type: crawlerType });
      message.success("Provider updated");
      fetchProfiles();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const openDetail = (p: any) => {
    setSelectedProfile(p);
    setDetailOpen(true);
    fetchProfileActivity(p.id);
  };

  const getProviderInfo = (key: string) =>
    CRAWLER_PROVIDERS.find((p) => p.key === key) || CRAWLER_PROVIDERS[0];

  // Table columns — Apify-cloud-inspired
  const columns: ColumnsType<any> = [
    {
      title: "Profile",
      key: "profile",
      fixed: "left" as const,
      width: 280,
      render: (_: any, record: any, index: number) => (
        <div
          style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
          onClick={() => openDetail(record)}
        >
          <div
            className="profile-avatar"
            style={{
              background: AVATAR_COLORS[index % AVATAR_COLORS.length],
              width: 36,
              height: 36,
              borderRadius: 10,
              fontSize: 15,
            }}
          >
            {record.name?.[0]?.toUpperCase() || "?"}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#e0e0e0", lineHeight: 1.3 }}>
              {record.name}
            </div>
            <div style={{ fontSize: 11, color: "#555", lineHeight: 1.3 }}>
              {record.id}
            </div>
          </div>
        </div>
      ),
      sorter: (a: any, b: any) => (a.name || "").localeCompare(b.name || ""),
    },
    {
      title: "Status",
      key: "status",
      width: 100,
      align: "center" as const,
      render: (_: any, record: any) => {
        const status = record.status || "stopped";
        return (
          <Badge
            status={status === "running" ? "processing" : "default"}
            text={
              <span style={{ fontSize: 12, color: status === "running" ? "#52c41a" : "#666" }}>
                {status === "running" ? "Running" : "Stopped"}
              </span>
            }
          />
        );
      },
      filters: [
        { text: "Running", value: "running" },
        { text: "Stopped", value: "stopped" },
      ],
      onFilter: (value: any, record: any) => (record.status || "stopped") === value,
    },
    {
      title: "OS",
      key: "os",
      width: 100,
      align: "center" as const,
      render: (_: any, record: any) => (
        <span className={`os-badge ${record.os_type || "windows"}`}>
          {OS_ICONS[record.os_type] || OS_ICONS.windows} {record.os_type}
        </span>
      ),
      filters: [
        { text: "Windows", value: "windows" },
        { text: "macOS", value: "macos" },
        { text: "Linux", value: "linux" },
      ],
      onFilter: (value: any, record: any) => record.os_type === value,
    },
    {
      title: "Provider",
      key: "crawler_type",
      width: 190,
      render: (_: any, record: any) => {
        const provider = getProviderInfo(record.crawler_type || "playwright");
        const needsCrawlee = record.crawler_type !== "playwright";
        return (
          <Select
            value={record.crawler_type || "playwright"}
            onChange={(val) => handleSetCrawlerType(record.id, val)}
            size="small"
            variant="borderless"
            popupMatchSelectWidth={280}
            style={{ width: "100%" }}
            onClick={(e) => e.stopPropagation()}
            optionLabelProp="label"
            options={CRAWLER_PROVIDERS.map((p) => {
              const available = p.key === "playwright" || crawleeAvailable;
              return {
                value: p.key,
                label: (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{p.icon}</span>
                    <span style={{ color: p.color, fontWeight: 600, fontSize: 12 }}>{p.name}</span>
                    {!available && (
                      <WarningOutlined style={{ color: "#faad14", fontSize: 10 }} />
                    )}
                  </span>
                ),
              };
            })}
          />
        );
      },
    },
    {
      title: (
        <Tooltip title="Run browser without visible window">
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <EyeInvisibleOutlined /> Headless
          </span>
        </Tooltip>
      ),
      key: "headless",
      width: 100,
      align: "center" as const,
      render: (_: any, record: any) => {
        const provider = getProviderInfo(record.crawler_type || "playwright");
        if (!provider.headlessCapable) {
          return (
            <Tooltip title="N/A for this provider">
              <span style={{ color: "#444", fontSize: 11 }}>—</span>
            </Tooltip>
          );
        }
        return (
          <Switch
            size="small"
            checked={record.headless !== false}
            onChange={(checked) => handleToggleHeadless(record.id, checked)}
            checkedChildren={<EyeInvisibleOutlined />}
            unCheckedChildren={<EyeOutlined />}
            onClick={(_, e) => e.stopPropagation()}
          />
        );
      },
    },
    {
      title: "Actor",
      key: "actor",
      width: 180,
      render: (_: any, record: any) => {
        const currentActor = actors.find((a: any) => a.id === record.actor_id);
        return (
          <Select
            value={record.actor_id || undefined}
            onChange={(val) => handleAssignActor(record.id, val)}
            size="small"
            variant="borderless"
            placeholder="None"
            allowClear
            popupMatchSelectWidth={240}
            style={{ width: "100%" }}
            onClick={(e) => e.stopPropagation()}
            options={actors.map((a: any) => ({
              value: a.id,
              label: (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <RobotOutlined style={{ color: "#667eea" }} />
                  <span style={{ fontSize: 12 }}>{a.name}</span>
                </span>
              ),
            }))}
          />
        );
      },
    },
    {
      title: "Group",
      key: "group",
      width: 110,
      render: (_: any, record: any) => (
        <Tag
          style={{
            background: "rgba(102,126,234,0.1)",
            border: "1px solid rgba(102,126,234,0.2)",
            color: "#8a9cf7",
            borderRadius: 6,
            fontSize: 11,
          }}
        >
          {record.group || "default"}
        </Tag>
      ),
      filters: availableGroups.map((g) => ({ text: g, value: g })),
      onFilter: (value: any, record: any) => (record.group || "default") === value,
    },
    {
      title: "Tags",
      key: "tags",
      width: 150,
      render: (_: any, record: any) =>
        (record.tags || []).length > 0 ? (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(record.tags as string[]).slice(0, 3).map((t: string) => (
              <span key={t} className="tag-badge">{t}</span>
            ))}
            {record.tags.length > 3 && (
              <span className="tag-badge">+{record.tags.length - 3}</span>
            )}
          </div>
        ) : (
          <span style={{ color: "#444", fontSize: 11 }}>—</span>
        ),
    },
    {
      title: "Fingerprint",
      key: "fingerprint",
      width: 180,
      render: (_: any, record: any) => (
        <Tooltip title="Click to view fingerprint details">
          <div
            style={{
              padding: "3px 10px",
              borderRadius: 6,
              background: "rgba(102,126,234,0.06)",
              fontSize: 11,
              color: "#7888d4",
              cursor: "pointer",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 170,
            }}
            onClick={(e) => {
              e.stopPropagation();
              openDetail(record);
            }}
          >
            🔒 {record.fingerprint?.user_agent?.slice(0, 28) || "View fingerprint"}…
          </div>
        </Tooltip>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 190,
      fixed: "right" as const,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Tooltip title="View Details & Activity">
            <Button
              size="small"
              type="text"
              icon={<InfoCircleOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                openDetail(record);
              }}
              style={{ color: "#667eea" }}
            />
          </Tooltip>
          {record.status === "running" ? (
            <>
              <Tooltip title="Screenshot">
                <Button
                  size="small"
                  type="text"
                  icon={<CameraOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleScreenshot(record.id);
                  }}
                  style={{ color: "#13c2c2" }}
                />
              </Tooltip>
              <Tooltip title="Stop">
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<PauseCircleOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStop(record.id);
                  }}
                />
              </Tooltip>
            </>
          ) : (
            <Tooltip title="Launch Browser">
              <Button
                size="small"
                type="text"
                icon={<PlayCircleOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  openLaunchDialog(record);
                }}
                style={{ color: "#52c41a" }}
              />
            </Tooltip>
          )}
          <Tooltip title="Regenerate Fingerprint">
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                handleRegenFingerprint(record.id);
              }}
              style={{ color: "#888" }}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this profile?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => e.stopPropagation()}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="content-area">
      <div className="fade-in">
        {/* ── Page Header ── */}
        <div className="page-header">
          <div>
            <h2>Browser Profiles</h2>
            <p style={{ color: "#555", marginTop: 4, fontSize: 13 }}>
              {profiles.length} profile{profiles.length !== 1 ? "s" : ""} •{" "}
              {profiles.filter((p: any) => p.status === "running").length} active
            </p>
          </div>
          <Space>
            {selectedRowKeys.length > 0 && (
              <Popconfirm
                title={`Delete ${selectedRowKeys.length} profiles?`}
                onConfirm={handleBulkDelete}
              >
                <Button danger icon={<DeleteOutlined />}>
                  Delete ({selectedRowKeys.length})
                </Button>
              </Popconfirm>
            )}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              style={{
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                border: "none",
                height: 38,
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              New Profile
            </Button>
          </Space>
        </div>

        {/* ── Toolbar (search + filters) ── */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 16,
            alignItems: "center",
          }}
        >
          <Input
            placeholder="Search profiles…"
            prefix={<SearchOutlined style={{ color: "#555" }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{
              maxWidth: 280,
              background: "rgba(255,255,255,0.03)",
              borderColor: "rgba(255,255,255,0.08)",
              borderRadius: 8,
            }}
          />
          <Select
            placeholder="All Groups"
            allowClear
            value={filterGroup}
            onChange={(v) => setFilterGroup(v || null)}
            style={{ minWidth: 140 }}
            size="middle"
            options={availableGroups.map((g) => ({ value: g, label: g }))}
          />
          <Select
            placeholder="All Status"
            allowClear
            value={filterStatus}
            onChange={(v) => setFilterStatus(v || null)}
            style={{ minWidth: 130 }}
            size="middle"
            options={[
              { value: "running", label: "🟢 Running" },
              { value: "stopped", label: "⚫ Stopped" },
            ]}
          />
          <div style={{ flex: 1 }} />
          {/* Provider legend */}
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              fontSize: 11,
              color: "#555",
            }}
          >
            {CRAWLER_PROVIDERS.filter((p) => p.browserRequired).map((p) => (
              <Tooltip key={p.key} title={p.description}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: `${p.color}12`,
                    border: `1px solid ${p.color}25`,
                    cursor: "help",
                  }}
                >
                  <span>{p.icon}</span>
                  <span style={{ color: p.color, fontWeight: 600 }}>{p.name}</span>
                </span>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 80 }}>
            <Spin size="large" />
          </div>
        ) : profiles.length === 0 ? (
          <Empty description="No profiles yet" style={{ marginTop: 80 }}>
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              Create First Profile
            </Button>
          </Empty>
        ) : (
          <Table
            columns={columns}
            dataSource={filteredProfiles}
            rowKey="id"
            size="small"
            pagination={{
              pageSize: 15,
              showSizeChanger: true,
              showTotal: (total) => `${total} profiles`,
              size: "small",
            }}
            scroll={{ x: 1400 }}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys as string[]),
            }}
            onRow={(record) => ({
              onClick: () => openDetail(record),
              style: { cursor: "pointer" },
            })}
            className="profiles-table"
            style={{
              background: "rgba(255,255,255,0.02)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          />
        )}
      </div>

      {/* ── Create Modal ── */}
      <Modal
        title="Create Browser Profile"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="Create Profile"
        width={640}
        styles={{ body: { paddingTop: 16 } }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>
              Profile Name
            </label>
            <Input
              placeholder="e.g. Shopping Account #1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              onPressEnter={handleCreate}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>
                Operating System
              </label>
              <Select
                value={formOS}
                onChange={setFormOS}
                style={{ width: "100%" }}
                options={[
                  { value: "windows", label: "🪟 Windows" },
                  { value: "macos", label: "🍎 macOS" },
                  { value: "linux", label: "🐧 Linux" },
                ]}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>
                Group
              </label>
              <Input
                placeholder="default"
                value={formGroup}
                onChange={(e) => setFormGroup(e.target.value)}
              />
            </div>
          </div>

          {/* ── Scraper Provider ── */}
          <div>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 8, display: "block" }}>
              Scraper / Crawler Provider
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
              }}
            >
              {CRAWLER_PROVIDERS.map((p) => {
                const available = p.key === "playwright" || crawleeAvailable;
                return (
                  <Tooltip
                    key={p.key}
                    title={!available ? "Requires Crawlee — click Install below to enable" : p.description}
                  >
                    <div
                      onClick={() => setFormCrawlerType(p.key)}
                      style={{
                        padding: "10px 8px",
                        borderRadius: 10,
                        border: `1.5px solid ${formCrawlerType === p.key ? p.color : "rgba(255,255,255,0.08)"}`,
                        background:
                          formCrawlerType === p.key
                            ? `${p.color}15`
                            : "rgba(255,255,255,0.02)",
                        cursor: "pointer",
                        textAlign: "center",
                        transition: "all 0.2s ease",
                        opacity: available ? 1 : 0.5,
                        position: "relative",
                      }}
                    >
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{p.icon}</div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: formCrawlerType === p.key ? p.color : "#999",
                        }}
                      >
                        {p.name}
                      </div>
                      {p.browserRequired && (
                        <div style={{ fontSize: 9, color: "#555", marginTop: 2 }}>🌐 Browser</div>
                      )}
                      {!available && (
                        <div
                          style={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            fontSize: 10,
                          }}
                        >
                          <WarningOutlined style={{ color: "#faad14" }} />
                        </div>
                      )}
                    </div>
                  </Tooltip>
                );
              })}
            </div>
            {crawleeAvailable === false && formCrawlerType !== "playwright" && (
              <div
                style={{
                  marginTop: 8,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "rgba(250,173,20,0.08)",
                  border: "1px solid rgba(250,173,20,0.2)",
                  fontSize: 12,
                  color: "#faad14",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <WarningOutlined />
                  Crawlee is not installed. Required for this provider.
                </span>
                <Button
                  size="small"
                  type="primary"
                  icon={installingCrawlee ? <LoadingOutlined /> : <DownloadOutlined />}
                  loading={installingCrawlee}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInstallCrawlee();
                  }}
                  style={{
                    background: "linear-gradient(135deg, #667eea, #764ba2)",
                    border: "none",
                    borderRadius: 6,
                    fontWeight: 600,
                    fontSize: 11,
                  }}
                >
                  {installingCrawlee ? "Installing..." : "Install Crawlee"}
                </Button>
              </div>
            )}
          </div>

          {/* ── Headless toggle ── */}
          {getProviderInfo(formCrawlerType).headlessCapable && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e0e0e0" }}>
                  {formHeadless ? (
                    <>
                      <EyeInvisibleOutlined style={{ marginRight: 8 }} />
                      Headless Mode
                    </>
                  ) : (
                    <>
                      <EyeOutlined style={{ marginRight: 8 }} />
                      Visible Mode
                    </>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                  {formHeadless
                    ? "Browser runs in background without visible window"
                    : "Browser window will be visible on screen"}
                </div>
              </div>
              <Switch
                checked={formHeadless}
                onChange={setFormHeadless}
                checkedChildren="Headless"
                unCheckedChildren="Visible"
              />
            </div>
          )}

          {/* ── Actor selection ── */}
          <div>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>
              <RobotOutlined style={{ marginRight: 4 }} /> Assign Actor (optional)
            </label>
            <Select
              placeholder="Select an actor to run on this profile…"
              allowClear
              value={formActorId}
              onChange={setFormActorId}
              style={{ width: "100%" }}
              options={actors.map((a: any) => ({
                value: a.id,
                label: `${a.name} — ${a.description || a.id}`,
              }))}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>
              Tags
            </label>
            <Select
              mode="tags"
              placeholder="Add tags..."
              value={formTags}
              onChange={setFormTags}
              style={{ width: "100%" }}
            />
          </div>
        </div>
      </Modal>

      {/* ── Profile Detail Drawer ── */}
      <Drawer
        title={selectedProfile?.name || "Profile Details"}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedProfile(null);
          setProfileActivity([]);
        }}
        width={520}
      >
        {selectedProfile && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="ID">{selectedProfile.id}</Descriptions.Item>
              <Descriptions.Item label="OS">{selectedProfile.os_type}</Descriptions.Item>
              <Descriptions.Item label="Group">{selectedProfile.group}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <span className={`status-dot ${selectedProfile.status || "stopped"}`} />
                {selectedProfile.status || "stopped"}
              </Descriptions.Item>
              <Descriptions.Item label="Provider">
                {(() => {
                  const p = getProviderInfo(selectedProfile.crawler_type || "playwright");
                  return (
                    <span>
                      {p.icon} {p.name}{" "}
                      <span style={{ fontSize: 11, color: "#666" }}>— {p.description}</span>
                    </span>
                  );
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="Headless">
                {getProviderInfo(selectedProfile.crawler_type || "playwright").headlessCapable ? (
                  <Switch
                    size="small"
                    checked={selectedProfile.headless !== false}
                    onChange={(checked) => {
                      handleToggleHeadless(selectedProfile.id, checked);
                      setSelectedProfile({ ...selectedProfile, headless: checked });
                    }}
                    checkedChildren="Yes"
                    unCheckedChildren="No"
                  />
                ) : (
                  <span style={{ color: "#666" }}>N/A</span>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Actor">
                {(() => {
                  const actor = actors.find((a: any) => a.id === selectedProfile.actor_id);
                  return actor ? (
                    <span>
                      <RobotOutlined style={{ color: "#667eea", marginRight: 6 }} />
                      {actor.name}
                    </span>
                  ) : (
                    <span style={{ color: "#666" }}>None assigned</span>
                  );
                })()}
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 8 }}>
              <h4 style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>FINGERPRINT</h4>
              <div
                style={{
                  background: "#0d1117",
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 11,
                  fontFamily: "'SF Mono', Consolas, monospace",
                  color: "#8b949e",
                  maxHeight: 300,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(selectedProfile.fingerprint, null, 2)}
              </div>
            </div>

            {selectedProfile.proxy?.type !== "none" && (
              <Descriptions column={1} size="small" bordered title="Proxy">
                <Descriptions.Item label="Type">
                  {selectedProfile.proxy.type}
                </Descriptions.Item>
                <Descriptions.Item label="Host">
                  {selectedProfile.proxy.host}
                </Descriptions.Item>
                <Descriptions.Item label="Port">
                  {selectedProfile.proxy.port}
                </Descriptions.Item>
              </Descriptions>
            )}

            {/* ── Per-profile Activity Log ── */}
            <ProfileActivitySection
              profileId={selectedProfile.id}
              activity={profileActivity}
              loading={loadingActivity}
            />
          </div>
        )}
      </Drawer>

      {/* ── Screenshot Modal ── */}
      <Modal
        title="Live Screenshot"
        open={!!screenshot}
        onCancel={() => setScreenshot(null)}
        footer={null}
        width={800}
      >
        {screenshot && (
          <img
            src={`data:image/png;base64,${screenshot}`}
            alt="Browser screenshot"
            style={{ width: "100%", borderRadius: 8 }}
          />
        )}
      </Modal>

      {/* ══ Launch Options Modal ══ */}
      <Modal
        title={null}
        open={launchOpen}
        onCancel={() => setLaunchOpen(false)}
        width={560}
        footer={null}
        destroyOnClose
        styles={{
          body: { padding: 0 },
          mask: { backdropFilter: "blur(4px)" },
        }}
      >
        {launchProfileRecord && (
          <div style={{ padding: "0" }}>
            {/* ── Header ── */}
            <div
              style={{
                padding: "24px 28px 16px",
                background: "linear-gradient(135deg, rgba(102,126,234,0.12) 0%, rgba(118,75,162,0.08) 100%)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "linear-gradient(135deg, #667eea, #764ba2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  {launchProfileRecord.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0" }}>
                    <RocketOutlined style={{ marginRight: 8, color: "#667eea" }} />
                    Launch Browser
                  </div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                    {launchProfileRecord.name} • {launchProfileRecord.id}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: "20px 28px 24px" }}>
              {/* ── Section: Navigation ── */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                  <GlobalOutlined style={{ marginRight: 6 }} /> Navigation
                </div>
                <Input
                  placeholder="https://example.com (leave empty for blank page)"
                  value={launchStartUrl}
                  onChange={(e) => setLaunchStartUrl(e.target.value)}
                  prefix={<LinkOutlined style={{ color: "#555" }} />}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    borderColor: "rgba(255,255,255,0.08)",
                    borderRadius: 8,
                  }}
                />
              </div>

              <Divider style={{ margin: "0 0 16px", borderColor: "rgba(255,255,255,0.06)" }} />

              {/* ── Section: Engine ── */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                  <SettingOutlined style={{ marginRight: 6 }} /> Engine
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Provider</div>
                    <Select
                      value={launchCrawlerType}
                      onChange={setLaunchCrawlerType}
                      style={{ width: "100%" }}
                      popupMatchSelectWidth={280}
                      size="middle"
                      optionLabelProp="label"
                      options={CRAWLER_PROVIDERS.map((p) => ({
                        value: p.key,
                        label: (
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span>{p.icon}</span>
                            <span style={{ color: p.color, fontWeight: 600, fontSize: 12 }}>{p.name}</span>
                          </span>
                        ),
                      }))}
                    />
                  </div>
                  <div style={{ minWidth: 120 }}>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Visibility</div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 12px",
                        borderRadius: 8,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <Switch
                        size="small"
                        checked={launchHeadless}
                        onChange={setLaunchHeadless}
                        checkedChildren={<EyeInvisibleOutlined />}
                        unCheckedChildren={<EyeOutlined />}
                      />
                      <span style={{ fontSize: 12, color: "#aaa" }}>
                        {launchHeadless ? "Headless" : "Visible"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <Divider style={{ margin: "0 0 16px", borderColor: "rgba(255,255,255,0.06)" }} />

              {/* ── Section: Network ── */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                  🌐 Network
                </div>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Proxy</div>
                <Select
                  value={launchProxyId}
                  onChange={setLaunchProxyId}
                  placeholder="Profile default (no proxy override)"
                  allowClear
                  style={{ width: "100%" }}
                  size="middle"
                  options={[
                    ...(proxies || []).map((px: any) => ({
                      value: px.id,
                      label: (
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Badge
                            status={px.status === "alive" ? "success" : px.status === "dead" ? "error" : "default"}
                          />
                          <span style={{ fontSize: 12 }}>
                            {px.type}://{px.host}:{px.port}
                          </span>
                          {px.latency_ms && (
                            <span style={{ fontSize: 10, color: "#52c41a" }}>{px.latency_ms}ms</span>
                          )}
                        </span>
                      ),
                    })),
                  ]}
                />
              </div>

              <Divider style={{ margin: "0 0 16px", borderColor: "rgba(255,255,255,0.06)" }} />

              {/* ── Section: Automation & Session ── */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                  <RobotOutlined style={{ marginRight: 6 }} /> Automation & Session
                </div>

                <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Run Actor on Startup</div>
                    <Select
                      value={launchActorId}
                      onChange={setLaunchActorId}
                      placeholder="None"
                      allowClear
                      style={{ width: "100%" }}
                      size="middle"
                      options={actors.map((a: any) => ({
                        value: a.id,
                        label: (
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <RobotOutlined style={{ color: "#667eea" }} />
                            <span style={{ fontSize: 12 }}>{a.name}</span>
                          </span>
                        ),
                      }))}
                    />
                  </div>

                  <div style={{ minWidth: 160 }}>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Viewport</div>
                    <Select
                      value={launchViewport}
                      onChange={setLaunchViewport}
                      placeholder="Profile default"
                      allowClear
                      style={{ width: "100%" }}
                      size="middle"
                      options={[
                        { value: "1920x1080", label: "1920×1080 (Full HD)" },
                        { value: "1366x768", label: "1366×768 (Common)" },
                        { value: "1280x720", label: "1280×720 (HD)" },
                        { value: "1440x900", label: "1440×900 (Laptop)" },
                        { value: "2560x1440", label: "2560×1440 (2K)" },
                        { value: "375x812", label: "375×812 (Mobile)" },
                        { value: "768x1024", label: "768×1024 (Tablet)" },
                      ]}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 12px",
                      borderRadius: 8,
                      background: launchCleanSession ? "rgba(255,77,79,0.08)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${launchCleanSession ? "rgba(255,77,79,0.2)" : "rgba(255,255,255,0.06)"}`,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onClick={() => setLaunchCleanSession(!launchCleanSession)}
                  >
                    <Checkbox checked={launchCleanSession} onChange={(e) => setLaunchCleanSession(e.target.checked)} />
                    <div>
                      <div style={{ fontSize: 12, color: launchCleanSession ? "#ff7875" : "#aaa", fontWeight: 500 }}>Clean Session</div>
                      <div style={{ fontSize: 10, color: "#555" }}>Ignore saved cookies & storage</div>
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Session Label</div>
                    <Input
                      placeholder="Optional tag…"
                      value={launchSessionLabel}
                      onChange={(e) => setLaunchSessionLabel(e.target.value)}
                      size="small"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        borderColor: "rgba(255,255,255,0.08)",
                        borderRadius: 6,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer ── */}
            <div
              style={{
                padding: "16px 28px",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Button
                size="middle"
                icon={<ThunderboltOutlined />}
                onClick={handleQuickLaunch}
                loading={launching}
                style={{
                  borderRadius: 8,
                  borderColor: "rgba(255,255,255,0.1)",
                  color: "#aaa",
                }}
              >
                Quick Launch
              </Button>
              <Space>
                <Button onClick={() => setLaunchOpen(false)} style={{ borderRadius: 8 }}>
                  Cancel
                </Button>
                <Button
                  type="primary"
                  icon={<RocketOutlined />}
                  onClick={handleConfirmLaunch}
                  loading={launching}
                  style={{
                    background: "linear-gradient(135deg, #52c41a 0%, #237804 100%)",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 600,
                    boxShadow: "0 2px 12px rgba(82,196,26,0.3)",
                  }}
                >
                  Launch
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
