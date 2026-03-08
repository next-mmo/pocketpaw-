"""Tests for extension override (builtin → external) and install-from-path."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from pocketpaw.config import Settings
from pocketpaw.extensions.registry import ExtensionRegistry
from pocketpaw.extensions.storage import ExtensionStorage


def _write_extension(
    root: Path,
    extension_id: str,
    *,
    name: str | None = None,
    route: str | None = None,
    version: str = "1.0.0",
    scopes: list[str] | None = None,
    entry: str = "index.html",
    write_entry: bool = True,
) -> Path:
    extension_dir = root / extension_id
    extension_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "id": extension_id,
        "name": name or extension_id.title(),
        "version": version,
        "description": f"{extension_id} test app",
        "icon": "app-window",
        "route": route or extension_id,
        "entry": entry,
        "scopes": scopes or ["storage.read", "storage.write"],
    }
    (extension_dir / "extension.json").write_text(json.dumps(manifest), encoding="utf-8")
    if write_entry:
        (extension_dir / entry).write_text(
            f"<html><body><h1>{extension_id} v{version}</h1></body></html>",
            encoding="utf-8",
        )
    return extension_dir


def _make_zip(extension_dir: Path) -> bytes:
    """Create a ZIP from an extension folder and return bytes."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in sorted(extension_dir.rglob("*")):
            if file_path.is_file():
                arcname = file_path.relative_to(extension_dir)
                zf.write(file_path, arcname)
    buf.seek(0)
    return buf.read()


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


# ── Registry: External shadows builtin ─────────────────────────────────


class TestRegistryBuiltinOverride:
    """Registry should allow external extensions to shadow built-in ones."""

    def test_external_overrides_builtin_same_id(self, tmp_path: Path):
        """When external has same id as builtin, external replaces builtin."""
        builtin_root = tmp_path / "builtin"
        external_root = tmp_path / "external"
        builtin_root.mkdir()
        external_root.mkdir()

        _write_extension(builtin_root, "counter", version="1.0.0")
        _write_extension(external_root, "counter", version="2.0.0")

        registry = ExtensionRegistry(builtin_root=builtin_root, external_root=external_root)
        registry.reload(Settings())

        record = registry.get("counter")
        assert record is not None
        assert record.source == "external"
        assert record.manifest.version == "2.0.0"
        # No duplicate-id error should be generated
        assert not any("duplicate extension id" in err.message for err in registry.errors)

    def test_external_override_is_removable(self, tmp_path: Path):
        """Overriding external extension should be removable."""
        builtin_root = tmp_path / "builtin"
        external_root = tmp_path / "external"
        builtin_root.mkdir()
        external_root.mkdir()

        _write_extension(builtin_root, "counter", version="1.0.0")
        _write_extension(external_root, "counter", version="2.0.0")

        registry = ExtensionRegistry(builtin_root=builtin_root, external_root=external_root)
        registry.reload(Settings())

        record = registry.get("counter")
        assert record.is_removable is True

    def test_builtin_restores_after_external_removed(self, tmp_path: Path):
        """When overriding external is removed, builtin reappears on reload."""
        builtin_root = tmp_path / "builtin"
        external_root = tmp_path / "external"
        builtin_root.mkdir()
        external_root.mkdir()

        _write_extension(builtin_root, "counter", version="1.0.0")
        ext_dir = _write_extension(external_root, "counter", version="2.0.0")

        registry = ExtensionRegistry(builtin_root=builtin_root, external_root=external_root)
        registry.reload(Settings())

        # External is active
        assert registry.get("counter").source == "external"

        # Simulate deletion
        import shutil

        shutil.rmtree(ext_dir)

        # Reload — builtin should reappear
        registry.reload(Settings())
        record = registry.get("counter")
        assert record is not None
        assert record.source == "builtin"
        assert record.manifest.version == "1.0.0"

    def test_duplicate_external_still_errors(self, tmp_path: Path):
        """Two external extensions with the same id should still produce an error."""
        builtin_root = tmp_path / "builtin"
        external_root = tmp_path / "external"
        builtin_root.mkdir()
        external_root.mkdir()

        # Create two dirs that will produce same manifest id
        dir_a = external_root / "app-a"
        dir_a.mkdir()
        manifest_a = {
            "id": "myapp",
            "name": "MyApp A",
            "version": "1.0.0",
            "route": "myapp",
            "entry": "index.html",
            "scopes": [],
        }
        (dir_a / "extension.json").write_text(json.dumps(manifest_a), encoding="utf-8")
        (dir_a / "index.html").write_text("<h1>A</h1>", encoding="utf-8")

        dir_b = external_root / "app-b"
        dir_b.mkdir()
        manifest_b = {
            "id": "myapp",
            "name": "MyApp B",
            "version": "2.0.0",
            "route": "myapp-b",
            "entry": "index.html",
            "scopes": [],
        }
        (dir_b / "extension.json").write_text(json.dumps(manifest_b), encoding="utf-8")
        (dir_b / "index.html").write_text("<h1>B</h1>", encoding="utf-8")

        registry = ExtensionRegistry(builtin_root=builtin_root, external_root=external_root)
        registry.reload(Settings())

        assert any("duplicate extension id" in err.message for err in registry.errors)

    def test_external_override_different_route(self, tmp_path: Path):
        """External override with a different route should work (old route removed)."""
        builtin_root = tmp_path / "builtin"
        external_root = tmp_path / "external"
        builtin_root.mkdir()
        external_root.mkdir()

        _write_extension(builtin_root, "counter", route="counter")
        _write_extension(external_root, "counter", route="my-counter", version="2.0.0")

        registry = ExtensionRegistry(builtin_root=builtin_root, external_root=external_root)
        registry.reload(Settings())

        # Old route should not resolve
        assert registry.get_by_route("counter") is None
        # New route should work
        assert registry.get_by_route("my-counter") is not None
        assert registry.get_by_route("my-counter").manifest.version == "2.0.0"


# ── API: Upload ZIP with builtin override ──────────────────────────────


class TestUploadOverrideAPI:
    """Test the /extensions/upload endpoint with builtin override flow."""

    def _setup(self, monkeypatch, tmp_path):
        builtin_root = tmp_path / "builtin"
        external_root = tmp_path / "external"
        builtin_root.mkdir()
        external_root.mkdir()
        _write_extension(builtin_root, "counter", version="1.0.0")

        registry = ExtensionRegistry(builtin_root=builtin_root, external_root=external_root)
        registry.reload(Settings())
        _configure_runtime(monkeypatch, tmp_path, registry)

        # Patch external dir to use our temp dir
        from pocketpaw.extensions import registry as registry_module

        monkeypatch.setattr(registry_module, "get_external_extensions_dir", lambda: external_root)
        from pocketpaw.api.v1 import extensions as ext_mod

        monkeypatch.setattr(ext_mod, "get_external_extensions_dir", lambda: external_root)

        return builtin_root, external_root

    def test_upload_builtin_without_force_returns_409(self, monkeypatch, tmp_path):
        """Uploading an extension with a builtin id should return 409 without force."""
        builtin_root, external_root = self._setup(monkeypatch, tmp_path)

        # Create a zip with the same id as the builtin
        src = tmp_path / "upload_src"
        ext_dir = _write_extension(src, "counter", version="2.0.0")
        zip_bytes = _make_zip(ext_dir)

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            resp = client.post(
                "/api/v1/extensions/upload",
                headers={"Authorization": "Bearer test-token"},
                files={"file": ("counter.zip", zip_bytes, "application/zip")},
            )

        assert resp.status_code == 409
        assert "overwrite_builtin_required:" in resp.json()["detail"]

    def test_upload_builtin_with_force_succeeds(self, monkeypatch, tmp_path):
        """Uploading an extension with force=true should override the builtin."""
        builtin_root, external_root = self._setup(monkeypatch, tmp_path)

        src = tmp_path / "upload_src"
        ext_dir = _write_extension(src, "counter", version="2.0.0")
        zip_bytes = _make_zip(ext_dir)

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            resp = client.post(
                "/api/v1/extensions/upload?force=true",
                headers={"Authorization": "Bearer test-token"},
                files={"file": ("counter.zip", zip_bytes, "application/zip")},
            )

        assert resp.status_code == 200
        extensions = resp.json()["extensions"]
        counter = next((e for e in extensions if e["id"] == "counter"), None)
        assert counter is not None
        assert counter["source"] == "external"
        assert counter["version"] == "2.0.0"

    def test_upload_external_overwrite_without_force_returns_409(self, monkeypatch, tmp_path):
        """Uploading an extension with an existing external id returns 409 without force."""
        builtin_root, external_root = self._setup(monkeypatch, tmp_path)

        # First install an external extension
        _write_extension(external_root, "notes", version="1.0.0")

        # Reload registry to pick up the new extension
        from pocketpaw.extensions import registry as registry_module

        registry_module._REGISTRY.reload(Settings())

        # Now try to upload another with the same id
        src = tmp_path / "upload_src"
        ext_dir = _write_extension(src, "notes", version="2.0.0")
        zip_bytes = _make_zip(ext_dir)

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            resp = client.post(
                "/api/v1/extensions/upload",
                headers={"Authorization": "Bearer test-token"},
                files={"file": ("notes.zip", zip_bytes, "application/zip")},
            )

        assert resp.status_code == 409
        assert "overwrite_required:" in resp.json()["detail"]


# ── API: Install from folder path ─────────────────────────────────────


class TestInstallFromPathAPI:
    """Test the /extensions/install-from-path endpoint."""

    def _setup(self, monkeypatch, tmp_path):
        builtin_root = tmp_path / "builtin"
        external_root = tmp_path / "external"
        builtin_root.mkdir()
        external_root.mkdir()
        _write_extension(builtin_root, "counter", version="1.0.0")

        registry = ExtensionRegistry(builtin_root=builtin_root, external_root=external_root)
        registry.reload(Settings())
        _configure_runtime(monkeypatch, tmp_path, registry)

        from pocketpaw.extensions import registry as registry_module

        monkeypatch.setattr(registry_module, "get_external_extensions_dir", lambda: external_root)
        from pocketpaw.api.v1 import extensions as ext_mod

        monkeypatch.setattr(ext_mod, "get_external_extensions_dir", lambda: external_root)

        return builtin_root, external_root

    def test_install_from_valid_folder(self, monkeypatch, tmp_path):
        """Should install an extension from a local folder."""
        _, external_root = self._setup(monkeypatch, tmp_path)

        src = tmp_path / "my_ext"
        _write_extension(src, "myapp", version="1.0.0")
        folder_path = str(src / "myapp")

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            resp = client.post(
                "/api/v1/extensions/install-from-path",
                headers={
                    "Authorization": "Bearer test-token",
                    "Content-Type": "application/json",
                },
                json={"path": folder_path},
            )

        assert resp.status_code == 200
        extensions = resp.json()["extensions"]
        myapp = next((e for e in extensions if e["id"] == "myapp"), None)
        assert myapp is not None
        assert myapp["source"] == "external"
        # Files should be copied
        assert (external_root / "myapp" / "extension.json").exists()
        assert (external_root / "myapp" / "index.html").exists()

    def test_install_from_nonexistent_path(self, monkeypatch, tmp_path):
        """Should return 400 for a nonexistent path."""
        self._setup(monkeypatch, tmp_path)
        fake_path = str(tmp_path / "does_not_exist")

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            resp = client.post(
                "/api/v1/extensions/install-from-path",
                headers={
                    "Authorization": "Bearer test-token",
                    "Content-Type": "application/json",
                },
                json={"path": fake_path},
            )

        assert resp.status_code == 400
        assert "does not exist" in resp.json()["detail"]

    def test_install_from_folder_without_manifest(self, monkeypatch, tmp_path):
        """Should return 400 for a folder without extension.json."""
        self._setup(monkeypatch, tmp_path)
        empty_dir = tmp_path / "empty_ext"
        empty_dir.mkdir()

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            resp = client.post(
                "/api/v1/extensions/install-from-path",
                headers={
                    "Authorization": "Bearer test-token",
                    "Content-Type": "application/json",
                },
                json={"path": str(empty_dir)},
            )

        assert resp.status_code == 400
        assert "extension.json" in resp.json()["detail"]

    def test_install_from_folder_builtin_conflict_returns_409(self, monkeypatch, tmp_path):
        """Installing from folder with same id as builtin returns 409 without force."""
        self._setup(monkeypatch, tmp_path)

        src = tmp_path / "my_counter"
        ext_dir = _write_extension(src, "counter", version="2.0.0")

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            resp = client.post(
                "/api/v1/extensions/install-from-path",
                headers={
                    "Authorization": "Bearer test-token",
                    "Content-Type": "application/json",
                },
                json={"path": str(ext_dir)},
            )

        assert resp.status_code == 409
        assert "overwrite_builtin_required:" in resp.json()["detail"]

    def test_install_from_folder_builtin_with_force_succeeds(self, monkeypatch, tmp_path):
        """Installing from folder with force=true overrides the builtin."""
        _, external_root = self._setup(monkeypatch, tmp_path)

        src = tmp_path / "my_counter"
        ext_dir = _write_extension(src, "counter", version="2.0.0")

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            resp = client.post(
                "/api/v1/extensions/install-from-path?force=true",
                headers={
                    "Authorization": "Bearer test-token",
                    "Content-Type": "application/json",
                },
                json={"path": str(ext_dir)},
            )

        assert resp.status_code == 200
        extensions = resp.json()["extensions"]
        counter = next((e for e in extensions if e["id"] == "counter"), None)
        assert counter is not None
        assert counter["source"] == "external"
        assert counter["version"] == "2.0.0"

    def test_install_from_file_not_directory(self, monkeypatch, tmp_path):
        """Should return 400 when pointing to a file instead of a directory."""
        self._setup(monkeypatch, tmp_path)
        some_file = tmp_path / "somefile.txt"
        some_file.write_text("hello")

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            resp = client.post(
                "/api/v1/extensions/install-from-path",
                headers={
                    "Authorization": "Bearer test-token",
                    "Content-Type": "application/json",
                },
                json={"path": str(some_file)},
            )

        assert resp.status_code == 400
        assert "not a directory" in resp.json()["detail"]


# ── API: Upload folder (multipart files) ──────────────────────────────


class TestUploadFolderAPI:
    """Test the /extensions/upload-folder endpoint (multipart file upload)."""

    def _setup(self, monkeypatch, tmp_path):
        builtin_root = tmp_path / "builtin"
        external_root = tmp_path / "external"
        builtin_root.mkdir()
        external_root.mkdir()
        _write_extension(builtin_root, "counter", version="1.0.0")

        registry = ExtensionRegistry(builtin_root=builtin_root, external_root=external_root)
        registry.reload(Settings())
        _configure_runtime(monkeypatch, tmp_path, registry)

        from pocketpaw.extensions import registry as registry_module

        monkeypatch.setattr(registry_module, "get_external_extensions_dir", lambda: external_root)
        from pocketpaw.api.v1 import extensions as ext_mod

        monkeypatch.setattr(ext_mod, "get_external_extensions_dir", lambda: external_root)

        return builtin_root, external_root

    def _make_folder_files(self, tmp_path, ext_id, version="1.0.0"):
        """Create extension files on disk and return a list of (relative_path, bytes) tuples."""
        src = tmp_path / "folder_src"
        ext_dir = _write_extension(src, ext_id, version=version)
        result = []
        for file_path in sorted(ext_dir.rglob("*")):
            if file_path.is_file():
                rel = str(file_path.relative_to(ext_dir)).replace("\\", "/")
                result.append((rel, file_path.read_bytes()))
        return result

    def test_upload_folder_new_extension(self, monkeypatch, tmp_path):
        """Upload folder files for a new extension should succeed."""
        _, external_root = self._setup(monkeypatch, tmp_path)
        folder_files = self._make_folder_files(tmp_path, "myapp")

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            # Simulate how the frontend would send files
            files = [("files", (rel, data)) for rel, data in folder_files]
            resp = client.post(
                "/api/v1/extensions/upload-folder",
                headers={"Authorization": "Bearer test-token"},
                files=files,
            )

        assert resp.status_code == 200
        extensions = resp.json()["extensions"]
        myapp = next((e for e in extensions if e["id"] == "myapp"), None)
        assert myapp is not None
        assert myapp["source"] == "external"
        assert (external_root / "myapp" / "extension.json").exists()

    def test_upload_folder_missing_manifest(self, monkeypatch, tmp_path):
        """Upload folder without extension.json should return 400."""
        self._setup(monkeypatch, tmp_path)

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            files = [("files", ("index.html", b"<h1>No manifest</h1>"))]
            resp = client.post(
                "/api/v1/extensions/upload-folder",
                headers={"Authorization": "Bearer test-token"},
                files=files,
            )

        assert resp.status_code == 400
        assert "extension.json" in resp.json()["detail"]

    def test_upload_folder_builtin_conflict_returns_409(self, monkeypatch, tmp_path):
        """Upload folder with same id as builtin returns 409 without force."""
        self._setup(monkeypatch, tmp_path)
        folder_files = self._make_folder_files(tmp_path, "counter", version="2.0.0")

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            files = [("files", (rel, data)) for rel, data in folder_files]
            resp = client.post(
                "/api/v1/extensions/upload-folder",
                headers={"Authorization": "Bearer test-token"},
                files=files,
            )

        assert resp.status_code == 409
        assert "overwrite_builtin_required:" in resp.json()["detail"]

    def test_upload_folder_builtin_with_force_succeeds(self, monkeypatch, tmp_path):
        """Upload folder with force=true should override the builtin."""
        _, external_root = self._setup(monkeypatch, tmp_path)
        folder_files = self._make_folder_files(tmp_path, "counter", version="2.0.0")

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            files = [("files", (rel, data)) for rel, data in folder_files]
            resp = client.post(
                "/api/v1/extensions/upload-folder?force=true",
                headers={"Authorization": "Bearer test-token"},
                files=files,
            )

        assert resp.status_code == 200
        extensions = resp.json()["extensions"]
        counter = next((e for e in extensions if e["id"] == "counter"), None)
        assert counter is not None
        assert counter["source"] == "external"
        assert counter["version"] == "2.0.0"

    def test_upload_folder_no_files_returns_400(self, monkeypatch, tmp_path):
        """Upload with no files should return 400."""
        self._setup(monkeypatch, tmp_path)

        with patch("pocketpaw.dashboard_auth.get_access_token", return_value="test-token"):
            from pocketpaw.api.serve import create_api_app

            client = TestClient(create_api_app(), raise_server_exceptions=False)

            resp = client.post(
                "/api/v1/extensions/upload-folder",
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 400
