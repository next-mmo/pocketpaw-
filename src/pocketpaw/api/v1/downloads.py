"""PocketPaw Download Center API — v1

Global download registry that tracks all downloads across the platform.
Every download (from agents, extensions, browser, etc.) is recorded with
metadata: filename, URL, size, MIME type, status, timestamps, and optional
screenshot/thumbnail.

Persisted as a JSON file at ~/.pocketpaw/downloads.json.
"""

import asyncio
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["downloads"])

# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------

_DOWNLOADS_FILE: Optional[Path] = None
_downloads_lock = asyncio.Lock()


def _get_downloads_path() -> Path:
    global _DOWNLOADS_FILE
    if _DOWNLOADS_FILE is None:
        _DOWNLOADS_FILE = Path.home() / ".pocketpaw" / "downloads.json"
        _DOWNLOADS_FILE.parent.mkdir(parents=True, exist_ok=True)
    return _DOWNLOADS_FILE


def _load_downloads() -> list[dict]:
    """Load downloads list from disk (returns empty list if file doesn't exist)."""
    path = _get_downloads_path()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.warning("Failed to read downloads.json: %s", e)
        return []


def _save_downloads(downloads: list[dict]) -> None:
    """Persist downloads list to disk."""
    path = _get_downloads_path()
    try:
        path.write_text(json.dumps(downloads, indent=2, default=str), encoding="utf-8")
    except Exception as e:
        logger.warning("Failed to write downloads.json: %s", e)


# ---------------------------------------------------------------------------
# API routes — IMPORTANT: static paths (/stats, /clear) MUST be defined
# BEFORE parameterised paths (/{download_id}) to avoid route shadowing.
# ---------------------------------------------------------------------------


@router.get("/downloads/stats")
async def download_stats():
    """Aggregate stats for the download center badge."""
    async with _downloads_lock:
        downloads = _load_downloads()

    total = len(downloads)
    by_status: dict[str, int] = {}
    total_size = 0
    for d in downloads:
        s = d.get("status", "unknown")
        by_status[s] = by_status.get(s, 0) + 1
        total_size += d.get("size", 0) or 0

    return {
        "total": total,
        "by_status": by_status,
        "total_size": total_size,
        "active": by_status.get("downloading", 0) + by_status.get("pending", 0),
    }


@router.post("/downloads/clear")
async def clear_downloads(request: Request):
    """Clear download history.

    Body JSON (optional):
    {
        "status": "completed"  // only clear downloads with this status; omit for all
    }
    """
    data: dict = {}
    try:
        data = await request.json()
    except Exception:
        pass

    filter_status = data.get("status")

    async with _downloads_lock:
        downloads = _load_downloads()
        if filter_status:
            downloads = [d for d in downloads if d.get("status") != filter_status]
        else:
            downloads = []
        _save_downloads(downloads)

    return {"status": "ok", "remaining": len(downloads)}


@router.get("/downloads")
async def list_downloads(
    status: Optional[str] = Query(None, description="Filter by status: pending, downloading, completed, failed, cancelled"),
    source: Optional[str] = Query(None, description="Filter by source: agent, extension, browser, user"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """List all recorded downloads, newest first."""
    async with _downloads_lock:
        downloads = _load_downloads()

    # Apply filters
    if status:
        downloads = [d for d in downloads if d.get("status") == status]
    if source:
        downloads = [d for d in downloads if d.get("source") == source]

    # Sort newest first
    downloads.sort(key=lambda d: d.get("created_at", 0), reverse=True)

    total = len(downloads)
    page = downloads[offset : offset + limit]

    return {
        "downloads": page,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/downloads")
async def create_download(request: Request):
    """Register a new download.

    Body JSON:
    {
        "filename": "report.pdf",
        "url": "https://example.com/report.pdf",
        "file_path": "/home/user/downloads/report.pdf",
        "size": 1024000,
        "mime_type": "application/pdf",
        "source": "agent",
        "source_id": "ext-123",
        "source_label": "Anti-Browser",
        "status": "completed",
        "progress": 100,
        "screenshot": "data:image/png;base64,...",
        "thumbnail": "data:image/png;base64,...",
        "metadata": { ... },
        "tags": ["pdf", "report"]
    }
    """
    data = await request.json()

    filename = data.get("filename", "").strip()
    if not filename:
        return JSONResponse({"error": "Missing 'filename' field"}, status_code=400)

    now = time.time()
    record = {
        "id": str(uuid.uuid4()),
        "filename": filename,
        "url": data.get("url", ""),
        "file_path": data.get("file_path", ""),
        "size": data.get("size", 0),
        "mime_type": data.get("mime_type", _guess_mime(filename)),
        "source": data.get("source", "user"),
        "source_id": data.get("source_id", ""),
        "source_label": data.get("source_label", ""),
        "status": data.get("status", "completed"),
        "progress": data.get("progress", 100 if data.get("status", "completed") == "completed" else 0),
        "screenshot": data.get("screenshot", ""),
        "thumbnail": data.get("thumbnail", ""),
        "metadata": data.get("metadata", {}),
        "tags": data.get("tags", []),
        "created_at": now,
        "updated_at": now,
        "completed_at": now if data.get("status", "completed") == "completed" else None,
    }

    async with _downloads_lock:
        downloads = _load_downloads()
        downloads.append(record)
        _save_downloads(downloads)

    return record


@router.get("/downloads/{download_id}")
async def get_download(download_id: str):
    """Get a single download record by ID."""
    async with _downloads_lock:
        downloads = _load_downloads()

    record = next((d for d in downloads if d.get("id") == download_id), None)
    if not record:
        raise HTTPException(status_code=404, detail="Download not found")
    return record


@router.patch("/downloads/{download_id}")
async def update_download(download_id: str, request: Request):
    """Update a download record (status, progress, screenshot, etc.)."""
    data = await request.json()

    async with _downloads_lock:
        downloads = _load_downloads()
        idx = next((i for i, d in enumerate(downloads) if d.get("id") == download_id), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="Download not found")

        record = downloads[idx]

        # Updatable fields
        updatable = [
            "filename", "url", "file_path", "size", "mime_type",
            "status", "progress", "screenshot", "thumbnail",
            "metadata", "tags", "source_label",
        ]
        for key in updatable:
            if key in data:
                record[key] = data[key]

        record["updated_at"] = time.time()

        # Auto-set completed_at when status transitions to completed
        if data.get("status") == "completed" and not record.get("completed_at"):
            record["completed_at"] = time.time()

        downloads[idx] = record
        _save_downloads(downloads)

    return record


@router.delete("/downloads/{download_id}")
async def delete_download(download_id: str):
    """Remove a download record (does NOT delete the file on disk)."""
    async with _downloads_lock:
        downloads = _load_downloads()
        before = len(downloads)
        downloads = [d for d in downloads if d.get("id") != download_id]
        if len(downloads) == before:
            raise HTTPException(status_code=404, detail="Download not found")
        _save_downloads(downloads)

    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_MIME_MAP = {
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".7z": "application/x-7z-compressed",
    ".rar": "application/x-rar-compressed",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".json": "application/json",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".html": "text/html",
    ".md": "text/markdown",
    ".py": "text/x-python",
    ".js": "text/javascript",
    ".ts": "text/typescript",
    ".exe": "application/x-msdos-program",
    ".dmg": "application/x-apple-diskimage",
    ".deb": "application/x-debian-package",
    ".rpm": "application/x-rpm",
}


def _guess_mime(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return _MIME_MAP.get(ext, "application/octet-stream")
