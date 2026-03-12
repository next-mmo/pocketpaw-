import { useState, useEffect, useMemo, useCallback } from "react";
import { useStore } from "../store";
import { api } from "../api";
import {
  Empty,
  Spin,
  Tag,
  Input,
  Select,
  Badge,
  Button,
  Popconfirm,
  message,
  Tooltip,
  Pagination,
} from "antd";
import {
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  UserOutlined,
  RobotOutlined,
  GlobalOutlined,
  CameraOutlined,
  EditOutlined,
  ClockCircleOutlined,
  ClearOutlined,
  SyncOutlined,
} from "@ant-design/icons";

const { Search } = Input;

interface ActivityEvent {
  id: number;
  profile_id: string;
  type: string;
  message: string;
  resource: string;
  meta: Record<string, any>;
  timestamp: number;
}

const EVENT_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; label: string }
> = {
  profile_created: {
    icon: <PlusOutlined />,
    color: "#667eea",
    label: "Profile",
  },
  profile_launched: {
    icon: <PlayCircleOutlined />,
    color: "#52c41a",
    label: "Profile",
  },
  profile_stopped: {
    icon: <PauseCircleOutlined />,
    color: "#888",
    label: "Profile",
  },
  profile_updated: {
    icon: <EditOutlined />,
    color: "#faad14",
    label: "Profile",
  },
  profile_deleted: {
    icon: <DeleteOutlined />,
    color: "#ff4d4f",
    label: "Profile",
  },
  fingerprint_regen: {
    icon: <ReloadOutlined />,
    color: "#f5576c",
    label: "Fingerprint",
  },
  screenshot_taken: {
    icon: <CameraOutlined />,
    color: "#13c2c2",
    label: "Screenshot",
  },
  actor_run_started: {
    icon: <ThunderboltOutlined />,
    color: "#1890ff",
    label: "Actor",
  },
  actor_run_completed: {
    icon: <CheckCircleOutlined />,
    color: "#52c41a",
    label: "Actor",
  },
  actor_run_failed: {
    icon: <CloseCircleOutlined />,
    color: "#ff4d4f",
    label: "Actor",
  },
  actor_installed: {
    icon: <RobotOutlined />,
    color: "#667eea",
    label: "Store",
  },
  team_member_added: {
    icon: <UserOutlined />,
    color: "#764ba2",
    label: "Team",
  },
  proxy_added: {
    icon: <GlobalOutlined />,
    color: "#faad14",
    label: "Proxy",
  },
  proxy_checked: {
    icon: <ReloadOutlined />,
    color: "#13c2c2",
    label: "Proxy",
  },
};

function timeAgo(ts: number): string {
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ActivityPage() {
  const profiles = useStore((s) => s.profiles);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [filterProfile, setFilterProfile] = useState<string | undefined>(
    undefined
  );
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const pageSize = 50;

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };
      if (filter !== "all") params.type = filter;
      if (filterProfile) params.profile_id = filterProfile;
      const data = await api.listActivity(params);
      setEvents(data.events || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      console.error("Failed to fetch activity:", e);
    } finally {
      setLoading(false);
    }
  }, [page, filter, filterProfile]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Auto-refresh every 10s
  useEffect(() => {
    const timer = setInterval(fetchActivity, 10_000);
    return () => clearInterval(timer);
  }, [fetchActivity]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchActivity();
    setRefreshing(false);
  };

  const handleClear = async () => {
    try {
      await api.clearActivity(filterProfile);
      message.success("Activity cleared");
      fetchActivity();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // Client-side search within loaded events
  const filteredEvents = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(
      (e) =>
        e.message.toLowerCase().includes(q) ||
        e.resource.toLowerCase().includes(q) ||
        e.profile_id.toLowerCase().includes(q)
    );
  }, [events, search]);

  // Group by date
  const groupedEvents = useMemo(() => {
    const groups: Record<string, ActivityEvent[]> = {};
    filteredEvents.forEach((e) => {
      const date = new Date(e.timestamp * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(e);
    });
    return groups;
  }, [filteredEvents]);

  // Unique event type options for filter
  const typeOptions = useMemo(() => {
    const uniqueTypes = new Set(events.map((e) => e.type));
    return [
      { value: "all", label: "All Events" },
      ...Array.from(uniqueTypes).map((t) => ({
        value: t,
        label: `${EVENT_CONFIG[t]?.icon ? "" : ""}${EVENT_CONFIG[t]?.label || t} — ${t.replace(/_/g, " ")}`,
      })),
    ];
  }, [events]);

  // Event badge counts
  const badgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredEvents.forEach((e) => {
      const label = (EVENT_CONFIG[e.type]?.label || "Other").toLowerCase();
      counts[label] = (counts[label] || 0) + 1;
    });
    return counts;
  }, [filteredEvents]);

  return (
    <div className="content-area">
      <div className="fade-in">
        {/* Header */}
        <div className="page-header">
          <div>
            <h2>
              <ClockCircleOutlined style={{ marginRight: 8 }} />
              Activity Log
            </h2>
            <p style={{ color: "#555", marginTop: 4, fontSize: 13 }}>
              {total} event{total !== 1 ? "s" : ""} tracked
              {filterProfile && " (filtered by profile)"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              icon={<SyncOutlined spin={refreshing} />}
              onClick={handleRefresh}
            >
              Refresh
            </Button>
            <Popconfirm
              title={
                filterProfile
                  ? "Clear activity for this profile?"
                  : "Clear all activity?"
              }
              onConfirm={handleClear}
            >
              <Button danger icon={<ClearOutlined />}>
                Clear
              </Button>
            </Popconfirm>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <Search
            placeholder="Search activity..."
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
            size="middle"
          />
          <Select
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
            style={{ width: 200 }}
            options={[
              { value: "all", label: "All Events" },
              { value: "profile_created", label: "➕ Profile Created" },
              { value: "profile_launched", label: "▶️ Profile Launched" },
              { value: "profile_stopped", label: "⏸️ Profile Stopped" },
              { value: "profile_updated", label: "✏️ Profile Updated" },
              { value: "profile_deleted", label: "🗑️ Profile Deleted" },
              { value: "fingerprint_regen", label: "🔒 Fingerprint Regen" },
              { value: "screenshot_taken", label: "📸 Screenshot" },
            ]}
          />
          <Select
            placeholder="All Profiles"
            allowClear
            value={filterProfile}
            onChange={(v) => {
              setFilterProfile(v);
              setPage(1);
            }}
            style={{ width: 200 }}
            options={profiles.map((p: any) => ({
              value: p.id,
              label: `${p.name} (${p.id})`,
            }))}
          />
        </div>

        {/* Event summary badges */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          {Object.entries(badgeCounts).map(([type, count]) => (
            <div
              key={type}
              style={{
                padding: "4px 14px",
                borderRadius: 20,
                fontSize: 12,
                cursor: "default",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "#777",
              }}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}{" "}
              <Badge
                count={count}
                size="small"
                style={{ marginLeft: 4, background: "#444" }}
              />
            </div>
          ))}
        </div>

        {/* Timeline */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <Spin size="large" />
          </div>
        ) : filteredEvents.length === 0 ? (
          <Empty
            description="No activity logged yet"
            style={{ marginTop: 60 }}
          />
        ) : (
          <div style={{ paddingBottom: 32 }}>
            {Object.entries(groupedEvents).map(([date, evts]) => (
              <div key={date} style={{ marginBottom: 24 }}>
                {/* Date header */}
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#555",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 12,
                    paddingLeft: 40,
                  }}
                >
                  {date}
                </div>

                {/* Events */}
                <div style={{ position: "relative" }}>
                  {/* Timeline line */}
                  <div
                    style={{
                      position: "absolute",
                      left: 15,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: 1,
                    }}
                  />

                  {evts.map((event) => {
                    const cfg = EVENT_CONFIG[event.type] || {
                      icon: <ThunderboltOutlined />,
                      color: "#888",
                      label: "System",
                    };

                    // Find profile name
                    const profile = profiles.find(
                      (p: any) => p.id === event.profile_id
                    );

                    return (
                      <div
                        key={event.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 14,
                          padding: "10px 0",
                          position: "relative",
                        }}
                      >
                        {/* Timeline dot */}
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: `${cfg.color}15`,
                            border: `1px solid ${cfg.color}30`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            color: cfg.color,
                            flexShrink: 0,
                            zIndex: 1,
                          }}
                        >
                          {cfg.icon}
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: "#e0e0e0",
                              lineHeight: 1.5,
                            }}
                          >
                            {event.message}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginTop: 4,
                              flexWrap: "wrap",
                            }}
                          >
                            <Tag
                              style={{
                                borderRadius: 4,
                                fontSize: 10,
                                margin: 0,
                                background: `${cfg.color}10`,
                                color: cfg.color,
                                border: `1px solid ${cfg.color}25`,
                              }}
                            >
                              {cfg.label}
                            </Tag>
                            {event.profile_id && profile && (
                              <Tag
                                style={{
                                  borderRadius: 4,
                                  fontSize: 10,
                                  margin: 0,
                                  background: "rgba(102,126,234,0.08)",
                                  color: "#8a9cf7",
                                  border: "1px solid rgba(102,126,234,0.2)",
                                }}
                              >
                                🛡️ {profile.name}
                              </Tag>
                            )}
                            {event.meta &&
                              Object.keys(event.meta).length > 0 && (
                                <Tooltip
                                  title={
                                    <pre
                                      style={{
                                        margin: 0,
                                        fontSize: 10,
                                        whiteSpace: "pre-wrap",
                                      }}
                                    >
                                      {JSON.stringify(event.meta, null, 2)}
                                    </pre>
                                  }
                                >
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: "#555",
                                      cursor: "help",
                                    }}
                                  >
                                    📋 details
                                  </span>
                                </Tooltip>
                              )}
                            <span style={{ fontSize: 11, color: "#444" }}>
                              <ClockCircleOutlined
                                style={{ marginRight: 3 }}
                              />
                              {timeAgo(event.timestamp)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {total > pageSize && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginTop: 24,
                }}
              >
                <Pagination
                  current={page}
                  pageSize={pageSize}
                  total={total}
                  onChange={(p) => setPage(p)}
                  size="small"
                  showSizeChanger={false}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
