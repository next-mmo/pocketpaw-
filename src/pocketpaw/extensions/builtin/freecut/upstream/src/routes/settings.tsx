import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import {
  RotateCcw,
  RefreshCw,
  Download,
  Loader2,
  Check,
  RotateCw,
  Sparkles,
  ExternalLink,
  Github,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { useSettingsStore } from "@/features/settings/stores/settings-store";
import { HOTKEYS, HOTKEY_DESCRIPTIONS, type HotkeyKey } from "@/config/hotkeys";
import { isElectronApp } from "@/types/electron-updater";
import type { UpdateEvent } from "@/types/electron-updater";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

// ── FFmpeg Setup Section ────────────────────────────────────────

interface FFmpegStatus {
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  ffmpegVersion: string;
  ffmpegPath: string | null;
  source: "user-download" | "system" | "none";
  needsSetup: boolean;
  platform: string;
  arch: string;
}

function FFmpegSetupSection() {
  const [status, setStatus] = useState<FFmpegStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const checkStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/ffmpeg/setup-status");
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch {
      // Backend not available (browser-only mode)
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setError("");
    try {
      const res = await fetch("/api/ffmpeg/download", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Download failed");
      } else {
        // Refresh status
        await checkStatus();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [checkStatus]);

  // Don't show if backend unavailable (browser-only mode)
  if (!loading && status === null) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold border-b border-border pb-2">
        FFmpeg
      </h2>

      <div className="grid gap-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 mr-4">
            <Label>FFmpeg Status</Label>
            {loading ? (
              <p className="text-sm text-muted-foreground">Checking...</p>
            ) : status?.ffmpegAvailable ? (
              <div className="flex items-center gap-2 mt-1">
                <Check className="w-4 h-4 text-emerald-500" />
                <p className="text-sm text-muted-foreground">
                  Installed — {status.ffmpegVersion || "unknown version"}
                  {status.source === "user-download" && " (app-managed)"}
                  {status.source === "system" && " (system)"}
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mt-1">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <p className="text-sm text-amber-500">
                    Not installed — required for GPU-accelerated exports
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  The editor still works without FFmpeg, but exports will use
                  slower browser-based encoding.
                </p>
              </div>
            )}
            {error && <p className="text-sm text-destructive mt-1">{error}</p>}
          </div>

          {!loading && status && !status.ffmpegAvailable && (
            <Button
              className="gap-2"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download FFmpeg
                </>
              )}
            </Button>
          )}
          {!loading && status?.ffmpegAvailable && (
            <Button variant="outline" className="gap-2" onClick={checkStatus}>
              <RefreshCw className="w-4 h-4" />
              Re-check
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function Settings() {
  const defaultFps = useSettingsStore((s) => s.defaultFps);
  const snapEnabled = useSettingsStore((s) => s.snapEnabled);
  const showWaveforms = useSettingsStore((s) => s.showWaveforms);
  const showFilmstrips = useSettingsStore((s) => s.showFilmstrips);
  const defaultExportFormat = useSettingsStore((s) => s.defaultExportFormat);
  const defaultExportQuality = useSettingsStore((s) => s.defaultExportQuality);
  const autoSaveInterval = useSettingsStore((s) => s.autoSaveInterval);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);

  // ── Auto-update state (Electron only) ────────────────────────
  const autoUpdate = useSettingsStore((s) => s.autoUpdate);
  const isElectron = isElectronApp();
  const [appVersion, setAppVersion] = useState<string>("");
  const [updateStatus, setUpdateStatus] = useState<
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error"
  >("idle");
  const [updateVersion, setUpdateVersion] = useState<string>("");
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [updateError, setUpdateError] = useState<string>("");

  useEffect(() => {
    if (!isElectron) return;
    const updater = window.electronUpdater!;

    updater.getVersion().then(setAppVersion);
    updater.getAutoUpdate().then((enabled) => {
      if (enabled !== autoUpdate) {
        setSetting("autoUpdate", enabled);
      }
    });

    const cleanup = updater.onUpdateEvent((event: UpdateEvent) => {
      switch (event.type) {
        case "checking":
          setUpdateStatus("checking");
          break;
        case "available":
          setUpdateStatus("available");
          setUpdateVersion(event.version ?? "");
          break;
        case "not-available":
          setUpdateStatus("not-available");
          setUpdateVersion(event.version ?? "");
          break;
        case "download-progress":
          setUpdateStatus("downloading");
          setDownloadPercent(event.percent ?? 0);
          break;
        case "downloaded":
          setUpdateStatus("downloaded");
          setUpdateVersion(event.version ?? "");
          break;
        case "error":
          setUpdateStatus("error");
          setUpdateError(event.message ?? "Unknown error");
          break;
      }
    });

    return cleanup;
  }, [isElectron, autoUpdate, setSetting]);

  const handleCheckForUpdates = useCallback(async () => {
    if (!isElectron) return;
    setUpdateStatus("checking");
    setUpdateError("");
    await window.electronUpdater!.checkForUpdates();
  }, [isElectron]);

  const handleDownloadUpdate = useCallback(async () => {
    if (!isElectron) return;
    setDownloadPercent(0);
    await window.electronUpdater!.downloadUpdate();
  }, [isElectron]);

  const handleInstallUpdate = useCallback(() => {
    if (!isElectron) return;
    window.electronUpdater!.quitAndInstall();
  }, [isElectron]);

  const handleToggleAutoUpdate = useCallback(
    async (enabled: boolean) => {
      setSetting("autoUpdate", enabled);
      if (isElectron) {
        await window.electronUpdater!.setAutoUpdate(enabled);
      }
    },
    [isElectron, setSetting],
  );

  // Format hotkey for display
  const formatHotkey = (hotkey: string): string => {
    return hotkey
      .replace("mod", navigator.platform.includes("Mac") ? "Cmd" : "Ctrl")
      .replace("alt", navigator.platform.includes("Mac") ? "Option" : "Alt")
      .replace("shift", "Shift")
      .split("+")
      .map((key) => key.charAt(0).toUpperCase() + key.slice(1))
      .join(" + ");
  };

  // Important shortcuts to display
  const importantShortcuts: HotkeyKey[] = [
    "PLAY_PAUSE",
    "SPLIT_AT_PLAYHEAD",
    "DELETE_SELECTED",
    "UNDO",
    "REDO",
    "COPY",
    "CUT",
    "PASTE",
    "SAVE",
    "ZOOM_TO_FIT",
    "TOGGLE_SNAP",
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Action bar */}
      <div className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <Button variant="outline" onClick={resetToDefaults}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to Defaults
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Updates Section — Electron only */}
        {isElectron && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold border-b border-border pb-2">
              Updates
            </h2>

            <div className="grid gap-4">
              {/* Current version */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>Current Version</Label>
                  <p className="text-sm text-muted-foreground">
                    FreeCut Desktop {appVersion || "..."}
                  </p>
                </div>
              </div>

              {/* Auto-update toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-update</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically download and install new versions
                  </p>
                </div>
                <Switch
                  checked={autoUpdate}
                  onCheckedChange={handleToggleAutoUpdate}
                />
              </div>

              {/* Check for updates */}
              <div className="flex items-center justify-between">
                <div className="flex-1 mr-4">
                  <Label>Check for Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    {updateStatus === "idle" &&
                      "Click to check for new versions"}
                    {updateStatus === "checking" && "Checking..."}
                    {updateStatus === "available" &&
                      `Version ${updateVersion} available!`}
                    {updateStatus === "not-available" && "You are up to date"}
                    {updateStatus === "downloading" &&
                      `Downloading ${updateVersion}...`}
                    {updateStatus === "downloaded" &&
                      `Version ${updateVersion} ready to install`}
                    {updateStatus === "error" && `Error: ${updateError}`}
                  </p>
                  {updateStatus === "downloading" && (
                    <div className="mt-2">
                      <Progress value={downloadPercent} className="h-1.5" />
                      <p className="text-xs text-muted-foreground mt-1">
                        {Math.round(downloadPercent)}%
                      </p>
                    </div>
                  )}
                </div>

                {updateStatus === "idle" && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={handleCheckForUpdates}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Check
                  </Button>
                )}
                {updateStatus === "checking" && (
                  <Button variant="outline" className="gap-2" disabled>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking
                  </Button>
                )}
                {updateStatus === "available" && (
                  <Button className="gap-2" onClick={handleDownloadUpdate}>
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                )}
                {updateStatus === "downloading" && (
                  <Button variant="outline" className="gap-2" disabled>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {Math.round(downloadPercent)}%
                  </Button>
                )}
                {updateStatus === "not-available" && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={handleCheckForUpdates}
                  >
                    <Check className="w-4 h-4" />
                    Up to date
                  </Button>
                )}
                {updateStatus === "downloaded" && (
                  <Button className="gap-2" onClick={handleInstallUpdate}>
                    <Sparkles className="w-4 h-4" />
                    Restart & Update
                  </Button>
                )}
                {updateStatus === "error" && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={handleCheckForUpdates}
                  >
                    <RotateCw className="w-4 h-4" />
                    Retry
                  </Button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* FFmpeg Setup Section */}
        <FFmpegSetupSection />

        {/* General Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-border pb-2">
            General
          </h2>

          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-save Interval</Label>
                <p className="text-sm text-muted-foreground">
                  {autoSaveInterval === 0
                    ? "Disabled"
                    : `Every ${autoSaveInterval} minutes`}
                </p>
              </div>
              <div className="w-40 flex items-center gap-2">
                <Slider
                  value={[autoSaveInterval]}
                  onValueChange={([v]) =>
                    setSetting("autoSaveInterval", v ?? 0)
                  }
                  onValueCommit={() => {
                    if (document.activeElement instanceof HTMLElement) {
                      document.activeElement.blur();
                    }
                  }}
                  min={0}
                  max={30}
                  step={5}
                />
                <span className="text-sm text-muted-foreground w-8">
                  {autoSaveInterval}m
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Timeline Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-border pb-2">
            Timeline
          </h2>

          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Default FPS</Label>
                <p className="text-sm text-muted-foreground">
                  Frame rate for new projects
                </p>
              </div>
              <Select
                value={String(defaultFps)}
                onValueChange={(v) => setSetting("defaultFps", parseInt(v))}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24 fps</SelectItem>
                  <SelectItem value="25">25 fps</SelectItem>
                  <SelectItem value="30">30 fps (Standard)</SelectItem>
                  <SelectItem value="50">50 fps</SelectItem>
                  <SelectItem value="60">60 fps</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Snap to Grid</Label>
                <p className="text-sm text-muted-foreground">
                  Snap clips to other clips and markers
                </p>
              </div>
              <Switch
                checked={snapEnabled}
                onCheckedChange={(v) => setSetting("snapEnabled", v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Show Waveforms</Label>
                <p className="text-sm text-muted-foreground">
                  Display audio waveforms on clips
                </p>
              </div>
              <Switch
                checked={showWaveforms}
                onCheckedChange={(v) => setSetting("showWaveforms", v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Show Filmstrips</Label>
                <p className="text-sm text-muted-foreground">
                  Display video thumbnails on clips
                </p>
              </div>
              <Switch
                checked={showFilmstrips}
                onCheckedChange={(v) => setSetting("showFilmstrips", v)}
              />
            </div>
          </div>
        </section>

        {/* Export Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-border pb-2">
            Export Defaults
          </h2>

          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Default Format</Label>
                <p className="text-sm text-muted-foreground">
                  Video format for exports
                </p>
              </div>
              <Select
                value={defaultExportFormat}
                onValueChange={(v) =>
                  setSetting("defaultExportFormat", v as "mp4" | "webm")
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4 (H.264)</SelectItem>
                  <SelectItem value="webm">WebM (VP9)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Default Quality</Label>
                <p className="text-sm text-muted-foreground">
                  Video quality for exports
                </p>
              </div>
              <Select
                value={defaultExportQuality}
                onValueChange={(v) =>
                  setSetting(
                    "defaultExportQuality",
                    v as "low" | "medium" | "high" | "ultra",
                  )
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="ultra">Ultra</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Keyboard Shortcuts Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-border pb-2">
            Keyboard Shortcuts
          </h2>

          <div className="grid gap-2">
            {importantShortcuts.map((key) => (
              <div key={key} className="flex items-center justify-between py-2">
                <span className="text-sm">{HOTKEY_DESCRIPTIONS[key]}</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                  {formatHotkey(HOTKEYS[key])}
                </kbd>
              </div>
            ))}
          </div>
        </section>

        {/* About Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-border pb-2">
            About
          </h2>

          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>FreeCut</Label>
                <p className="text-sm text-muted-foreground">
                  Open Source Video Editor
                  {isElectron && appVersion ? ` • v${appVersion}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <a
                    href="https://github.com/peopleinfo/freecut"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github className="w-4 h-4" />
                    GitHub
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <Link to="/about">
                    <ExternalLink className="w-4 h-4" />
                    Learn More
                  </Link>
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Built with React, TypeScript, Vite, and FFmpeg. Licensed under
              MIT.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
