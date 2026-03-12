import { useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import {
  Button,
  Modal,
  Input,
  Select,
  message,
  Empty,
  Spin,
  Popconfirm,
  Space,
  Tag,
  Drawer,
  InputNumber,
  Badge,
} from "antd";
import {
  PlusOutlined,
  PlayCircleOutlined,
  DeleteOutlined,
  CodeOutlined,
  HistoryOutlined,
  RobotOutlined,
} from "@ant-design/icons";

const { TextArea } = Input;

const ACTOR_COLORS = [
  "#667eea", "#f5576c", "#00f2fe", "#43e97b", "#fa709a",
  "#764ba2", "#fccb90", "#a18cd1",
];

const DEFAULT_SCRIPT = `// Actor script — runs in each browser profile
// Available: document, window, input (from input_data)

// Example: scrape page title
const title = document.title;
const url = window.location.href;

// Return results (will be collected per-profile)
({ title, url, timestamp: Date.now() });
`;

export default function ActorsPage() {
  const actors = useStore((s) => s.actors);
  const profiles = useStore((s) => s.profiles);
  const loading = useStore((s) => s.loadingActors);
  const fetchActors = useStore((s) => s.fetchActors);
  const fetchStats = useStore((s) => s.fetchStats);

  const [createOpen, setCreateOpen] = useState(false);
  const [runsDrawer, setRunsDrawer] = useState<string | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  // Create form
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formScript, setFormScript] = useState(DEFAULT_SCRIPT);
  const [formProfiles, setFormProfiles] = useState<string[]>([]);
  const [formConcurrency, setFormConcurrency] = useState(5);
  const [creating, setCreating] = useState(false);

  // Run form
  const [runModalActor, setRunModalActor] = useState<any>(null);
  const [runProfiles, setRunProfiles] = useState<string[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setCreating(true);
    try {
      await api.createActor({
        name: formName,
        description: formDesc,
        script: formScript,
        profile_ids: formProfiles,
        max_concurrency: formConcurrency,
      });
      message.success("Actor created");
      setCreateOpen(false);
      setFormName("");
      setFormDesc("");
      setFormScript(DEFAULT_SCRIPT);
      setFormProfiles([]);
      fetchActors();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteActor(id);
      message.success("Actor deleted");
      fetchActors();
      fetchStats();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleRun = async () => {
    if (!runModalActor) return;
    setRunningId(runModalActor.id);
    try {
      const resp = await api.runActor(runModalActor.id, {
        profile_ids: runProfiles.length > 0 ? runProfiles : runModalActor.profile_ids,
        input_data: {},
      });
      message.success(`Run started — ID: ${resp.run?.id}`);
      setRunModalActor(null);
      setRunProfiles([]);
      fetchActors();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setRunningId(null);
    }
  };

  const openRuns = async (actorId: string) => {
    setRunsDrawer(actorId);
    setLoadingRuns(true);
    try {
      const resp = await api.listRuns(actorId);
      setRuns(resp.runs || []);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoadingRuns(false);
    }
  };

  return (
    <div className="content-area">
      <div className="fade-in">
        <div className="page-header">
          <div>
            <h2>Actors</h2>
            <p style={{ color: "#555", marginTop: 4, fontSize: 13 }}>
              Apify-style automation tasks that run across browser profiles
            </p>
          </div>
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
            New Actor
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>
        ) : actors.length === 0 ? (
          <Empty description="No actors yet" style={{ marginTop: 80 }}>
            <Button type="primary" onClick={() => setCreateOpen(true)}>Create First Actor</Button>
          </Empty>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
            {actors.map((actor: any, i: number) => (
              <div
                key={actor.id}
                className="glass-card"
                style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: `${ACTOR_COLORS[i % ACTOR_COLORS.length]}20`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                      flexShrink: 0,
                    }}
                  >
                    <RobotOutlined style={{ color: ACTOR_COLORS[i % ACTOR_COLORS.length] }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "#e0e0e0" }}>{actor.name}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                      {actor.description || "No description"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#555" }}>
                  <span>
                    <Badge color={ACTOR_COLORS[i % ACTOR_COLORS.length]} />
                    {" "}{actor.profile_ids?.length || 0} profiles
                  </span>
                  <span>⚡ {actor.max_concurrency || 5} concurrent</span>
                  <span>🔄 {actor.total_runs || 0} runs</span>
                </div>

                {/* Script preview */}
                <div
                  style={{
                    background: "#0d1117",
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 11,
                    fontFamily: "'SF Mono', Consolas, monospace",
                    color: "#8b949e",
                    maxHeight: 80,
                    overflow: "hidden",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {actor.script?.slice(0, 200) || "// No script"}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <Button
                    size="small"
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={() => { setRunModalActor(actor); setRunProfiles(actor.profile_ids || []); }}
                    style={{ background: "#52c41a", border: "none", flex: 1 }}
                  >
                    Run
                  </Button>
                  <Button
                    size="small"
                    icon={<HistoryOutlined />}
                    onClick={() => openRuns(actor.id)}
                  >
                    Runs
                  </Button>
                  <Popconfirm title="Delete actor?" onConfirm={() => handleDelete(actor.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create Actor Modal ── */}
      <Modal
        title="Create Actor"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="Create"
        width={700}
        styles={{ body: { paddingTop: 16 } }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Name</label>
              <Input
                placeholder="e.g. Google Maps Scraper"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Max Concurrency</label>
              <InputNumber
                min={1}
                max={50}
                value={formConcurrency}
                onChange={(v) => setFormConcurrency(v || 5)}
                style={{ width: "100%" }}
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>Description</label>
            <Input
              placeholder="What does this actor do?"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>
              Assign Profiles
            </label>
            <Select
              mode="multiple"
              placeholder="Select profiles to run this actor on..."
              value={formProfiles}
              onChange={setFormProfiles}
              style={{ width: "100%" }}
              options={profiles.map((p: any) => ({ value: p.id, label: `${p.name} (${p.id})` }))}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>
              <CodeOutlined /> Script (JavaScript — runs in each browser page)
            </label>
            <TextArea
              rows={12}
              value={formScript}
              onChange={(e) => setFormScript(e.target.value)}
              style={{
                fontFamily: "'SF Mono', Consolas, monospace",
                fontSize: 12,
                background: "#0d1117",
                color: "#c9d1d9",
                border: "1px solid #252540",
              }}
            />
          </div>
        </div>
      </Modal>

      {/* ── Run Actor Modal ── */}
      <Modal
        title={`Run: ${runModalActor?.name || ""}`}
        open={!!runModalActor}
        onCancel={() => { setRunModalActor(null); setRunProfiles([]); }}
        onOk={handleRun}
        confirmLoading={!!runningId}
        okText="Start Run"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
          <div>
            <label style={{ fontSize: 12, color: "#888", marginBottom: 4, display: "block" }}>
              Profiles to run on (override)
            </label>
            <Select
              mode="multiple"
              placeholder="Select profiles..."
              value={runProfiles}
              onChange={setRunProfiles}
              style={{ width: "100%" }}
              options={profiles.map((p: any) => ({ value: p.id, label: `${p.name} (${p.id})` }))}
            />
          </div>
          <p style={{ fontSize: 12, color: "#666" }}>
            The actor will launch each selected profile, execute the script, and collect results concurrently
            (max {runModalActor?.max_concurrency || 5} at a time).
          </p>
        </div>
      </Modal>

      {/* ── Runs Drawer ── */}
      <Drawer
        title="Run History"
        open={!!runsDrawer}
        onClose={() => setRunsDrawer(null)}
        width={480}
      >
        {loadingRuns ? (
          <Spin />
        ) : runs.length === 0 ? (
          <Empty description="No runs yet" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {runs.map((run: any) => (
              <div key={run.id} className="glass-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "#e0e0e0" }}>
                    Run {run.id}
                  </span>
                  <span className={`run-status ${run.status}`}>{run.status}</span>
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
                  {run.profile_ids?.length || 0} profiles •{" "}
                  {run.results?.length || 0} results •{" "}
                  {run.errors?.length || 0} errors
                </div>
                {run.started_at && (
                  <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>
                    Started: {new Date(run.started_at * 1000).toLocaleString()}
                    {run.finished_at && ` • Duration: ${((run.finished_at - run.started_at) / 1).toFixed(1)}s`}
                  </div>
                )}
                {run.errors?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {run.errors.map((err: any, ei: number) => (
                      <div key={ei} style={{ fontSize: 11, color: "#ff7875", background: "rgba(255,77,79,0.08)", padding: "4px 8px", borderRadius: 4, marginTop: 4 }}>
                        [{err.profile_id}] {err.error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
