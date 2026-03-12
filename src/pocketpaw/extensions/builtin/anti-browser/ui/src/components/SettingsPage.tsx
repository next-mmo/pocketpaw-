import { useState, useEffect } from "react";
import { api } from "../api";
import {
  message,
  Switch,
  Slider,
  Select,
  Input,
  Button,
  Divider,
  InputNumber,
  Tag,
} from "antd";
import {
  SaveOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  SecurityScanOutlined,
  SettingOutlined,
  CloudServerOutlined,
  LockOutlined,
} from "@ant-design/icons";

interface SettingsState {
  general: {
    defaultOS: string;
    defaultBrowser: string;
    autoSaveInterval: number;
    maxConcurrentProfiles: number;
    headlessMode: boolean;
    devtoolsEnabled: boolean;
  };
  stealth: {
    canvasNoise: boolean;
    webglNoise: boolean;
    audioNoise: boolean;
    fontMasking: boolean;
    pluginMocking: boolean;
    webrtcBlock: boolean;
    timezoneSpoof: boolean;
    languageSpoof: boolean;
    hardwareConcurrencySpoof: boolean;
    deviceMemorySpoof: boolean;
  };
  proxy: {
    autoRotate: boolean;
    rotateInterval: number;
    healthCheckInterval: number;
    maxLatencyMs: number;
    retryOnFail: boolean;
  };
  actor: {
    defaultConcurrency: number;
    defaultTimeout: number;
    retryOnError: boolean;
    maxRetries: number;
    screenshotOnError: boolean;
  };
}

const DEFAULT_SETTINGS: SettingsState = {
  general: {
    defaultOS: "windows",
    defaultBrowser: "chromium",
    autoSaveInterval: 30,
    maxConcurrentProfiles: 10,
    headlessMode: false,
    devtoolsEnabled: false,
  },
  stealth: {
    canvasNoise: true,
    webglNoise: true,
    audioNoise: true,
    fontMasking: true,
    pluginMocking: true,
    webrtcBlock: true,
    timezoneSpoof: true,
    languageSpoof: true,
    hardwareConcurrencySpoof: true,
    deviceMemorySpoof: true,
  },
  proxy: {
    autoRotate: false,
    rotateInterval: 300,
    healthCheckInterval: 60,
    maxLatencyMs: 1000,
    retryOnFail: true,
  },
  actor: {
    defaultConcurrency: 5,
    defaultTimeout: 60,
    retryOnError: true,
    maxRetries: 3,
    screenshotOnError: true,
  },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [modified, setModified] = useState(false);

  const update = <S extends keyof SettingsState>(
    section: S,
    key: keyof SettingsState[S],
    value: any,
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
    setModified(true);
  };

  const handleSave = () => {
    setSaving(true);
    // Simulated save — in production this would hit the backend
    setTimeout(() => {
      setSaving(false);
      setModified(false);
      message.success("Settings saved successfully");
    }, 600);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setModified(true);
    message.info("Settings reset to defaults");
  };

  return (
    <div className="content-area">
      <div className="fade-in">
        {/* Header */}
        <div className="page-header">
          <div>
            <h2>
              <SettingOutlined style={{ marginRight: 8 }} />
              Settings
            </h2>
            <p style={{ color: "#555", marginTop: 4, fontSize: 13 }}>
              Configure anti-detection, proxy, and actor behavior
              {modified && (
                <Tag color="warning" style={{ marginLeft: 8, borderRadius: 4 }}>
                  Unsaved changes
                </Tag>
              )}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={handleReset}>Reset Defaults</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={!modified}
              onClick={handleSave}
              style={{
                background: modified
                  ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                  : undefined,
                border: "none",
                height: 38,
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              Save Settings
            </Button>
          </div>
        </div>

        {/* ── General ── */}
        <SectionHeader icon={<ThunderboltOutlined />} title="General" subtitle="Browser and profile defaults" />
        <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
          <SettingRow label="Default Operating System" description="OS fingerprint for new profiles">
            <Select
              value={settings.general.defaultOS}
              onChange={(v) => update("general", "defaultOS", v)}
              style={{ width: 160 }}
              options={[
                { value: "windows", label: "🪟 Windows" },
                { value: "macos", label: "🍎 macOS" },
                { value: "linux", label: "🐧 Linux" },
              ]}
            />
          </SettingRow>
          <SettingRow label="Default Browser" description="Browser engine for new profiles">
            <Select
              value={settings.general.defaultBrowser}
              onChange={(v) => update("general", "defaultBrowser", v)}
              style={{ width: 160 }}
              options={[
                { value: "chromium", label: "Chrome / Chromium" },
                { value: "firefox", label: "Firefox (planned)" },
              ]}
            />
          </SettingRow>
          <SettingRow label="Max Concurrent Profiles" description="Maximum simultaneously running browsers">
            <InputNumber
              min={1}
              max={50}
              value={settings.general.maxConcurrentProfiles}
              onChange={(v) => update("general", "maxConcurrentProfiles", v || 10)}
              style={{ width: 100 }}
            />
          </SettingRow>
          <SettingRow label="Auto-Save Interval" description="Save cookies/state every N seconds">
            <div style={{ width: 200 }}>
              <Slider
                min={10}
                max={120}
                value={settings.general.autoSaveInterval}
                onChange={(v) => update("general", "autoSaveInterval", v)}
                marks={{ 10: "10s", 60: "60s", 120: "2m" }}
              />
            </div>
          </SettingRow>
          <SettingRow label="Headless Mode" description="Run browsers without visible windows">
            <Switch
              checked={settings.general.headlessMode}
              onChange={(v) => update("general", "headlessMode", v)}
            />
          </SettingRow>
          <SettingRow label="DevTools" description="Enable Chrome DevTools on launch" last>
            <Switch
              checked={settings.general.devtoolsEnabled}
              onChange={(v) => update("general", "devtoolsEnabled", v)}
            />
          </SettingRow>
        </div>

        {/* ── Stealth / Anti-Detection ── */}
        <SectionHeader
          icon={<SecurityScanOutlined />}
          title="Anti-Detection Modules"
          subtitle="Toggle individual stealth techniques"
        />
        <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
          {Object.entries(settings.stealth).map(([key, val], i, arr) => (
            <SettingRow
              key={key}
              label={formatLabel(key)}
              description={STEALTH_DESC[key] || ""}
              last={i === arr.length - 1}
            >
              <Switch
                checked={val}
                onChange={(v) => update("stealth", key as keyof SettingsState["stealth"], v)}
              />
            </SettingRow>
          ))}
        </div>

        {/* ── Proxy ── */}
        <SectionHeader icon={<CloudServerOutlined />} title="Proxy" subtitle="Proxy rotation and health" />
        <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
          <SettingRow label="Auto-Rotate Proxies" description="Rotate proxy per profile session">
            <Switch
              checked={settings.proxy.autoRotate}
              onChange={(v) => update("proxy", "autoRotate", v)}
            />
          </SettingRow>
          <SettingRow label="Rotation Interval" description="Seconds between proxy rotations">
            <InputNumber
              min={30}
              max={3600}
              value={settings.proxy.rotateInterval}
              onChange={(v) => update("proxy", "rotateInterval", v || 300)}
              style={{ width: 120 }}
              addonAfter="sec"
            />
          </SettingRow>
          <SettingRow label="Health Check Interval" description="Check proxy health every N seconds">
            <InputNumber
              min={10}
              max={600}
              value={settings.proxy.healthCheckInterval}
              onChange={(v) => update("proxy", "healthCheckInterval", v || 60)}
              style={{ width: 120 }}
              addonAfter="sec"
            />
          </SettingRow>
          <SettingRow label="Max Latency" description="Skip proxies with latency above this" last>
            <InputNumber
              min={100}
              max={10000}
              value={settings.proxy.maxLatencyMs}
              onChange={(v) => update("proxy", "maxLatencyMs", v || 1000)}
              style={{ width: 120 }}
              addonAfter="ms"
            />
          </SettingRow>
        </div>

        {/* ── Actor ── */}
        <SectionHeader icon={<EyeOutlined />} title="Actor Execution" subtitle="Default actor run behavior" />
        <div className="glass-card" style={{ padding: 24, marginBottom: 32 }}>
          <SettingRow label="Default Concurrency" description="Max concurrent profile executions per actor run">
            <InputNumber
              min={1}
              max={50}
              value={settings.actor.defaultConcurrency}
              onChange={(v) => update("actor", "defaultConcurrency", v || 5)}
              style={{ width: 100 }}
            />
          </SettingRow>
          <SettingRow label="Default Timeout" description="Max seconds per profile script execution">
            <InputNumber
              min={10}
              max={600}
              value={settings.actor.defaultTimeout}
              onChange={(v) => update("actor", "defaultTimeout", v || 60)}
              style={{ width: 120 }}
              addonAfter="sec"
            />
          </SettingRow>
          <SettingRow label="Retry on Error" description="Automatically retry failed profile executions">
            <Switch
              checked={settings.actor.retryOnError}
              onChange={(v) => update("actor", "retryOnError", v)}
            />
          </SettingRow>
          <SettingRow label="Max Retries" description="Maximum retry attempts per profile">
            <InputNumber
              min={0}
              max={10}
              value={settings.actor.maxRetries}
              onChange={(v) => update("actor", "maxRetries", v || 3)}
              style={{ width: 100 }}
            />
          </SettingRow>
          <SettingRow label="Screenshot on Error" description="Capture screenshot when a profile script fails" last>
            <Switch
              checked={settings.actor.screenshotOnError}
              onChange={(v) => update("actor", "screenshotOnError", v)}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──

const STEALTH_DESC: Record<string, string> = {
  canvasNoise: "Inject subtle noise into canvas toDataURL to prevent canvas fingerprinting",
  webglNoise: "Spoof WebGL vendor and renderer to mask GPU hardware identity",
  audioNoise: "Add noise to AudioContext frequency data to prevent audio fingerprinting",
  fontMasking: "Limit and randomize font enumeration results",
  pluginMocking: "Mock navigator.plugins to match expected browser plugins",
  webrtcBlock: "Block WebRTC from leaking real local/public IP addresses",
  timezoneSpoof: "Override timezone to match proxy or profile locale",
  languageSpoof: "Override navigator.language and Accept-Language header",
  hardwareConcurrencySpoof: "Randomize navigator.hardwareConcurrency value",
  deviceMemorySpoof: "Randomize navigator.deviceMemory value",
};

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .replace("Webgl", "WebGL")
    .replace("Webrtc", "WebRTC");
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16, color: "#667eea" }}>{icon}</span>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#e0e0e0", margin: 0 }}>{title}</h3>
      </div>
      <p style={{ fontSize: 12, color: "#555", margin: "2px 0 0 24px" }}>{subtitle}</p>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
  last,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 0",
        borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#e0e0e0" }}>{label}</div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{description}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}
