from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from pocketpaw.api.v1.schemas.common import APIResponse, StatusResponse


class ExtensionError(BaseModel):
    source: str
    message: str


class ExtensionSummary(APIResponse):
    id: str
    name: str
    version: str
    description: str = ""
    icon: str | None = None
    route: str
    entry: str
    scopes: list[str] = Field(default_factory=list)
    autostart: bool = True
    enabled: bool
    source: str
    is_removable: bool = False
    asset_base: str
    # Plugin fields
    type: str = "spa"
    is_plugin: bool = False
    is_url_wrapper: bool = False
    is_installed: bool = True
    url: str | None = None
    sandbox: dict | None = None
    has_start: bool = False
    daemon: bool = False


class ExtensionListResponse(APIResponse):
    extensions: list[ExtensionSummary] = Field(default_factory=list)
    errors: list[ExtensionError] = Field(default_factory=list)


class ExtensionStatusResponse(ExtensionListResponse):
    total: int = 0
    enabled: int = 0


class ExtensionSessionResponse(APIResponse):
    extension: ExtensionSummary
    token: str
    expires_at: int
    expires_in_seconds: int
    api_base: str


class ExtensionToggleRequest(BaseModel):
    enabled: bool


class ExtensionStorageValueRequest(BaseModel):
    value: Any


class ExtensionStorageItem(APIResponse):
    key: str
    value: Any = None
    exists: bool = True


class ExtensionStorageListResponse(APIResponse):
    items: list[ExtensionStorageItem] = Field(default_factory=list)
    total: int = 0


class ExtensionStorageDeleteResponse(StatusResponse):
    key: str
    deleted: bool


# ── Plugin-specific schemas ──────────────────────────────────────────────


class CudaInfoResponse(APIResponse):
    available: bool = False
    driver_version: str | None = None
    cuda_version: str | None = None
    device_name: str | None = None
    vram_mb: int | None = None
    vram_gb: float | None = None
    cuda_tag: str | None = None
    platform: str = ""
    summary: str = ""


class PluginStatusResponse(APIResponse):
    plugin_id: str
    status: str = "stopped"
    pid: int | None = None
    port: int | None = None
    url: str | None = None
    started_at: float | None = None
    stopped_at: float | None = None
    error: str | None = None
    install_progress: float = 0.0
    uptime_seconds: float | None = None
    is_installed: bool = False


class PluginLogResponse(APIResponse):
    plugin_id: str
    lines: list[str] = Field(default_factory=list)
    total: int = 0
