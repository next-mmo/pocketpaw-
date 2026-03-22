import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FIELD_CLASS, MetricPill, PageHeader } from './common';

interface SettingsState {
  general: {
    defaultOS: string;
    defaultBrowser: string;
    autoSaveInterval: number;
    maxConcurrentProfiles: number;
    headlessMode: boolean;
    devtoolsEnabled: boolean;
  };
  stealth: Record<string, boolean>;
  proxy: {
    autoRotate: boolean;
    rotateInterval: number;
    healthCheckInterval: number;
    maxLatencyMs: number;
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
    defaultOS: 'windows',
    defaultBrowser: 'chromium',
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
  },
  actor: {
    defaultConcurrency: 5,
    defaultTimeout: 60,
    retryOnError: true,
    maxRetries: 3,
    screenshotOnError: true,
  },
};

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 py-3 last:border-b-0">
      <div className="space-y-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const modified = useMemo(() => {
    return JSON.stringify(settings) !== JSON.stringify(DEFAULT_SETTINGS);
  }, [settings]);

  const updateSection = <T extends keyof SettingsState>(
    section: T,
    key: keyof SettingsState[T],
    value: SettingsState[T][keyof SettingsState[T]],
  ) => {
    setSettings((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: value,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    setSaving(false);
    setSavedAt(Date.now());
  };

  return (
    <div className="flex flex-1 flex-col overflow-auto p-6">
      <PageHeader
        title="Settings"
        description="Tune default browser behavior, stealth modules, and execution limits."
        actions={
          <>
            <Button variant="outline" onClick={() => setSettings(DEFAULT_SETTINGS)}>
              Reset
            </Button>
            <Button disabled={saving || !modified} onClick={() => void handleSave()}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <MetricPill label="Stealth modules" value={Object.values(settings.stealth).filter(Boolean).length} />
        <MetricPill label="Default concurrency" value={settings.actor.defaultConcurrency} />
        <MetricPill
          label="Last save"
          value={savedAt ? new Date(savedAt).toLocaleTimeString() : 'Not saved'}
          tone={savedAt ? 'success' : 'warning'}
        />
      </div>

      <div className="mt-6 space-y-4">
        <Card className="border-border/60 bg-card/50 py-0">
          <CardHeader className="border-b border-border/50 py-4">
            <CardTitle className="text-base">General</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <SettingRow label="Default operating system" description="Used when creating new browser profiles.">
              <select
                value={settings.general.defaultOS}
                onChange={(event) => updateSection('general', 'defaultOS', event.target.value)}
                className={`${FIELD_CLASS} h-9 w-40`}
              >
                <option value="windows">Windows</option>
                <option value="macos">macOS</option>
                <option value="linux">Linux</option>
              </select>
            </SettingRow>
            <SettingRow label="Default browser" description="Preferred engine for newly created profiles.">
              <select
                value={settings.general.defaultBrowser}
                onChange={(event) => updateSection('general', 'defaultBrowser', event.target.value)}
                className={`${FIELD_CLASS} h-9 w-40`}
              >
                <option value="chromium">Chromium</option>
                <option value="firefox">Firefox</option>
              </select>
            </SettingRow>
            <SettingRow label="Auto-save interval" description="Persist session state every N seconds.">
              <input
                type="number"
                min={10}
                max={120}
                value={settings.general.autoSaveInterval}
                onChange={(event) => updateSection('general', 'autoSaveInterval', Number(event.target.value))}
                className={`${FIELD_CLASS} h-9 w-28`}
              />
            </SettingRow>
            <SettingRow label="Max concurrent profiles" description="Upper bound for simultaneously running browsers.">
              <input
                type="number"
                min={1}
                max={50}
                value={settings.general.maxConcurrentProfiles}
                onChange={(event) =>
                  updateSection('general', 'maxConcurrentProfiles', Number(event.target.value))
                }
                className={`${FIELD_CLASS} h-9 w-28`}
              />
            </SettingRow>
            <SettingRow label="Headless mode" description="Launch browsers without visible windows by default.">
              <input
                type="checkbox"
                checked={settings.general.headlessMode}
                onChange={(event) => updateSection('general', 'headlessMode', event.target.checked)}
              />
            </SettingRow>
            <SettingRow label="DevTools" description="Open Chromium DevTools automatically on launch.">
              <input
                type="checkbox"
                checked={settings.general.devtoolsEnabled}
                onChange={(event) => updateSection('general', 'devtoolsEnabled', event.target.checked)}
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50 py-0">
          <CardHeader className="border-b border-border/50 py-4">
            <CardTitle className="text-base">Stealth Modules</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {Object.entries(settings.stealth).map(([key, enabled]) => (
              <SettingRow
                key={key}
                label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())}
                description="Enable this anti-detection layer for newly launched sessions."
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) =>
                    updateSection('stealth', key as keyof SettingsState['stealth'], event.target.checked)
                  }
                />
              </SettingRow>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="border-border/60 bg-card/50 py-0">
            <CardHeader className="border-b border-border/50 py-4">
              <CardTitle className="text-base">Proxy</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <SettingRow label="Auto-rotate proxies" description="Rotate the proxy per profile session.">
                <input
                  type="checkbox"
                  checked={settings.proxy.autoRotate}
                  onChange={(event) => updateSection('proxy', 'autoRotate', event.target.checked)}
                />
              </SettingRow>
              <SettingRow label="Rotation interval" description="Seconds between automatic proxy rotations.">
                <input
                  type="number"
                  min={30}
                  max={3600}
                  value={settings.proxy.rotateInterval}
                  onChange={(event) => updateSection('proxy', 'rotateInterval', Number(event.target.value))}
                  className={`${FIELD_CLASS} h-9 w-28`}
                />
              </SettingRow>
              <SettingRow label="Health check interval" description="Seconds between proxy health checks.">
                <input
                  type="number"
                  min={10}
                  max={600}
                  value={settings.proxy.healthCheckInterval}
                  onChange={(event) =>
                    updateSection('proxy', 'healthCheckInterval', Number(event.target.value))
                  }
                  className={`${FIELD_CLASS} h-9 w-28`}
                />
              </SettingRow>
              <SettingRow label="Max latency" description="Skip proxies above this latency threshold in milliseconds.">
                <input
                  type="number"
                  min={100}
                  max={10000}
                  value={settings.proxy.maxLatencyMs}
                  onChange={(event) => updateSection('proxy', 'maxLatencyMs', Number(event.target.value))}
                  className={`${FIELD_CLASS} h-9 w-28`}
                />
              </SettingRow>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/50 py-0">
            <CardHeader className="border-b border-border/50 py-4">
              <CardTitle className="text-base">Actors</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <SettingRow label="Default concurrency" description="Maximum concurrent profile executions per actor run.">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.actor.defaultConcurrency}
                  onChange={(event) =>
                    updateSection('actor', 'defaultConcurrency', Number(event.target.value))
                  }
                  className={`${FIELD_CLASS} h-9 w-28`}
                />
              </SettingRow>
              <SettingRow label="Default timeout" description="Seconds before an actor execution is considered stale.">
                <input
                  type="number"
                  min={10}
                  max={600}
                  value={settings.actor.defaultTimeout}
                  onChange={(event) => updateSection('actor', 'defaultTimeout', Number(event.target.value))}
                  className={`${FIELD_CLASS} h-9 w-28`}
                />
              </SettingRow>
              <SettingRow label="Retry on error" description="Retry profile executions that fail unexpectedly.">
                <input
                  type="checkbox"
                  checked={settings.actor.retryOnError}
                  onChange={(event) => updateSection('actor', 'retryOnError', event.target.checked)}
                />
              </SettingRow>
              <SettingRow label="Max retries" description="Upper bound for automatic retries per profile.">
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={settings.actor.maxRetries}
                  onChange={(event) => updateSection('actor', 'maxRetries', Number(event.target.value))}
                  className={`${FIELD_CLASS} h-9 w-28`}
                />
              </SettingRow>
              <SettingRow label="Screenshot on error" description="Capture a browser screenshot when an actor fails.">
                <input
                  type="checkbox"
                  checked={settings.actor.screenshotOnError}
                  onChange={(event) => updateSection('actor', 'screenshotOnError', event.target.checked)}
                />
              </SettingRow>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
