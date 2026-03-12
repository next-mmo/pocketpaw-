import { useState, useEffect, useMemo } from "react";
import { useStore } from "../store";
import { Empty, Spin, Tag, Input, Select, Badge } from "antd";
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
  ChromeOutlined,
  ClockCircleOutlined,
  FilterOutlined,
} from "@ant-design/icons";

const { Search } = Input;

// ── Mock activity data (would come from backend in production) ──

interface ActivityEvent {
  id: string;
  type: "profile_created" | "profile_launched" | "profile_stopped" | "actor_run_started" | "actor_run_completed" | "actor_run_failed" | "team_member_added" | "proxy_added" | "proxy_checked" | "fingerprint_regen" | "actor_installed";
  message: string;
  resource: string;
  timestamp: number;
  meta?: Record<string, any>;
}

const EVENT_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  profile_created: { icon: <PlusOutlined />, color: "#667eea", label: "Profile" },
  profile_launched: { icon: <PlayCircleOutlined />, color: "#52c41a", label: "Profile" },
  profile_stopped: { icon: <PauseCircleOutlined />, color: "#888", label: "Profile" },
  actor_run_started: { icon: <ThunderboltOutlined />, color: "#1890ff", label: "Actor" },
  actor_run_completed: { icon: <CheckCircleOutlined />, color: "#52c41a", label: "Actor" },
  actor_run_failed: { icon: <CloseCircleOutlined />, color: "#ff4d4f", label: "Actor" },
  team_member_added: { icon: <UserOutlined />, color: "#764ba2", label: "Team" },
  proxy_added: { icon: <GlobalOutlined />, color: "#faad14", label: "Proxy" },
  proxy_checked: { icon: <ReloadOutlined />, color: "#13c2c2", label: "Proxy" },
  fingerprint_regen: { icon: <ReloadOutlined />, color: "#f5576c", label: "Fingerprint" },
  actor_installed: { icon: <RobotOutlined />, color: "#667eea", label: "Store" },
};

function generateMockActivity(profiles: any[], actors: any[], team: any[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const now = Date.now() / 1000;

  // Generate events from real data
  profiles.forEach((p, i) => {
    events.push({
      id: `pe-${p.id}`,
      type: "profile_created",
      message: `Profile "${p.name}" was created`,
      resource: p.name,
      timestamp: (p.created_at || now - (profiles.length - i) * 600),
    });
    if (p.status === "running") {
      events.push({
        id: `pl-${p.id}`,
        type: "profile_launched",
        message: `Browser launched for "${p.name}"`,
        resource: p.name,
        timestamp: (p.created_at || now) + 60,
      });
    }
  });

  actors.forEach((a, i) => {
    events.push({
      id: `ac-${a.id}`,
      type: "actor_installed",
      message: `Actor "${a.name}" was installed`,
      resource: a.name,
      timestamp: (a.created_at || now - (actors.length - i) * 400),
    });
  });

  team.forEach((t) => {
    events.push({
      id: `tm-${t.id}`,
      type: "team_member_added",
      message: `"${t.name}" joined as ${t.role}`,
      resource: t.name,
      timestamp: t.created_at || now - 1000,
    });
  });

  // Sort by timestamp descending
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

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
  const actors = useStore((s) => s.actors);
  const team = useStore((s) => s.team);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const events = useMemo(
    () => generateMockActivity(profiles, actors, team),
    [profiles, actors, team],
  );

  const filteredEvents = useMemo(() => {
    let result = events;
    if (filter !== "all") {
      result = result.filter((e) => EVENT_CONFIG[e.type]?.label.toLowerCase() === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          e.resource.toLowerCase().includes(q),
      );
    }
    return result;
  }, [events, filter, search]);

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
              {events.length} event{events.length !== 1 ? "s" : ""} tracked
            </p>
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
            onChange={setFilter}
            style={{ width: 160 }}
            options={[
              { value: "all", label: "All Events" },
              { value: "profile", label: "🛡️  Profiles" },
              { value: "actor", label: "🤖  Actors" },
              { value: "team", label: "👥  Team" },
              { value: "proxy", label: "🌐  Proxies" },
              { value: "store", label: "🛒  Store" },
              { value: "fingerprint", label: "🔒  Fingerprint" },
            ]}
          />
        </div>

        {/* Event summary badges */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
          {["profile", "actor", "team", "proxy", "store"].map((type) => {
            const count = events.filter((e) => EVENT_CONFIG[e.type]?.label.toLowerCase() === type).length;
            if (count === 0) return null;
            return (
              <div
                key={type}
                onClick={() => setFilter(filter === type ? "all" : type)}
                style={{
                  padding: "4px 14px",
                  borderRadius: 20,
                  fontSize: 12,
                  cursor: "pointer",
                  background: filter === type ? "rgba(102,126,234,0.15)" : "rgba(255,255,255,0.03)",
                  border: filter === type ? "1px solid rgba(102,126,234,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  color: filter === type ? "#b8c5ff" : "#777",
                  transition: "all 0.2s",
                }}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}{" "}
                <Badge count={count} size="small" style={{ marginLeft: 4, background: filter === type ? "#667eea" : "#444" }} />
              </div>
            );
          })}
        </div>

        {/* Timeline */}
        {filteredEvents.length === 0 ? (
          <Empty description="No activity found" style={{ marginTop: 60 }} />
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

                  {evts.map((event, i) => {
                    const cfg = EVENT_CONFIG[event.type] || { icon: <ThunderboltOutlined />, color: "#888", label: "System" };
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
                          <div style={{ fontSize: 13, color: "#e0e0e0", lineHeight: 1.5 }}>
                            {event.message}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
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
                            <span style={{ fontSize: 11, color: "#444" }}>
                              <ClockCircleOutlined style={{ marginRight: 3 }} />
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
          </div>
        )}
      </div>
    </div>
  );
}
