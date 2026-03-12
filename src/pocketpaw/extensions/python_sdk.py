"""
PocketPaw Python SDK — shared helper for all Python-based extensions.

Location: src/pocketpaw/extensions/python_sdk.py

Provides typed async access to all PocketPaw Runtime APIs:
  • Storage     — scoped key-value persistence
  • Chat        — send messages / stream responses via the AI agent
  • Sessions    — list conversation sessions
  • Reminders   — natural-language time-based reminders
  • Intentions  — scheduled AI task automation (cron/interval)
  • Memory      — long-term memory read/delete
  • Skills      — list installed user-invocable skills
  • Health      — server health & version
  • Events      — real-time SSE subscription
  • Notifications — push toast messages to the dashboard
  • Commands    — register slash commands
  • Tools       — register tools for the AI agent
  • Settings    — read/write server configuration
  • Config      — per-extension configuration store

Usage from any plugin's server.py:

    import sys
    from pathlib import Path
    # Add the extensions root so the shared SDK is importable
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

    from python_sdk import PocketPawSDK

    sdk = PocketPawSDK(extension_id="my-plugin")

    # Storage
    value = await sdk.storage.get("key")
    await sdk.storage.set("key", 42)
    items = await sdk.storage.list()
    await sdk.storage.delete("key")

    # Chat
    response = await sdk.chat.send("Hello!")

    # Reminders
    r = await sdk.reminders.create("in 30 minutes to check oven")
    await sdk.reminders.delete(r["id"])

    # Notifications (push to dashboard)
    await sdk.notifications.send("Build Complete", "Model finished training", "success")
"""

from __future__ import annotations

import os
from typing import Any

import httpx


# ── Storage ──────────────────────────────────────────────────────────────────


class _StorageClient:
    """Scoped key-value storage backed by PocketPaw's Extension Storage API."""

    def __init__(self, client: httpx.AsyncClient, ext_id: str, headers_fn):
        self._client = client
        self._ext_id = ext_id
        self._headers = headers_fn

    async def list(self) -> list[dict[str, Any]]:
        """List all key-value pairs in extension storage."""
        resp = await self._client.get(
            f"/api/v1/extensions/runtime/{self._ext_id}/storage",
            headers=self._headers(),
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("items", [])

    async def get(self, key: str) -> Any | None:
        """Read a single key. Returns None if not found."""
        resp = await self._client.get(
            f"/api/v1/extensions/runtime/{self._ext_id}/storage/{key}",
            headers=self._headers(),
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("value") if data.get("exists") else None

    async def set(self, key: str, value: Any) -> dict:
        """Write a single key to extension storage."""
        resp = await self._client.put(
            f"/api/v1/extensions/runtime/{self._ext_id}/storage/{key}",
            headers=self._headers(),
            json={"value": value},
        )
        resp.raise_for_status()
        return resp.json()

    async def delete(self, key: str) -> dict:
        """Delete a single key from extension storage."""
        resp = await self._client.delete(
            f"/api/v1/extensions/runtime/{self._ext_id}/storage/{key}",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()


# ── Chat ─────────────────────────────────────────────────────────────────────


class _ChatClient:
    """Send messages and stream responses via the AI agent."""

    def __init__(self, client: httpx.AsyncClient, ext_id: str, headers_fn):
        self._client = client
        self._ext_id = ext_id
        self._headers = headers_fn

    async def send(
        self,
        content: str,
        *,
        session_id: str | None = None,
        media: list | None = None,
    ) -> dict:
        """Send a message and wait for the full response."""
        resp = await self._client.post(
            f"/api/v1/extensions/runtime/{self._ext_id}/chat",
            headers=self._headers(),
            json={
                "content": content,
                "session_id": session_id,
                "media": media,
            },
            timeout=120.0,
        )
        resp.raise_for_status()
        return resp.json()


# ── Sessions ─────────────────────────────────────────────────────────────────


class _SessionsClient:
    """List conversation sessions."""

    def __init__(self, client: httpx.AsyncClient, ext_id: str, headers_fn):
        self._client = client
        self._ext_id = ext_id
        self._headers = headers_fn

    async def list(self, limit: int = 50) -> dict:
        resp = await self._client.get(
            f"/api/v1/extensions/runtime/{self._ext_id}/sessions",
            headers=self._headers(),
            params={"limit": limit},
        )
        resp.raise_for_status()
        return resp.json()


# ── Reminders ────────────────────────────────────────────────────────────────


class _RemindersClient:
    """Natural-language time-based reminders."""

    def __init__(self, client: httpx.AsyncClient, ext_id: str, headers_fn):
        self._client = client
        self._ext_id = ext_id
        self._headers = headers_fn

    async def list(self) -> list[dict]:
        resp = await self._client.get(
            f"/api/v1/extensions/runtime/{self._ext_id}/reminders",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def create(self, message: str) -> dict:
        resp = await self._client.post(
            f"/api/v1/extensions/runtime/{self._ext_id}/reminders",
            headers=self._headers(),
            json={"message": message},
        )
        resp.raise_for_status()
        return resp.json()

    async def delete(self, reminder_id: str) -> dict:
        resp = await self._client.delete(
            f"/api/v1/extensions/runtime/{self._ext_id}/reminders/{reminder_id}",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()


# ── Intentions ───────────────────────────────────────────────────────────────


class _IntentionsClient:
    """Scheduled AI task automation (cron/interval)."""

    def __init__(self, client: httpx.AsyncClient, ext_id: str, headers_fn):
        self._client = client
        self._ext_id = ext_id
        self._headers = headers_fn

    async def list(self) -> list[dict]:
        resp = await self._client.get(
            f"/api/v1/extensions/runtime/{self._ext_id}/intentions",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def create(
        self,
        *,
        name: str,
        prompt: str,
        trigger: dict | None = None,
        context_sources: list | None = None,
        enabled: bool = True,
    ) -> dict:
        resp = await self._client.post(
            f"/api/v1/extensions/runtime/{self._ext_id}/intentions",
            headers=self._headers(),
            json={
                "name": name,
                "prompt": prompt,
                "trigger": trigger or {},
                "context_sources": context_sources or [],
                "enabled": enabled,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def update(self, intention_id: str, **kwargs) -> dict:
        resp = await self._client.patch(
            f"/api/v1/extensions/runtime/{self._ext_id}/intentions/{intention_id}",
            headers=self._headers(),
            json=kwargs,
        )
        resp.raise_for_status()
        return resp.json()

    async def delete(self, intention_id: str) -> dict:
        resp = await self._client.delete(
            f"/api/v1/extensions/runtime/{self._ext_id}/intentions/{intention_id}",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def toggle(self, intention_id: str) -> dict:
        resp = await self._client.post(
            f"/api/v1/extensions/runtime/{self._ext_id}/intentions/{intention_id}/toggle",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def run(self, intention_id: str) -> dict:
        resp = await self._client.post(
            f"/api/v1/extensions/runtime/{self._ext_id}/intentions/{intention_id}/run",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()


# ── Memory ───────────────────────────────────────────────────────────────────


class _MemoryClient:
    """Long-term memory read/delete."""

    def __init__(self, client: httpx.AsyncClient, ext_id: str, headers_fn):
        self._client = client
        self._ext_id = ext_id
        self._headers = headers_fn

    async def list(self, limit: int = 50) -> list[dict]:
        resp = await self._client.get(
            f"/api/v1/extensions/runtime/{self._ext_id}/memory",
            headers=self._headers(),
            params={"limit": limit},
        )
        resp.raise_for_status()
        return resp.json()

    async def delete(self, entry_id: str) -> dict:
        resp = await self._client.delete(
            f"/api/v1/extensions/runtime/{self._ext_id}/memory/{entry_id}",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()


# ── Skills ───────────────────────────────────────────────────────────────────


class _SkillsClient:
    """List installed user-invocable skills."""

    def __init__(self, client: httpx.AsyncClient, ext_id: str, headers_fn):
        self._client = client
        self._ext_id = ext_id
        self._headers = headers_fn

    async def list(self) -> list[dict]:
        resp = await self._client.get(
            f"/api/v1/extensions/runtime/{self._ext_id}/skills",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()


# ── Health ───────────────────────────────────────────────────────────────────


class _HealthClient:
    """Server health and version."""

    def __init__(self, client: httpx.AsyncClient, ext_id: str, headers_fn):
        self._client = client
        self._ext_id = ext_id
        self._headers = headers_fn

    async def status(self) -> dict:
        resp = await self._client.get(
            f"/api/v1/extensions/runtime/{self._ext_id}/health",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def version(self) -> dict:
        resp = await self._client.get(
            f"/api/v1/extensions/runtime/{self._ext_id}/version",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()


# ── Notifications ────────────────────────────────────────────────────────────


class _NotificationsClient:
    """Push toast messages to the PocketPaw dashboard."""

    def __init__(self, client: httpx.AsyncClient, ext_id: str, headers_fn):
        self._client = client
        self._ext_id = ext_id
        self._headers = headers_fn

    async def send(
        self,
        title: str,
        message: str = "",
        level: str = "info",
        duration: int = 5000,
    ) -> dict:
        resp = await self._client.post(
            f"/api/v1/extensions/runtime/{self._ext_id}/notifications",
            headers=self._headers(),
            json={
                "title": title,
                "message": message,
                "level": level,
                "duration": duration,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def broadcast(self, event: str, data: dict | None = None) -> dict:
        resp = await self._client.post(
            f"/api/v1/extensions/runtime/{self._ext_id}/broadcast",
            headers=self._headers(),
            json={"event": event, "data": data or {}},
        )
        resp.raise_for_status()
        return resp.json()


# ── Commands ─────────────────────────────────────────────────────────────────


class _CommandsClient:
    """Register auto-reply slash commands from extensions."""

    def __init__(self, client: httpx.AsyncClient, ext_id: str, headers_fn):
        self._client = client
        self._ext_id = ext_id
        self._headers = headers_fn

    async def list(self) -> list[dict]:
        resp = await self._client.get(
            f"/api/v1/extensions/runtime/{self._ext_id}/commands",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def register(self, data: dict) -> dict:
        resp = await self._client.post(
            f"/api/v1/extensions/runtime/{self._ext_id}/commands",
            headers=self._headers(),
            json=data,
        )
        resp.raise_for_status()
        return resp.json()

    async def unregister(self, name: str) -> dict:
        resp = await self._client.delete(
            f"/api/v1/extensions/runtime/{self._ext_id}/commands/{name}",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()


# ── Tools ────────────────────────────────────────────────────────────────────


class _ToolsClient:
    """Register tools for the AI agent to use."""

    def __init__(self, client: httpx.AsyncClient, ext_id: str, headers_fn):
        self._client = client
        self._ext_id = ext_id
        self._headers = headers_fn

    async def list(self) -> list[dict]:
        resp = await self._client.get(
            f"/api/v1/extensions/runtime/{self._ext_id}/tools",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def register(self, data: dict) -> dict:
        resp = await self._client.post(
            f"/api/v1/extensions/runtime/{self._ext_id}/tools",
            headers=self._headers(),
            json=data,
        )
        resp.raise_for_status()
        return resp.json()

    async def unregister(self, name: str) -> dict:
        resp = await self._client.delete(
            f"/api/v1/extensions/runtime/{self._ext_id}/tools/{name}",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()


# ── Settings ─────────────────────────────────────────────────────────────────


class _SettingsClient:
    """Read/write PocketPaw server configuration."""

    def __init__(self, client: httpx.AsyncClient, ext_id: str, headers_fn):
        self._client = client
        self._ext_id = ext_id
        self._headers = headers_fn

    async def get(self) -> dict:
        resp = await self._client.get(
            f"/api/v1/extensions/runtime/{self._ext_id}/settings",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def update(self, data: dict) -> dict:
        resp = await self._client.patch(
            f"/api/v1/extensions/runtime/{self._ext_id}/settings",
            headers=self._headers(),
            json=data,
        )
        resp.raise_for_status()
        return resp.json()


# ── Config ───────────────────────────────────────────────────────────────────


class _ConfigClient:
    """Per-extension configuration store (separate from key-value storage)."""

    def __init__(self, client: httpx.AsyncClient, ext_id: str, headers_fn):
        self._client = client
        self._ext_id = ext_id
        self._headers = headers_fn

    async def get(self) -> dict:
        resp = await self._client.get(
            f"/api/v1/extensions/runtime/{self._ext_id}/config",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def set(self, config: dict) -> dict:
        resp = await self._client.put(
            f"/api/v1/extensions/runtime/{self._ext_id}/config",
            headers=self._headers(),
            json={"config": config},
        )
        resp.raise_for_status()
        return resp.json()


# ══════════════════════════════════════════════════════════════════════════════
#  Main SDK Class
# ══════════════════════════════════════════════════════════════════════════════


class PocketPawSDK:
    """
    Shared PocketPaw Python SDK for all extensions.

    Reads configuration from environment variables (injected by the sandbox):
        POCKETPAW_API_BASE   — base URL of the PocketPaw API (default: http://127.0.0.1:8888)
        POCKETPAW_EXT_TOKEN  — scoped auth token for this extension
        POCKETPAW_EXT_ID     — this extension's unique ID

    All sub-clients mirror the JS SDK (extensions-sdk.js) 1:1.
    """

    def __init__(
        self,
        *,
        api_base: str | None = None,
        token: str | None = None,
        extension_id: str | None = None,
    ):
        self.api_base = api_base or os.environ.get(
            "POCKETPAW_API_BASE", "http://127.0.0.1:8888"
        )
        self.token = token or os.environ.get("POCKETPAW_EXT_TOKEN", "")
        self.extension_id = extension_id or os.environ.get("POCKETPAW_EXT_ID", "")

        self._client = httpx.AsyncClient(base_url=self.api_base, timeout=30.0)

        def _headers():
            return {"Authorization": f"Bearer {self.token}"}

        # Sub-clients — mirrors the JS SDK structure
        self.storage = _StorageClient(self._client, self.extension_id, _headers)
        self.chat = _ChatClient(self._client, self.extension_id, _headers)
        self.sessions = _SessionsClient(self._client, self.extension_id, _headers)
        self.reminders = _RemindersClient(self._client, self.extension_id, _headers)
        self.intentions = _IntentionsClient(self._client, self.extension_id, _headers)
        self.memory = _MemoryClient(self._client, self.extension_id, _headers)
        self.skills = _SkillsClient(self._client, self.extension_id, _headers)
        self.health = _HealthClient(self._client, self.extension_id, _headers)
        self.notifications = _NotificationsClient(self._client, self.extension_id, _headers)
        self.commands = _CommandsClient(self._client, self.extension_id, _headers)
        self.tools = _ToolsClient(self._client, self.extension_id, _headers)
        self.settings = _SettingsClient(self._client, self.extension_id, _headers)
        self.config = _ConfigClient(self._client, self.extension_id, _headers)

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._client.aclose()

    async def __aenter__(self) -> "PocketPawSDK":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.close()
