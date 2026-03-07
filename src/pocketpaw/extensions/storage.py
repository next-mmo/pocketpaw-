from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from pocketpaw.config import get_config_dir


def _get_storage_dir() -> Path:
    path = get_config_dir() / "extension-data"
    path.mkdir(parents=True, exist_ok=True)
    return path


class ExtensionStorage:
    def __init__(self, storage_dir: Path | None = None) -> None:
        self.storage_dir = storage_dir or _get_storage_dir()
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, threading.Lock] = {}

    def list_items(self, extension_id: str) -> dict[str, Any]:
        with self._lock_for(extension_id):
            return dict(self._read(extension_id))

    def get_item(self, extension_id: str, key: str) -> tuple[bool, Any]:
        data = self.list_items(extension_id)
        return key in data, data.get(key)

    def set_item(self, extension_id: str, key: str, value: Any) -> None:
        with self._lock_for(extension_id):
            data = self._read(extension_id)
            data[key] = value
            self._write(extension_id, data)

    def delete_item(self, extension_id: str, key: str) -> bool:
        with self._lock_for(extension_id):
            data = self._read(extension_id)
            if key not in data:
                return False
            del data[key]
            self._write(extension_id, data)
            return True

    def _path_for(self, extension_id: str) -> Path:
        safe_id = "".join(ch for ch in extension_id if ch.isalnum() or ch in {"-", "_"})
        return self.storage_dir / f"{safe_id}.json"

    def _lock_for(self, extension_id: str) -> threading.Lock:
        if extension_id not in self._locks:
            self._locks[extension_id] = threading.Lock()
        return self._locks[extension_id]

    def _read(self, extension_id: str) -> dict[str, Any]:
        path = self._path_for(extension_id)
        if not path.exists():
            return {}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    def _write(self, extension_id: str, data: dict[str, Any]) -> None:
        path = self._path_for(extension_id)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=True), encoding="utf-8")


_STORAGE: ExtensionStorage | None = None


def get_extension_storage() -> ExtensionStorage:
    global _STORAGE  # noqa: PLW0603
    if _STORAGE is None:
        _STORAGE = ExtensionStorage()
    return _STORAGE
