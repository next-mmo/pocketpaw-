import { useEffect, useState } from "react";
import {
  ConfigProvider,
  theme,
  Tabs,
  Button,
  Input,
  Space,
  Tag,
  Tooltip,
  Modal,
  Form,
  Select,
  message,
  Spin,
  Empty,
  Badge,
  Switch,
} from "antd";
import {
  ConsoleSqlOutlined,
  FolderOutlined,
  SyncOutlined,
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ApiOutlined,
  CodeOutlined,
  RocketOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  ImportOutlined,
  SwapOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { useAppStore, API_BASE, PLUGIN_ID } from "./stores/appStore";

// ── Plugin status polling ───────────────────────────────────

function usePluginStatus() {
  const setPluginStatus = useAppStore((s) => s.setPluginStatus);
  const pluginStatus = useAppStore((s) => s.pluginStatus);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const poll = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/plugins/${PLUGIN_ID}/status`
        );
        if (res.ok) {
          const data = await res.json();
          setPluginStatus(data.status || "unknown");
        }
      } catch {
        setPluginStatus("error");
      }
    };
    poll();
    interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [setPluginStatus]);

  return pluginStatus;
}

// ── Status Tab ──────────────────────────────────────────────

function StatusTab() {
  const {
    status,
    statusLoading,
    fetchStatus,
    cwd,
    setCwd,
    fetchHome,
    homeDir,
  } = useAppStore();
  const [pathInput, setPathInput] = useState(cwd);

  useEffect(() => {
    fetchHome().then(() => fetchStatus());
  }, []);

  useEffect(() => {
    setPathInput(cwd);
  }, [cwd]);

  const handleGo = () => {
    if (pathInput.trim()) {
      setCwd(pathInput.trim());
      setTimeout(() => fetchStatus(), 50);
    }
  };

  const handleHome = () => {
    setCwd(homeDir);
    setPathInput(homeDir);
    setTimeout(() => fetchStatus(), 50);
  };

  return (
    <div>
      {/* Path bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <Tooltip title="Go to home directory">
          <Button icon={<HomeOutlined />} onClick={handleHome} />
        </Tooltip>
        <Input
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onPressEnter={handleGo}
          placeholder="Project directory path..."
          style={{ flex: 1 }}
          prefix={<FolderOutlined style={{ color: "#888" }} />}
        />
        <Button type="primary" onClick={handleGo} loading={statusLoading}>
          Scan
        </Button>
        <Tooltip title="Refresh">
          <Button icon={<ReloadOutlined />} onClick={fetchStatus} />
        </Tooltip>
      </div>

      {/* Sync diagram */}
      <div className="sync-diagram">
        <div className="source-box">
          <FolderOutlined /> .agents/
        </div>
        <div className="arrow">→</div>
        {status?.ides.map((ide) => (
          <div
            key={ide.name}
            className={`target-box ${ide.detected ? "detected" : ""}`}
          >
            {ide.label}
          </div>
        )) ?? (
          <>
            <div className="target-box">Cursor</div>
            <div className="target-box">Copilot</div>
            <div className="target-box">Windsurf</div>
            <div className="target-box">Gemini</div>
            <div className="target-box">Claude</div>
          </>
        )}
      </div>

      {statusLoading && !status ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : status ? (
        <div className="status-grid">
          {/* Global Skills */}
          <div className="status-card">
            <div className="card-header">
              <CodeOutlined style={{ color: "#52c41a" }} /> Global Skills
            </div>
            <div className="item-list">
              {status.global.skills.length > 0 ? (
                status.global.skills.map((s) => (
                  <div key={s.name} className="item-row">
                    <span className="dot green" />
                    <span className="item-name">{s.name}</span>
                    <span className="item-desc">{s.description}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">No global skills</div>
              )}
            </div>
          </div>

          {/* Workspace Skills */}
          <div className="status-card">
            <div className="card-header">
              <CodeOutlined style={{ color: "#1677ff" }} /> Workspace Skills
            </div>
            <div className="item-list">
              {status.workspace.skills.length > 0 ? (
                status.workspace.skills.map((s) => (
                  <div key={s.name} className="item-row">
                    <span className="dot blue" />
                    <span className="item-name">{s.name}</span>
                    <span className="item-desc">{s.description}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">No workspace skills</div>
              )}
            </div>
          </div>

          {/* Workflows */}
          <div className="status-card">
            <div className="card-header">
              <ThunderboltOutlined style={{ color: "#722ed1" }} /> Workflows
            </div>
            <div className="item-list">
              {[...status.global.workflows, ...status.workspace.workflows]
                .length > 0 ? (
                [...status.global.workflows, ...status.workspace.workflows].map(
                  (w) => (
                    <div key={w.name} className="item-row">
                      <span className="dot purple" />
                      <span className="item-name">{w.name}</span>
                      <span className="item-desc">{w.description}</span>
                    </div>
                  )
                )
              ) : (
                <div className="empty-state">No workflows</div>
              )}
            </div>
          </div>

          {/* Detected IDEs */}
          <div className="status-card">
            <div className="card-header">
              <ConsoleSqlOutlined style={{ color: "#faad14" }} /> Detected IDEs
            </div>
            <div className="item-list">
              {status.ides.map((ide) => (
                <div
                  key={ide.name}
                  className={`ide-row ${ide.detected ? "detected" : "not-detected"}`}
                >
                  <span className="ide-icon">
                    {ide.detected ? (
                      <CheckCircleOutlined style={{ color: "#52c41a" }} />
                    ) : (
                      <CloseCircleOutlined style={{ color: "#555" }} />
                    )}
                  </span>
                  <span className="ide-name">{ide.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RC Config */}
          <div className="status-card">
            <div className="card-header">
              <SettingOutlined style={{ color: "#13c2c2" }} /> Config (.agentrc)
            </div>
            <div className="item-list">
              {status.rc.filePath ? (
                <>
                  <div className="item-row">
                    <span className="item-name">targets</span>
                    <span className="item-desc">
                      {status.rc.config.targets.length > 0
                        ? status.rc.config.targets.join(", ")
                        : "auto-detect"}
                    </span>
                  </div>
                  <div className="item-row">
                    <span className="item-name">scope</span>
                    <span className="item-desc">{status.rc.config.scope}</span>
                  </div>
                  <div className="item-row">
                    <span className="item-name">gitignore</span>
                    <span className="item-desc">
                      {String(status.rc.config.gitignore)}
                    </span>
                  </div>
                  <div className="item-row">
                    <span className="item-name">mcp</span>
                    <span className="item-desc">
                      {String(status.rc.config.mcp)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="empty-state">No .agentrc found</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <Empty description="Enter a project path and click Scan" />
      )}
    </div>
  );
}

// ── Sync Tab ────────────────────────────────────────────────

function SyncTab() {
  const { syncResult, syncLoading, runSync, status, cwd } = useAppStore();
  const [target, setTarget] = useState("all");
  const [scope, setScope] = useState<string | undefined>(undefined);
  const [dryRun, setDryRun] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const detectedIdes = status?.ides.filter((i) => i.detected) ?? [];
  const targetOptions = [
    { value: "all", label: "All detected IDEs" },
    ...detectedIdes.map((i) => ({ value: i.name, label: i.label })),
  ];

  const handleSync = async () => {
    await runSync(target, scope, dryRun);
    if (!dryRun) messageApi.success("Sync complete!");
  };

  const totalFiles =
    syncResult?.targets.reduce((sum, t) => sum + t.files.length, 0) ?? 0;
  const createdFiles =
    syncResult?.targets.reduce(
      (sum, t) =>
        sum +
        t.files.filter(
          (f) => f.action === "created" || f.action === "would create"
        ).length,
      0
    ) ?? 0;
  const updatedFiles =
    syncResult?.targets.reduce(
      (sum, t) =>
        sum +
        t.files.filter(
          (f) => f.action === "updated" || f.action === "would update"
        ).length,
      0
    ) ?? 0;

  return (
    <div>
      {contextHolder}
      <div className="section-header">
        <h2>
          <SyncOutlined /> Sync to IDEs
        </h2>
      </div>

      <p
        style={{
          color: "#888",
          marginBottom: 16,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        Generate IDE-specific config files from your{" "}
        <code style={{ color: "#1677ff" }}>.agents/</code> directory. This
        creates files like <code>.cursor/rules/</code>,{" "}
        <code>.github/copilot-instructions.md</code>,{" "}
        <code>CLAUDE.md</code>, etc.
      </p>

      <div
        style={{
          padding: "12px 16px",
          background: "#1a1a1a",
          borderRadius: 8,
          border: "1px solid #2a2a2a",
          fontFamily: "monospace",
          fontSize: 12,
          color: "#1677ff",
          marginBottom: 16,
        }}
      >
        {cwd || "(set project path in Status tab)"}
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <Select
          value={target}
          onChange={setTarget}
          options={targetOptions}
          style={{ minWidth: 180 }}
        />
        <Select
          value={scope}
          onChange={setScope}
          placeholder="Scope (auto)"
          allowClear
          options={[
            { value: "workspace", label: "Workspace" },
            { value: "global", label: "Global" },
          ]}
          style={{ minWidth: 140 }}
        />
        <Space>
          <span style={{ fontSize: 12, color: "#888" }}>Dry run</span>
          <Switch size="small" checked={dryRun} onChange={setDryRun} />
        </Space>
        <Button
          type="primary"
          icon={<SyncOutlined />}
          loading={syncLoading}
          onClick={handleSync}
          disabled={!cwd}
        >
          {dryRun ? "Preview" : "Sync"}
        </Button>
      </div>

      {syncResult && (
        <div className="sync-results">
          {/* Summary */}
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            {syncResult.dryRun && (
              <Tag color="warning">DRY RUN — no files modified</Tag>
            )}
            <Badge
              count={createdFiles}
              color="#52c41a"
              overflowCount={99}
              showZero
            >
              <Tag>Created</Tag>
            </Badge>
            <Badge
              count={updatedFiles}
              color="#1677ff"
              overflowCount={99}
              showZero
            >
              <Tag>Updated</Tag>
            </Badge>
            <Badge
              count={totalFiles - createdFiles - updatedFiles}
              color="#555"
              overflowCount={99}
              showZero
            >
              <Tag>Unchanged</Tag>
            </Badge>
          </div>

          {/* Root files */}
          {syncResult.rootFiles.length > 0 && (
            <div className="status-card" style={{ marginBottom: 12 }}>
              <div className="card-header">
                <FileTextOutlined style={{ color: "#faad14" }} /> Root Files
              </div>
              <div className="item-list">
                {syncResult.rootFiles.map((f) => (
                  <div key={f.file} className="item-row">
                    <span
                      className={`dot ${f.action === "created" || f.action === "would create" ? "green" : f.action === "updated" || f.action === "would update" ? "blue" : "gray"}`}
                    />
                    <span className="item-name">{f.file}</span>
                    <span className="item-desc">{f.action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-target results */}
          {syncResult.targets.map((t) => (
            <div
              key={t.target}
              className="status-card"
              style={{ marginBottom: 12 }}
            >
              <div className="card-header">
                <SwapOutlined
                  style={{
                    color:
                      t.files.some(
                        (f) =>
                          f.action === "created" || f.action === "updated"
                      )
                        ? "#52c41a"
                        : "#888",
                  }}
                />{" "}
                {t.target}
                <span
                  style={{
                    fontSize: 11,
                    color: "#666",
                    fontWeight: 400,
                    textTransform: "none",
                    letterSpacing: 0,
                  }}
                >
                  &nbsp;({t.scope})
                </span>
              </div>
              <div className="item-list">
                {t.files.map((f) => (
                  <div key={f.path} className="item-row">
                    <span
                      className={`dot ${f.action === "created" || f.action === "would create" ? "green" : f.action === "updated" || f.action === "would update" ? "blue" : "gray"}`}
                    />
                    <span
                      className="item-name"
                      style={{
                        fontFamily:
                          "'SF Mono', 'Cascadia Code', Consolas, monospace",
                        fontSize: 12,
                      }}
                    >
                      {f.path}
                    </span>
                    <span className="item-desc">{f.action}</span>
                  </div>
                ))}
                {t.gitignore && (
                  <div className="item-row">
                    <span className="dot green" />
                    <span className="item-name">.gitignore</span>
                    <span className="item-desc">updated</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Convert Tab ─────────────────────────────────────────────

function ConvertTab() {
  const { convertResult, convertLoading, runConvert, cwd } = useAppStore();
  const [from, setFrom] = useState("cursor");
  const [scope, setScope] = useState("workspace");
  const [dryRun, setDryRun] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const handleConvert = async () => {
    await runConvert(from, scope, dryRun);
    if (!dryRun) messageApi.success("Convert complete!");
  };

  return (
    <div>
      {contextHolder}
      <div className="section-header">
        <h2>
          <ImportOutlined /> Convert IDE Config
        </h2>
      </div>

      <p
        style={{
          color: "#888",
          marginBottom: 16,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        Import existing IDE-specific configs into the universal{" "}
        <code style={{ color: "#1677ff" }}>.agents/</code> format. Currently
        supports converting <strong>Cursor</strong> rules (
        <code>.cursor/rules/*.mdc</code>) into{" "}
        <code>.agents/skills/</code>.
      </p>

      <div
        style={{
          padding: "12px 16px",
          background: "#1a1a1a",
          borderRadius: 8,
          border: "1px solid #2a2a2a",
          fontFamily: "monospace",
          fontSize: 12,
          color: "#1677ff",
          marginBottom: 16,
        }}
      >
        {cwd || "(set project path in Status tab)"}
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <Select
          value={from}
          onChange={setFrom}
          options={[{ value: "cursor", label: "Cursor (.mdc rules)" }]}
          style={{ minWidth: 200 }}
        />
        <Select
          value={scope}
          onChange={setScope}
          options={[
            { value: "workspace", label: "Save to Workspace" },
            { value: "global", label: "Save to Global" },
          ]}
          style={{ minWidth: 160 }}
        />
        <Space>
          <span style={{ fontSize: 12, color: "#888" }}>Dry run</span>
          <Switch size="small" checked={dryRun} onChange={setDryRun} />
        </Space>
        <Button
          type="primary"
          icon={<ImportOutlined />}
          loading={convertLoading}
          onClick={handleConvert}
          disabled={!cwd}
        >
          {dryRun ? "Preview" : "Convert"}
        </Button>
      </div>

      {convertResult && (
        <div className="init-result">
          {convertResult.dryRun && (
            <Tag color="warning" style={{ marginBottom: 8 }}>
              DRY RUN — no files modified
            </Tag>
          )}
          {convertResult.error && (
            <div
              style={{
                color: "#ff4d4f",
                fontSize: 12,
                padding: "4px 0",
              }}
            >
              ⚠ {convertResult.error}
            </div>
          )}
          {convertResult.created.map((f) => (
            <div key={f} className="file-entry created">
              <CheckCircleOutlined /> ✚ {f}
            </div>
          ))}
          {convertResult.skipped.map((f) => (
            <div key={f} className="file-entry skipped">
              — {f} (exists / empty)
            </div>
          ))}
          {convertResult.created.length === 0 &&
            convertResult.skipped.length === 0 &&
            !convertResult.error && (
              <div className="empty-state">
                No rules found to convert
              </div>
            )}
        </div>
      )}
    </div>
  );
}

// ── MCP Tab ─────────────────────────────────────────────────

function McpTab() {
  const { status, addMcpServer, removeMcpServer, fetchStatus } = useAppStore();
  const [addModal, setAddModal] = useState(false);
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const servers = status?.workspace?.mcpServers ?? {};
  const entries = Object.entries(servers);

  const handleAdd = async () => {
    try {
      const vals = await form.validateFields();
      const server: Record<string, unknown> = {};
      if (vals.serverType === "http") {
        server.type = "http";
        server.url = vals.url;
      } else {
        server.type = "stdio";
        server.command = vals.command;
        if (vals.args) server.args = vals.args.split(" ");
      }
      await addMcpServer(vals.name, server, vals.scope);
      messageApi.success(`Added "${vals.name}"`);
      setAddModal(false);
      form.resetFields();
    } catch {}
  };

  const handleRemove = async (name: string) => {
    await removeMcpServer(name);
    messageApi.success(`Removed "${name}"`);
  };

  return (
    <div>
      {contextHolder}
      <div className="section-header">
        <h2>
          <ApiOutlined /> MCP Servers
        </h2>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchStatus}
            size="small"
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModal(true)}
            size="small"
          >
            Add Server
          </Button>
        </Space>
      </div>

      {entries.length > 0 ? (
        entries.map(([name, server]) => (
          <div key={name} className="mcp-server-item">
            <ApiOutlined style={{ color: "#722ed1" }} />
            <span className="server-name">{name}</span>
            <Tag color="blue">
              {(server as any).type ??
                ((server as any).command ? "stdio" : "http")}
            </Tag>
            <span className="server-url">
              {(server as any).url ?? (server as any).command ?? ""}
            </span>
            <Tooltip title="Remove">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
                onClick={() => handleRemove(name)}
              />
            </Tooltip>
          </div>
        ))
      ) : (
        <Empty description="No MCP servers configured" />
      )}

      <Modal
        title="Add MCP Server"
        open={addModal}
        onOk={handleAdd}
        onCancel={() => setAddModal(false)}
        okText="Add"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ scope: "workspace", serverType: "http" }}
        >
          <Form.Item
            name="name"
            label="Server Name"
            rules={[{ required: true }]}
          >
            <Input placeholder="e.g. context7" />
          </Form.Item>
          <Form.Item name="scope" label="Scope">
            <Select
              options={[
                { value: "workspace", label: "Workspace" },
                { value: "global", label: "Global" },
              ]}
            />
          </Form.Item>
          <Form.Item name="serverType" label="Type">
            <Select
              options={[
                { value: "http", label: "HTTP" },
                { value: "stdio", label: "stdio" },
              ]}
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.serverType !== cur.serverType}
          >
            {({ getFieldValue }) =>
              getFieldValue("serverType") === "http" ? (
                <Form.Item name="url" label="URL" rules={[{ required: true }]}>
                  <Input placeholder="https://mcp.example.com/mcp" />
                </Form.Item>
              ) : (
                <>
                  <Form.Item
                    name="command"
                    label="Command"
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="npx -y @example/mcp@latest" />
                  </Form.Item>
                  <Form.Item name="args" label="Arguments">
                    <Input placeholder="--flag value (space-separated)" />
                  </Form.Item>
                </>
              )
            }
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ── Init Tab ────────────────────────────────────────────────

function InitTab() {
  const { initResult, initLoading, runInit, cwd } = useAppStore();

  return (
    <div>
      <div className="section-header">
        <h2>
          <RocketOutlined /> Initialize Project
        </h2>
      </div>
      <p style={{ color: "#888", marginBottom: 16, fontSize: 13 }}>
        Scaffold a new <code>.agents/</code> directory and <code>.agentrc</code>{" "}
        config in:
      </p>
      <div
        style={{
          padding: "8px 12px",
          background: "#1a1a1a",
          borderRadius: 8,
          border: "1px solid #2a2a2a",
          fontFamily: "monospace",
          fontSize: 12,
          color: "#1677ff",
          marginBottom: 16,
        }}
      >
        {cwd || "(set project path in Status tab)"}
      </div>
      <Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          loading={initLoading}
          onClick={() => runInit(false)}
          disabled={!cwd}
        >
          Initialize
        </Button>
        <Button
          icon={<SyncOutlined />}
          loading={initLoading}
          onClick={() => runInit(true)}
          disabled={!cwd}
        >
          Force Reinitialize
        </Button>
      </Space>

      {initResult && (
        <div className="init-result">
          {initResult.created.map((f) => (
            <div key={f} className="file-entry created">
              <CheckCircleOutlined /> ✚ {f}
            </div>
          ))}
          {initResult.skipped.map((f) => (
            <div key={f} className="file-entry skipped">
              — {f} (exists)
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Browse Tab ──────────────────────────────────────────────

function BrowseTab() {
  const { browseResult, browseLoading, browse, setCwd, cwd, fetchStatus } =
    useAppStore();
  const [currentPath, setCurrentPath] = useState("");

  useEffect(() => {
    browse(cwd || undefined);
  }, []);

  useEffect(() => {
    if (browseResult) setCurrentPath(browseResult.path);
  }, [browseResult]);

  const navigateTo = (p: string) => browse(p);

  const selectProject = (p: string) => {
    setCwd(p);
    fetchStatus();
  };

  return (
    <div>
      <div className="section-header">
        <h2>
          <FolderOpenOutlined /> Browse Directories
        </h2>
      </div>

      {browseResult && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <Button
              size="small"
              onClick={() => navigateTo(browseResult.parent)}
            >
              ↑ Up
            </Button>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 12,
                color: "#888",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {browseResult.path}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {browseResult.items
              .filter((item) => item.isDirectory)
              .map((item) => (
                <div
                  key={item.path}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    background: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                    borderRadius: 6,
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor =
                      "#404040")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor =
                      "#2a2a2a")
                  }
                >
                  <FolderOutlined
                    style={{ color: "#faad14" }}
                    onClick={() => navigateTo(item.path)}
                  />
                  <span
                    style={{ flex: 1, fontSize: 13, cursor: "pointer" }}
                    onClick={() => navigateTo(item.path)}
                  >
                    {item.name}
                    {item.name === ".agents" && (
                      <Tag
                        color="blue"
                        style={{ marginLeft: 8, fontSize: 10 }}
                      >
                        agent config
                      </Tag>
                    )}
                  </span>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => selectProject(item.path)}
                  >
                    Select
                  </Button>
                </div>
              ))}
          </div>
        </>
      )}

      {browseLoading && (
        <div style={{ textAlign: "center", padding: 20 }}>
          <Spin />
        </div>
      )}
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────

export default function App() {
  const pluginStatus = usePluginStatus();
  const isRunning = pluginStatus === "running";

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 8,
          colorBgContainer: "#1f1f1f",
          colorBgElevated: "#262626",
          colorBorder: "#303030",
          colorText: "#e0e0e0",
          colorTextSecondary: "#888",
          fontSize: 13,
        },
      }}
    >
      <div className="app-container">
        <div className="app-header">
          <ConsoleSqlOutlined style={{ fontSize: 20, color: "#1677ff" }} />
          <h1>Agent CLI</h1>
          <span className="version-badge">v1.0.0</span>
          <div style={{ flex: 1 }} />
          <Tag color={isRunning ? "success" : "warning"}>
            {isRunning ? "Running" : pluginStatus}
          </Tag>
        </div>

        <div className="app-content">
          {isRunning ? (
            <Tabs
              defaultActiveKey="status"
              items={[
                {
                  key: "status",
                  label: (
                    <span>
                      <SettingOutlined /> Status
                    </span>
                  ),
                  children: <StatusTab />,
                },
                {
                  key: "sync",
                  label: (
                    <span>
                      <SyncOutlined /> Sync
                    </span>
                  ),
                  children: <SyncTab />,
                },
                {
                  key: "convert",
                  label: (
                    <span>
                      <ImportOutlined /> Convert
                    </span>
                  ),
                  children: <ConvertTab />,
                },
                {
                  key: "mcp",
                  label: (
                    <span>
                      <ApiOutlined /> MCP
                    </span>
                  ),
                  children: <McpTab />,
                },
                {
                  key: "init",
                  label: (
                    <span>
                      <RocketOutlined /> Init
                    </span>
                  ),
                  children: <InitTab />,
                },
                {
                  key: "browse",
                  label: (
                    <span>
                      <FolderOpenOutlined /> Browse
                    </span>
                  ),
                  children: <BrowseTab />,
                },
              ]}
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "60%",
                gap: 16,
              }}
            >
              <Spin size="large" />
              <p style={{ color: "#888" }}>
                Waiting for Agent CLI server to start...
              </p>
              <p style={{ color: "#555", fontSize: 12 }}>
                Install the plugin first, then click Start.
              </p>
            </div>
          )}
        </div>
      </div>
    </ConfigProvider>
  );
}
