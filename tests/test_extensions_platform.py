from __future__ import annotations

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from pocketpaw.config import Settings
from pocketpaw.extensions.registry import ExtensionRegistry
from pocketpaw.extensions.storage import ExtensionStorage
from pocketpaw.extensions.tokens import create_extension_token


def _write_extension(
    root: Path,
    extension_id: str,
    *,
    route: str | None = None,
    scopes: list[str] | None = None,
    entry: str = "index.html",
    write_entry: bool = True,
) -> Path:
    extension_dir = root / extension_id
    extension_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "id": extension_id,
        "name": extension_id.title(),
        "version": "1.0.0",
        "description": f"{extension_id} test app",
        "icon": "app-window",
        "route": route or extension_id,
        "entry": entry,
        "scopes": scopes or ["storage.read", "storage.write"],
    }
    (extension_dir / "extension.json").write_text(json.dumps(manifest), encoding="utf-8")
    if write_entry:
        (extension_dir / entry).write_text(
            f"<html><body><h1>{extension_id}</h1></body></html>",
            encoding="utf-8",
        )
    return extension_dir


def _make_registry(tmp_path: Path, *, disabled_ids: list[str] | None = None) -> ExtensionRegistry:
    builtin_root = tmp_path / "builtin"
    external_root = tmp_path / "external"
    builtin_root.mkdir()
    external_root.mkdir()
    _write_extension(
        builtin_root,
        "todo",
        scopes=["storage.read", "storage.write", "host.open_chat"],
    )
    _write_extension(external_root, "notes", scopes=["storage.read"])
    registry = ExtensionRegistry(builtin_root=builtin_root, external_root=external_root)
    registry.reload(Settings(extension_disabled_ids=disabled_ids or []))
    return registry


def _configure_runtime(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    registry: ExtensionRegistry,
):
    from pocketpaw.api import v1 as api_v1
    from pocketpaw.extensions import registry as registry_module
    from pocketpaw.extensions import storage as storage_module

    settings = Settings(extension_disabled_ids=[], extension_session_ttl_minutes=5)
    storage = ExtensionStorage(tmp_path / "storage")

    monkeypatch.setattr(registry_module, "_REGISTRY", registry)
    monkeypatch.setattr(storage_module, "_STORAGE", storage)
    monkeypatch.setattr(Settings, "load", classmethod(lambda cls: settings))
    monkeypatch.setattr(api_v1, "_V1_ROUTERS", api_v1._V1_ROUTERS)


def test_extension_registry_discovers_and_rejects_invalid_manifests(tmp_path: Path):
    builtin_root = tmp_path / "builtin"
    external_root = tmp_path / "external"
    builtin_root.mkdir()
    external_root.mkdir()

    _write_extension(builtin_root, "todo")
    _write_extension(external_root, "notes", route="notes")
    _write_extension(external_root, "route-clash", route="todo")
    _write_extension(external_root, "broken", entry="missing.html", write_entry=False)

    registry = ExtensionRegistry(builtin_root=builtin_root, external_root=external_root)
    registry.reload(Settings(extension_disabled_ids=["notes"]))

    assert registry.get_enabled("todo") is not None
    assert registry.get("notes") is not None
    assert registry.get("notes").enabled is False
    assert registry.get_enabled("notes") is None
    assert any("duplicate extension route" in err.message for err in registry.errors)
    assert any("entry file does not exist" in err.message for err in registry.errors)


def test_extension_management_and_storage_runtime(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    registry = _make_registry(tmp_path)
    _configure_runtime(monkeypatch, tmp_path, registry)

    with patch("pocketpaw.dashboard_auth.get_access_token", return_value="master-abc"), patch(
        "pocketpaw.api.v1.extensions.get_access_token", return_value="master-abc"
    ):
        from pocketpaw.api.serve import create_api_app

        client = TestClient(create_api_app(), raise_server_exceptions=False)

        resp = client.get("/api/v1/extensions", headers={"Authorization": "Bearer master-abc"})
        assert resp.status_code == 200
        assert {item["id"] for item in resp.json()["extensions"]} == {"todo", "notes"}

        session = client.post(
            "/api/v1/extensions/todo/session",
            headers={"Authorization": "Bearer master-abc"},
        )
        assert session.status_code == 200
        data = session.json()
        assert data["token"].startswith("pex_")

        token_header = {"Authorization": f"Bearer {data['token']}"}
        put_resp = client.put(
            "/api/v1/extensions/runtime/todo/storage/todos",
            headers=token_header,
            json={"value": [{"id": "1", "text": "Buy milk"}]},
        )
        assert put_resp.status_code == 200

        get_resp = client.get(
            "/api/v1/extensions/runtime/todo/storage/todos",
            headers=token_header,
        )
        assert get_resp.status_code == 200
        assert get_resp.json()["value"] == [{"id": "1", "text": "Buy milk"}]

        list_resp = client.get("/api/v1/extensions/runtime/todo/storage", headers=token_header)
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] == 1

        delete_resp = client.delete(
            "/api/v1/extensions/runtime/todo/storage/todos",
            headers=token_header,
        )
        assert delete_resp.status_code == 200
        assert delete_resp.json()["deleted"] is True

        wrong_extension = client.get(
            "/api/v1/extensions/runtime/notes/storage/example",
            headers=token_header,
        )
        assert wrong_extension.status_code == 403

        blocked_admin = client.get("/api/v1/extensions", headers=token_header)
        assert blocked_admin.status_code == 401


def test_extension_runtime_scope_and_expiry_enforcement(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    registry = _make_registry(tmp_path)
    _configure_runtime(monkeypatch, tmp_path, registry)

    with patch("pocketpaw.dashboard_auth.get_access_token", return_value="master-abc"):
        from pocketpaw.api.serve import create_api_app

        client = TestClient(create_api_app(), raise_server_exceptions=False)

        read_only = create_extension_token(
            "master-abc",
            "todo",
            ["storage.read"],
            ttl_seconds=300,
        )
        denied = client.put(
            "/api/v1/extensions/runtime/todo/storage/todos",
            headers={"Authorization": f"Bearer {read_only}"},
            json={"value": []},
        )
        assert denied.status_code == 403

        expired = create_extension_token(
            "master-abc",
            "todo",
            ["storage.read"],
            ttl_seconds=-5,
        )
        expired_resp = client.get(
            "/api/v1/extensions/runtime/todo/storage/todos",
            headers={"Authorization": f"Bearer {expired}"},
        )
        assert expired_resp.status_code == 401


@patch("pocketpaw.api.v1.extensions._send_message")
@patch("pocketpaw.api.v1.extensions._APISessionBridge")
def test_extension_chat_runtime_uses_scoped_token(
    mock_bridge_cls,
    mock_send,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    builtin_root = tmp_path / "builtin"
    external_root = tmp_path / "external"
    builtin_root.mkdir()
    external_root.mkdir()
    _write_extension(builtin_root, "chatbox", scopes=["chat.send"])
    registry = ExtensionRegistry(builtin_root=builtin_root, external_root=external_root)
    registry.reload(Settings())
    _configure_runtime(monkeypatch, tmp_path, registry)

    bridge = MagicMock()
    queue = asyncio.Queue()
    bridge.queue = queue
    bridge.start = AsyncMock()
    bridge.stop = AsyncMock()
    mock_bridge_cls.return_value = bridge
    mock_send.return_value = "ext:chatbox:test"

    async def _load_events():
        await queue.put({"event": "chunk", "data": {"content": "Hello "}})
        await queue.put({"event": "chunk", "data": {"content": "world"}})
        await queue.put({"event": "stream_end", "data": {"usage": {"tokens": 12}}})

    asyncio.get_event_loop().run_until_complete(_load_events())

    token = create_extension_token("master-abc", "chatbox", ["chat.send"], ttl_seconds=300)

    with patch("pocketpaw.dashboard_auth.get_access_token", return_value="master-abc"):
        from pocketpaw.api.serve import create_api_app

        client = TestClient(create_api_app(), raise_server_exceptions=False)
        resp = client.post(
            "/api/v1/extensions/runtime/chatbox/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"content": "Hi"},
        )

    assert resp.status_code == 200
    assert resp.json()["content"] == "Hello world"


def test_extension_sessions_endpoint(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    builtin_root = tmp_path / "builtin"
    external_root = tmp_path / "external"
    builtin_root.mkdir()
    external_root.mkdir()
    _write_extension(builtin_root, "history", scopes=["sessions.read"])
    registry = ExtensionRegistry(builtin_root=builtin_root, external_root=external_root)
    registry.reload(Settings())
    _configure_runtime(monkeypatch, tmp_path, registry)

    class _FakeStore:
        def _load_session_index(self):
            return {"ws_demo": {"title": "Demo", "last_activity": "2026-03-07T12:00:00"}}

    class _FakeManager:
        _store = _FakeStore()

    token = create_extension_token("master-abc", "history", ["sessions.read"], ttl_seconds=300)

    with patch("pocketpaw.dashboard_auth.get_access_token", return_value="master-abc"), patch(
        "pocketpaw.memory.get_memory_manager", return_value=_FakeManager()
    ):
        from pocketpaw.api.serve import create_api_app

        client = TestClient(create_api_app(), raise_server_exceptions=False)
        resp = client.get(
            "/api/v1/extensions/runtime/history/sessions",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["sessions"][0]["id"] == "ws_demo"


def test_dashboard_serves_extension_host_and_assets(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    registry = _make_registry(tmp_path)
    _configure_runtime(monkeypatch, tmp_path, registry)

    from pocketpaw.dashboard import app

    client = TestClient(app, raise_server_exceptions=False)

    root = client.get("/")
    assert root.status_code == 200
    assert 'data-extension-host="true"' in root.text
    assert "Apps" in root.text

    asset = client.get("/extensions/todo/")
    assert asset.status_code == 200
    assert "todo" in asset.text.lower()
