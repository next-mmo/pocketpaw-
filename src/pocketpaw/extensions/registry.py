from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from pocketpaw.extensions.sandbox import (
    InstallConfig,
    InstallStep,
    SandboxConfig,
    SandboxManager,
    StartConfig,
    TorchConfig,
)

from pocketpaw.config import Settings, get_config_dir

logger = logging.getLogger(__name__)

ALLOWED_EXTENSION_SCOPES = frozenset(
    {
        "storage.read",
        "storage.write",
        "chat.send",
        "chat.stream",
        "sessions.read",
        "host.navigate",
        "host.open_chat",
    }
)


def get_builtin_extensions_dir() -> Path:
    return Path(__file__).resolve().parent / "builtin"


def get_external_extensions_dir() -> Path:
    path = get_config_dir() / "extensions"
    path.mkdir(parents=True, exist_ok=True)
    return path


class ExtensionManifest(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{1,63}$")
    name: str = Field(min_length=1, max_length=80)
    version: str = Field(min_length=1, max_length=32)
    description: str = Field(default="", max_length=280)
    icon: str | None = Field(default=None, max_length=64)
    route: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,63}$")
    entry: str = Field(min_length=1, max_length=256)
    scopes: list[str] = Field(default_factory=list)
    autostart: bool = Field(
        default=True,
        description="If false, the extension is disabled by default and must be manually enabled",
    )
    type: Literal["spa", "plugin"] = Field(
        default="spa",
        description="Extension type: 'spa' for frontend-only, 'plugin' for sandboxed Python+CUDA",
    )
    sandbox: SandboxConfig | None = Field(
        default=None,
        description="Sandbox configuration for plugin-type extensions",
    )
    install: InstallConfig | None = Field(
        default=None,
        description="Installation steps for plugin-type extensions",
    )
    start: StartConfig | None = Field(
        default=None,
        description="Start/daemon configuration for plugin-type extensions",
    )

    @field_validator("entry")
    @classmethod
    def _validate_entry(cls, value: str) -> str:
        path = Path(value)
        if path.is_absolute():
            raise ValueError("entry must be a relative path")
        if ".." in path.parts:
            raise ValueError("entry may not traverse outside the extension root")
        return value.replace("\\", "/")

    @field_validator("scopes")
    @classmethod
    def _validate_scopes(cls, value: list[str]) -> list[str]:
        unknown = sorted(set(value) - ALLOWED_EXTENSION_SCOPES)
        if unknown:
            raise ValueError(f"unknown scopes: {', '.join(unknown)}")
        return list(dict.fromkeys(value))


@dataclass(slots=True)
class ExtensionLoadError:
    source: str
    message: str


@dataclass
class ExtensionRecord:
    manifest: ExtensionManifest
    source: str
    root_dir: Path
    entry_path: Path
    enabled: bool
    _sandbox_manager: SandboxManager | None = field(default=None, repr=False)

    @property
    def id(self) -> str:
        return self.manifest.id

    @property
    def route(self) -> str:
        return self.manifest.route

    @property
    def is_plugin(self) -> bool:
        """Whether this extension is a full plugin (vs SPA-only)."""
        return self.manifest.type == "plugin"

    @property
    def is_removable(self) -> bool:
        """External (uploaded) extensions can be removed; built-ins cannot."""
        return self.source == "external"

    @property
    def is_installed(self) -> bool:
        """For plugins, check if the sandbox venv exists."""
        if not self.is_plugin:
            return True  # SPAs are always "installed"
        mgr = self.get_sandbox_manager()
        return mgr.is_installed if mgr else True

    def get_sandbox_manager(self) -> SandboxManager | None:
        """Get or create the SandboxManager for this plugin."""
        if not self.is_plugin or self.manifest.sandbox is None:
            return None
        if self._sandbox_manager is None:
            self._sandbox_manager = SandboxManager(
                plugin_root=self.root_dir,
                config=self.manifest.sandbox,
            )
        return self._sandbox_manager

    def to_summary(self) -> dict[str, object]:
        summary: dict[str, object] = {
            "id": self.manifest.id,
            "name": self.manifest.name,
            "version": self.manifest.version,
            "description": self.manifest.description,
            "icon": self.manifest.icon,
            "route": self.manifest.route,
            "entry": self.manifest.entry,
            "scopes": list(self.manifest.scopes),
            "autostart": self.manifest.autostart,
            "enabled": self.enabled,
            "source": self.source,
            "is_removable": self.is_removable,
            "asset_base": f"/extensions/{self.manifest.id}/",
            "type": self.manifest.type,
            "is_plugin": self.is_plugin,
            "is_installed": self.is_installed,
        }
        if self.manifest.sandbox:
            summary["sandbox"] = {
                "python": self.manifest.sandbox.python,
                "cuda": self.manifest.sandbox.cuda,
                "has_torch": self.manifest.sandbox.torch is not None,
            }
        if self.manifest.start:
            summary["has_start"] = True
            summary["daemon"] = self.manifest.start.daemon
        return summary


class ExtensionRegistry:
    def __init__(
        self,
        builtin_root: Path | None = None,
        external_root: Path | None = None,
    ) -> None:
        self.builtin_root = builtin_root or get_builtin_extensions_dir()
        self.external_root = external_root or get_external_extensions_dir()
        self.extensions: dict[str, ExtensionRecord] = {}
        self.route_map: dict[str, str] = {}
        self.errors: list[ExtensionLoadError] = []

    def reload(self, settings: Settings | None = None) -> ExtensionRegistry:
        settings = settings or Settings.load()
        self.extensions = {}
        self.route_map = {}
        self.errors = []

        disabled_ids = set(settings.extension_disabled_ids)
        enabled_ids = set(settings.extension_enabled_ids)

        for source, root in (("builtin", self.builtin_root), ("external", self.external_root)):
            self._scan_root(
                source=source,
                root=root,
                disabled_ids=disabled_ids,
                enabled_ids=enabled_ids,
            )

        return self

    def list_extensions(self) -> list[ExtensionRecord]:
        return sorted(
            self.extensions.values(),
            key=lambda item: (item.manifest.name.lower(), item.id),
        )

    def get(self, extension_id: str) -> ExtensionRecord | None:
        return self.extensions.get(extension_id)

    def get_by_route(self, route: str) -> ExtensionRecord | None:
        extension_id = self.route_map.get(route)
        if extension_id is None:
            return None
        return self.extensions.get(extension_id)

    def get_enabled(self, extension_id: str) -> ExtensionRecord | None:
        record = self.get(extension_id)
        if record is None or not record.enabled:
            return None
        return record

    def resolve_asset_path(self, extension_id: str, asset_path: str | None = None) -> Path:
        record = self.get_enabled(extension_id)
        if record is None:
            raise FileNotFoundError(f"Unknown or disabled extension: {extension_id}")

        requested = (asset_path or "").strip("/")
        relative = Path(record.manifest.entry if not requested else requested)
        candidate = (record.root_dir / relative).resolve()

        try:
            candidate.relative_to(record.root_dir.resolve())
        except ValueError as exc:
            raise FileNotFoundError("Asset path escapes extension root") from exc

        if candidate.is_dir():
            candidate = record.entry_path

        if not candidate.exists() or not candidate.is_file():
            raise FileNotFoundError(f"Asset not found: {asset_path or record.manifest.entry}")

        return candidate

    def _scan_root(
        self,
        source: str,
        root: Path,
        disabled_ids: set[str],
        enabled_ids: set[str],
    ) -> None:
        if not root.exists():
            return

        for extension_dir in sorted(path for path in root.iterdir() if path.is_dir()):
            manifest_path = extension_dir / "extension.json"
            if not manifest_path.exists():
                continue
            self._load_manifest(
                source=source,
                extension_dir=extension_dir,
                manifest_path=manifest_path,
                disabled_ids=disabled_ids,
                enabled_ids=enabled_ids,
            )

    def _load_manifest(
        self,
        *,
        source: str,
        extension_dir: Path,
        manifest_path: Path,
        disabled_ids: set[str],
        enabled_ids: set[str],
    ) -> None:
        try:
            raw = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            self.errors.append(
                ExtensionLoadError(str(manifest_path), f"failed to read manifest: {exc}")
            )
            return

        try:
            manifest = ExtensionManifest.model_validate(raw)
        except ValidationError as exc:
            self.errors.append(ExtensionLoadError(str(manifest_path), str(exc)))
            return

        if manifest.id in self.extensions:
            existing = self.extensions[manifest.id]
            # Allow external extensions to shadow/override built-in ones
            if source == "external" and existing.source == "builtin":
                logger.info(
                    "External extension '%s' overrides built-in version",
                    manifest.id,
                )
                # Remove old route mapping so the new one can take its place
                old_route = existing.manifest.route
                if old_route in self.route_map:
                    del self.route_map[old_route]
                del self.extensions[manifest.id]
            else:
                self.errors.append(
                    ExtensionLoadError(str(manifest_path), f"duplicate extension id: {manifest.id}")
                )
                return

        if manifest.route in self.route_map:
            self.errors.append(
                ExtensionLoadError(
                    str(manifest_path),
                    f"duplicate extension route: {manifest.route}",
                )
            )
            return

        try:
            entry_path = (extension_dir / manifest.entry).resolve()
            entry_path.relative_to(extension_dir.resolve())
        except ValueError:
            self.errors.append(
                ExtensionLoadError(str(manifest_path), "entry resolves outside the extension root")
            )
            return

        # For SPA extensions, the entry file MUST exist.
        # For plugins, the entry file may not exist yet (built during install).
        entry_exists = entry_path.exists() and entry_path.is_file()
        is_plugin = raw.get("type") == "plugin"

        if not entry_exists and not is_plugin:
            self.errors.append(
                ExtensionLoadError(
                    str(manifest_path), f"entry file does not exist: {manifest.entry}"
                )
            )
            return

        # Determine enabled state:
        #   - If explicitly disabled → disabled
        #   - If autostart=true → enabled by default (unless explicitly disabled)
        #   - If autostart=false → disabled by default (unless explicitly enabled)
        if manifest.id in disabled_ids:
            is_enabled = False
        elif manifest.autostart:
            is_enabled = True
        else:
            is_enabled = manifest.id in enabled_ids

        record = ExtensionRecord(
            manifest=manifest,
            source=source,
            root_dir=extension_dir.resolve(),
            entry_path=entry_path,
            enabled=is_enabled,
        )
        self.extensions[manifest.id] = record
        self.route_map[manifest.route] = manifest.id


_REGISTRY: ExtensionRegistry | None = None


def get_extension_registry(force_reload: bool = False) -> ExtensionRegistry:
    global _REGISTRY  # noqa: PLW0603
    if _REGISTRY is None:
        _REGISTRY = ExtensionRegistry()
        force_reload = True
    if force_reload:
        try:
            _REGISTRY.reload()
        except Exception:
            logger.exception("Failed to reload extension registry")
    return _REGISTRY
