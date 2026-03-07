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
    enabled: bool
    source: str
    asset_base: str


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
