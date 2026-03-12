from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from pocketpaw.api.v1.chat import _APISessionBridge, _send_message
from pocketpaw.api.v1.schemas.chat import ChatRequest, ChatResponse
from pocketpaw.api.v1.schemas.extensions import (
    CudaInfoResponse,
    ExtensionListResponse,
    ExtensionSessionResponse,
    ExtensionStatusResponse,
    ExtensionStorageDeleteResponse,
    ExtensionStorageItem,
    ExtensionStorageListResponse,
    ExtensionStorageValueRequest,
    ExtensionSummary,
    ExtensionToggleRequest,
    PluginLogResponse,
    PluginStatusResponse,
)
from pocketpaw.api.v1.schemas.sessions import SessionListResponse
from pocketpaw.config import Settings, get_access_token
from pocketpaw.extensions import (
    ExtensionTokenClaims,
    create_extension_token,
    get_extension_registry,
    get_external_extensions_dir,
)
from pocketpaw.extensions.registry import ExtensionManifest, ExtensionRecord
from pocketpaw.extensions.storage import get_extension_storage

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Extensions"])


def _summary(record: ExtensionRecord) -> ExtensionSummary:
    return ExtensionSummary.model_validate(record.to_summary())


def _error_payload() -> list[dict[str, str]]:
    registry = get_extension_registry()
    return [
        {"source": err.source, "message": err.message}
        for err in registry.errors
    ]


def _load_list_response() -> ExtensionListResponse:
    registry = get_extension_registry(force_reload=True)
    items = [_summary(record) for record in registry.list_extensions()]
    return ExtensionListResponse(extensions=items, errors=_error_payload())


def _require_admin_or_full_access(request: Request) -> None:
    if getattr(request.state, "extension_session", None) is not None:
        raise HTTPException(
            status_code=403,
            detail="Extension tokens cannot access management APIs",
        )

    api_key = getattr(request.state, "api_key", None)
    if api_key is not None and "admin" not in set(api_key.scopes):
        raise HTTPException(status_code=403, detail="Admin scope required")

    oauth_token = getattr(request.state, "oauth_token", None)
    if oauth_token is not None:
        token_scopes = set(oauth_token.scope.split()) if oauth_token.scope else set()
        if "admin" not in token_scopes:
            raise HTTPException(status_code=403, detail="Admin scope required")


class _ExtensionRuntimeContext:
    def __init__(
        self,
        *,
        record: ExtensionRecord,
        claims: ExtensionTokenClaims | None,
    ) -> None:
        self.record = record
        self.claims = claims

    @property
    def is_extension_token(self) -> bool:
        return self.claims is not None


def require_extension_runtime(*scopes: str):
    async def _check(request: Request, extension_id: str) -> _ExtensionRuntimeContext:
        registry = get_extension_registry()
        record = registry.get_enabled(extension_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Extension not found or disabled")

        claims = getattr(request.state, "extension_session", None)
        if claims is not None:
            if claims.extension_id != extension_id:
                raise HTTPException(
                    status_code=403,
                    detail="Extension token is bound to a different app",
                )
            missing = sorted(set(scopes) - set(claims.scopes))
            if missing:
                raise HTTPException(
                    status_code=403,
                    detail=f"Extension token missing required scope: {', '.join(missing)}",
                )
            return _ExtensionRuntimeContext(record=record, claims=claims)

        _require_admin_or_full_access(request)
        return _ExtensionRuntimeContext(record=record, claims=None)

    return _check


@router.get("/extensions", response_model=ExtensionListResponse)
async def list_extensions(request: Request):
    _require_admin_or_full_access(request)
    return _load_list_response()


@router.get("/extensions/status", response_model=ExtensionStatusResponse)
async def extension_status(request: Request):
    _require_admin_or_full_access(request)
    registry = get_extension_registry(force_reload=True)
    items = [_summary(record) for record in registry.list_extensions()]
    enabled_count = sum(1 for item in items if item.enabled)
    return ExtensionStatusResponse(
        extensions=items,
        errors=_error_payload(),
        total=len(items),
        enabled=enabled_count,
    )


@router.post("/extensions/reload", response_model=ExtensionStatusResponse)
async def reload_extensions(request: Request):
    _require_admin_or_full_access(request)
    registry = get_extension_registry(force_reload=True)
    items = [_summary(record) for record in registry.list_extensions()]
    enabled_count = sum(1 for item in items if item.enabled)
    return ExtensionStatusResponse(
        extensions=items,
        errors=_error_payload(),
        total=len(items),
        enabled=enabled_count,
    )


_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


@router.get("/extensions/download-sample/{extension_id}")
async def download_sample_extension(extension_id: str, request: Request):
    """Download a built-in extension as a .zip file (starter template).

    Community developers can download sample extensions like "counter"
    and use them as a starting point for their own extensions.
    """
    import io
    import zipfile
    from pathlib import Path

    _require_admin_or_full_access(request)

    # Only allow downloading built-in extensions as samples
    builtin_dir = Path(__file__).resolve().parents[2] / "extensions" / "builtin"
    ext_dir = builtin_dir / extension_id

    if not ext_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Sample '{extension_id}' not found")

    # Create zip in memory
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in sorted(ext_dir.rglob("*")):
            if file_path.is_file() and not file_path.name.startswith("."):
                arcname = file_path.relative_to(ext_dir)
                zf.write(file_path, arcname)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{extension_id}-sample.zip"'
        },
    )


@router.post("/extensions/upload", response_model=ExtensionListResponse)
async def upload_extension(request: Request, file: UploadFile, force: bool = False):
    """Upload a local extension as a ZIP file.

    The ZIP must contain an extension.json manifest at the root level
    (or inside a single wrapper directory). The extension is installed
    into ``~/.pocketpaw/extensions/<id>/``.

    If the extension ID already exists, the API returns a ``409 Conflict``
    with a detail indicating whether the user must confirm an overwrite.
    Re-send the request with ``?force=true`` to proceed.
    """
    import shutil
    import tempfile
    import zipfile
    from pathlib import Path

    from pydantic import ValidationError

    _require_admin_or_full_access(request)

    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted")

    # Read the file into memory (with size cap)
    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB)",
        )

    # Validate ZIP
    import io

    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")

    # Reject ZIPs with path traversal
    for name in zf.namelist():
        if name.startswith("/") or ".." in name:
            raise HTTPException(status_code=400, detail=f"Unsafe path in ZIP: {name}")

    # Locate extension.json — either at root or inside one wrapper folder
    manifest_path_in_zip: str | None = None
    root_prefix = ""
    if "extension.json" in zf.namelist():
        manifest_path_in_zip = "extension.json"
        root_prefix = ""
    else:
        # Check for single top-level directory containing extension.json
        top_dirs = {name.split("/")[0] for name in zf.namelist() if "/" in name}
        for d in top_dirs:
            candidate = f"{d}/extension.json"
            if candidate in zf.namelist():
                manifest_path_in_zip = candidate
                root_prefix = f"{d}/"
                break

    if manifest_path_in_zip is None:
        raise HTTPException(
            status_code=400,
            detail="ZIP must contain extension.json at the root or inside a single directory",
        )

    # Parse and validate manifest
    try:
        raw_manifest = json.loads(zf.read(manifest_path_in_zip))
    except (json.JSONDecodeError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid extension.json: {exc}")

    try:
        manifest = ExtensionManifest.model_validate(raw_manifest)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid manifest: {exc}")

    # Conflict check — require confirmation before overwriting
    registry = get_extension_registry(force_reload=True)
    existing = registry.get(manifest.id)
    if existing and not force:
        if existing.source == "builtin":
            raise HTTPException(
                status_code=409,
                detail=f"overwrite_builtin_required:{manifest.name}",
            )
        else:
            raise HTTPException(
                status_code=409,
                detail=f"overwrite_required:{manifest.name}",
            )

    # Extract to external extensions dir
    external_dir = get_external_extensions_dir()
    target_dir = external_dir / manifest.id

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            zf.extractall(tmpdir)
            src = Path(tmpdir) / root_prefix.rstrip("/") if root_prefix else Path(tmpdir)

            # Clean existing if re-uploading
            if target_dir.exists():
                shutil.rmtree(target_dir)

            shutil.copytree(src, target_dir)
    except Exception as exc:
        logger.exception("Failed to extract extension ZIP")
        raise HTTPException(status_code=500, detail=f"Failed to install extension: {exc}")
    finally:
        zf.close()

    logger.info("Installed extension '%s' v%s from upload", manifest.id, manifest.version)
    return _load_list_response()


class _InstallFromPathRequest(BaseModel):
    path: str


@router.post("/extensions/install-from-path", response_model=ExtensionListResponse)
async def install_extension_from_path(
    request: Request,
    body: _InstallFromPathRequest,
    force: bool = False,
):
    """Install an extension from a local folder on disk.

    The folder must contain an ``extension.json`` manifest at its root.
    The extension is copied into ``~/.pocketpaw/extensions/<id>/``.

    If the extension ID already exists, the API returns a ``409 Conflict``.
    Re-send the request with ``?force=true`` to proceed.
    """
    import shutil
    from pathlib import Path

    from pydantic import ValidationError

    _require_admin_or_full_access(request)

    src_dir = Path(body.path).resolve()

    if not src_dir.exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {body.path}")

    if not src_dir.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {body.path}")

    manifest_path = src_dir / "extension.json"
    if not manifest_path.exists():
        raise HTTPException(
            status_code=400,
            detail="Folder does not contain an extension.json manifest",
        )

    # Parse and validate manifest
    try:
        raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid extension.json: {exc}")

    try:
        manifest = ExtensionManifest.model_validate(raw_manifest)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid manifest: {exc}")

    # Conflict check — require confirmation before overwriting
    registry = get_extension_registry(force_reload=True)
    existing = registry.get(manifest.id)
    if existing and not force:
        if existing.source == "builtin":
            raise HTTPException(
                status_code=409,
                detail=f"overwrite_builtin_required:{manifest.name}",
            )
        else:
            raise HTTPException(
                status_code=409,
                detail=f"overwrite_required:{manifest.name}",
            )

    # Copy to external extensions dir
    external_dir = get_external_extensions_dir()
    target_dir = external_dir / manifest.id

    try:
        if target_dir.exists():
            shutil.rmtree(target_dir)
        shutil.copytree(src_dir, target_dir)
    except Exception as exc:
        logger.exception("Failed to install extension from path")
        raise HTTPException(status_code=500, detail=f"Failed to install extension: {exc}")

    logger.info(
        "Installed extension '%s' v%s from folder: %s",
        manifest.id,
        manifest.version,
        src_dir,
    )
    return _load_list_response()


@router.post("/extensions/upload-folder", response_model=ExtensionListResponse)
async def upload_extension_folder(
    request: Request,
    force: bool = False,
):
    """Upload an extension as a set of files from a folder picker.

    The frontend sends all files from a ``webkitdirectory`` input as
    multipart form fields named ``files``, with each file's relative
    path encoded in its ``filename``.  The backend reconstructs the
    folder tree, validates the manifest, and installs the extension.
    """
    import shutil
    import tempfile
    from pathlib import Path, PurePosixPath

    from pydantic import ValidationError

    _require_admin_or_full_access(request)

    form = await request.form()
    file_items = form.getlist("files")

    if not file_items:
        raise HTTPException(status_code=400, detail="No files received")

    # Write every file into a temp directory, preserving relative paths
    tmpdir_obj = tempfile.mkdtemp()
    tmpdir = Path(tmpdir_obj)

    try:
        total_bytes = 0
        for upload in file_items:
            # The filename carries the relative path (e.g. "extension.json"
            # or "css/styles.css").  Reject path traversal.
            rel = upload.filename or ""
            if not rel or ".." in rel or rel.startswith("/"):
                raise HTTPException(status_code=400, detail=f"Unsafe path: {rel}")

            dest = tmpdir / PurePosixPath(rel)
            dest.parent.mkdir(parents=True, exist_ok=True)

            data = await upload.read()
            total_bytes += len(data)
            if total_bytes > _MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"Total upload too large (max {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB)",
                )
            dest.write_bytes(data)

        # Validate manifest
        manifest_path = tmpdir / "extension.json"
        if not manifest_path.exists():
            raise HTTPException(
                status_code=400,
                detail="Folder does not contain an extension.json manifest at the root",
            )

        try:
            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            raise HTTPException(status_code=400, detail=f"Invalid extension.json: {exc}")

        try:
            manifest = ExtensionManifest.model_validate(raw_manifest)
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid manifest: {exc}")

        # Conflict check
        registry = get_extension_registry(force_reload=True)
        existing = registry.get(manifest.id)
        if existing and not force:
            if existing.source == "builtin":
                raise HTTPException(
                    status_code=409,
                    detail=f"overwrite_builtin_required:{manifest.name}",
                )
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"overwrite_required:{manifest.name}",
                )

        # Copy to external extensions dir
        external_dir = get_external_extensions_dir()
        target_dir = external_dir / manifest.id

        if target_dir.exists():
            shutil.rmtree(target_dir)
        shutil.copytree(tmpdir, target_dir)

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to install extension from folder upload")
        raise HTTPException(status_code=500, detail=f"Failed to install extension: {exc}")
    finally:
        # Clean up temp dir
        shutil.rmtree(tmpdir_obj, ignore_errors=True)

    logger.info("Installed extension '%s' v%s from folder upload", manifest.id, manifest.version)
    return _load_list_response()

@router.delete("/extensions/{extension_id}")
async def delete_extension(extension_id: str, request: Request):
    """Remove an uploaded (external) extension.

    Built-in extensions cannot be deleted — only disabled.
    """
    import shutil

    _require_admin_or_full_access(request)

    registry = get_extension_registry(force_reload=True)
    record = registry.get(extension_id)

    if record is None:
        raise HTTPException(status_code=404, detail="Extension not found")

    if not record.is_removable:
        raise HTTPException(
            status_code=403,
            detail="Built-in extensions cannot be deleted. Disable it instead.",
        )

    # Remove from disk
    try:
        shutil.rmtree(record.root_dir)
    except Exception as exc:
        logger.exception("Failed to delete extension '%s'", extension_id)
        raise HTTPException(status_code=500, detail=f"Failed to delete: {exc}")

    logger.info("Deleted extension '%s'", extension_id)

    # Reload registry
    get_extension_registry(force_reload=True)
    return {"status": "ok", "deleted": extension_id}


@router.post("/extensions/{extension_id}/enabled", response_model=ExtensionSummary)
async def update_extension_enabled(
    extension_id: str,
    body: ExtensionToggleRequest,
    request: Request,
):
    _require_admin_or_full_access(request)

    registry = get_extension_registry(force_reload=True)
    record = registry.get(extension_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Extension not found")

    settings = Settings.load()
    disabled = set(settings.extension_disabled_ids)
    enabled = set(settings.extension_enabled_ids)
    is_autostart = record.manifest.autostart

    if body.enabled:
        # Enable the extension
        disabled.discard(extension_id)
        if not is_autostart:
            # Non-autostart extensions need to be explicitly added to enabled list
            enabled.add(extension_id)
    else:
        # Disable the extension
        if is_autostart:
            # Autostart extensions need to be explicitly disabled
            disabled.add(extension_id)
        # Non-autostart extensions: remove from enabled list
        enabled.discard(extension_id)

    settings.extension_disabled_ids = sorted(disabled)
    settings.extension_enabled_ids = sorted(enabled)
    settings.save()

    registry = get_extension_registry(force_reload=True)
    record = registry.get(extension_id)
    return _summary(record)


@router.post("/extensions/{extension_id}/session", response_model=ExtensionSessionResponse)
async def create_extension_session(extension_id: str, request: Request):
    _require_admin_or_full_access(request)

    registry = get_extension_registry(force_reload=True)
    record = registry.get_enabled(extension_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Extension not found or disabled")

    settings = Settings.load()
    ttl_seconds = settings.extension_session_ttl_minutes * 60
    token = create_extension_token(
        master_token=get_access_token(),
        extension_id=record.id,
        scopes=list(record.manifest.scopes),
        ttl_seconds=ttl_seconds,
    )
    return ExtensionSessionResponse(
        extension=_summary(record),
        token=token,
        expires_at=int(time.time()) + ttl_seconds,
        expires_in_seconds=ttl_seconds,
        api_base=f"/api/v1/extensions/runtime/{record.id}",
    )


@router.get("/extensions/runtime/{extension_id}/context", response_model=ExtensionSessionResponse)
async def runtime_context(
    extension_id: str,
    ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime()),
):
    ttl_seconds = Settings.load().extension_session_ttl_minutes * 60
    claims = ctx.claims
    token = ""
    expires_at = 0
    if claims is not None:
        token = "<redacted>"
        expires_at = claims.expires_at
        ttl_seconds = max(claims.expires_at - int(time.time()), 0)
    return ExtensionSessionResponse(
        extension=_summary(ctx.record),
        token=token,
        expires_at=expires_at,
        expires_in_seconds=ttl_seconds,
        api_base=f"/api/v1/extensions/runtime/{ctx.record.id}",
    )


@router.get(
    "/extensions/runtime/{extension_id}/storage",
    response_model=ExtensionStorageListResponse,
)
async def list_extension_storage(
    extension_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("storage.read")),
):
    storage = get_extension_storage()
    data = storage.list_items(extension_id)
    items = [
        ExtensionStorageItem(key=key, value=value, exists=True)
        for key, value in sorted(data.items())
    ]
    return ExtensionStorageListResponse(items=items, total=len(items))


@router.get(
    "/extensions/runtime/{extension_id}/storage/{key}",
    response_model=ExtensionStorageItem,
)
async def get_extension_storage_item(
    extension_id: str,
    key: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("storage.read")),
):
    storage = get_extension_storage()
    exists, value = storage.get_item(extension_id, key)
    return ExtensionStorageItem(key=key, value=value, exists=exists)


@router.put(
    "/extensions/runtime/{extension_id}/storage/{key}",
    response_model=ExtensionStorageItem,
)
async def set_extension_storage_item(
    extension_id: str,
    key: str,
    body: ExtensionStorageValueRequest,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("storage.write")),
):
    storage = get_extension_storage()
    storage.set_item(extension_id, key, body.value)
    return ExtensionStorageItem(key=key, value=body.value, exists=True)


@router.delete(
    "/extensions/runtime/{extension_id}/storage/{key}",
    response_model=ExtensionStorageDeleteResponse,
)
async def delete_extension_storage_item(
    extension_id: str,
    key: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("storage.write")),
):
    storage = get_extension_storage()
    deleted = storage.delete_item(extension_id, key)
    return ExtensionStorageDeleteResponse(key=key, deleted=deleted)


@router.get(
    "/extensions/runtime/{extension_id}/sessions",
    response_model=SessionListResponse,
)
async def list_extension_sessions(
    extension_id: str,
    limit: int = 50,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("sessions.read")),
):
    from pocketpaw.memory import get_memory_manager

    manager = get_memory_manager()
    store = manager._store

    if hasattr(store, "_load_session_index"):
        index = store._load_session_index()
        entries = sorted(
            index.items(),
            key=lambda kv: kv[1].get("last_activity", ""),
            reverse=True,
        )[:limit]
        sessions = []
        for safe_key, meta in entries:
            sessions.append({"id": safe_key, **meta})
        return SessionListResponse(sessions=sessions, total=len(index))

    return SessionListResponse(sessions=[], total=0)


@router.post(
    "/extensions/runtime/{extension_id}/chat",
    response_model=ChatResponse,
)
async def extension_chat_send(
    extension_id: str,
    body: ChatRequest,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("chat.send")),
):
    chat_id = body.session_id or f"ext:{extension_id}:{uuid.uuid4().hex[:12]}"
    bridge = _APISessionBridge(chat_id)
    await bridge.start()

    await _send_message(ChatRequest(content=body.content, session_id=chat_id, media=body.media))

    full_content: list[str] = []
    usage: dict[str, object] = {}
    try:
        while True:
            try:
                event = await asyncio.wait_for(bridge.queue.get(), timeout=120)
            except TimeoutError:
                break

            if event["event"] == "chunk":
                full_content.append(event["data"].get("content", ""))
            elif event["event"] == "stream_end":
                usage = event["data"].get("usage", {})
                break
            elif event["event"] == "error":
                detail = event["data"].get("detail", "Agent error")
                raise HTTPException(status_code=500, detail=detail)
    finally:
        await bridge.stop()

    return ChatResponse(session_id=chat_id, content="".join(full_content), usage=usage)


@router.post("/extensions/runtime/{extension_id}/chat/stream")
async def extension_chat_stream(
    extension_id: str,
    body: ChatRequest,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("chat.stream")),
):
    chat_id = body.session_id or f"ext:{extension_id}:{uuid.uuid4().hex[:12]}"
    bridge = _APISessionBridge(chat_id)
    await bridge.start()
    await _send_message(ChatRequest(content=body.content, session_id=chat_id, media=body.media))

    async def _event_generator():
        try:
            yield f"event: stream_start\ndata: {json.dumps({'session_id': chat_id})}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(bridge.queue.get(), timeout=60)
                except TimeoutError:
                    continue

                yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"
                if event["event"] in {"stream_end", "error"}:
                    break
        finally:
            await bridge.stop()

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ═══════════════════════════════════════════════════════════════════════════
#  Extension Runtime — Reminders (list / create / delete)
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/extensions/runtime/{extension_id}/reminders")
async def extension_reminders_list(
    extension_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("reminders.read")),
):
    """List all active reminders."""
    from pocketpaw.scheduler import get_scheduler

    sched = get_scheduler()
    raw = sched.get_reminders()
    return [
        {
            "id": r.get("id", ""),
            "text": r.get("text", ""),
            "trigger_at": r.get("trigger_at", ""),
            "created_at": r.get("created_at", ""),
            "time_remaining": sched.format_time_remaining(r),
        }
        for r in raw
    ]


class _AddReminderBody(BaseModel):
    message: str


@router.post("/extensions/runtime/{extension_id}/reminders")
async def extension_reminders_create(
    extension_id: str,
    body: _AddReminderBody,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("reminders.write")),
):
    """Add a reminder from natural language (e.g. 'in 5 minutes to call mom')."""
    from pocketpaw.scheduler import get_scheduler

    sched = get_scheduler()
    result = sched.add_reminder(body.message)
    if result is None:
        raise HTTPException(
            status_code=400,
            detail="Could not parse time from message. Try 'in 5 minutes' or 'at 3pm'",
        )
    return {
        "id": result.get("id", ""),
        "text": result.get("text", ""),
        "trigger_at": result.get("trigger_at", ""),
        "created_at": result.get("created_at", ""),
        "time_remaining": sched.format_time_remaining(result),
    }


@router.delete("/extensions/runtime/{extension_id}/reminders/{reminder_id}")
async def extension_reminders_delete(
    extension_id: str,
    reminder_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("reminders.write")),
):
    """Delete a reminder by ID."""
    from pocketpaw.scheduler import get_scheduler

    sched = get_scheduler()
    deleted = sched.delete_reminder(reminder_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"id": reminder_id, "deleted": True}


# ═══════════════════════════════════════════════════════════════════════════
#  Extension Runtime — Intentions (CRUD / toggle / run)
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/extensions/runtime/{extension_id}/intentions")
async def extension_intentions_list(
    extension_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("intentions.read")),
):
    """List all intentions."""
    from pocketpaw.daemon.proactive import get_daemon

    daemon = get_daemon()
    return daemon.get_intentions()


class _CreateIntentionBody(BaseModel):
    name: str
    prompt: str
    trigger: dict = {}
    context_sources: list = []
    enabled: bool = True


@router.post("/extensions/runtime/{extension_id}/intentions")
async def extension_intentions_create(
    extension_id: str,
    body: _CreateIntentionBody,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("intentions.write")),
):
    """Create a new intention."""
    from pocketpaw.daemon.proactive import get_daemon

    daemon = get_daemon()
    result = daemon.create_intention(
        name=body.name,
        prompt=body.prompt,
        trigger=body.trigger,
        context_sources=body.context_sources,
        enabled=body.enabled,
    )
    return result


class _UpdateIntentionBody(BaseModel):
    name: str | None = None
    prompt: str | None = None
    trigger: dict | None = None
    context_sources: list | None = None
    enabled: bool | None = None


@router.patch("/extensions/runtime/{extension_id}/intentions/{intention_id}")
async def extension_intentions_update(
    extension_id: str,
    intention_id: str,
    body: _UpdateIntentionBody,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("intentions.write")),
):
    """Partially update an intention."""
    from pocketpaw.daemon.proactive import get_daemon

    daemon = get_daemon()
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    result = daemon.update_intention(intention_id, updates)
    if result is None:
        raise HTTPException(status_code=404, detail="Intention not found")
    return result


@router.delete("/extensions/runtime/{extension_id}/intentions/{intention_id}")
async def extension_intentions_delete(
    extension_id: str,
    intention_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("intentions.write")),
):
    """Delete an intention by ID."""
    from pocketpaw.daemon.proactive import get_daemon

    daemon = get_daemon()
    deleted = daemon.delete_intention(intention_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Intention not found")
    return {"id": intention_id, "deleted": True}


@router.post("/extensions/runtime/{extension_id}/intentions/{intention_id}/toggle")
async def extension_intentions_toggle(
    extension_id: str,
    intention_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("intentions.write")),
):
    """Toggle the enabled state of an intention."""
    from pocketpaw.daemon.proactive import get_daemon

    daemon = get_daemon()
    result = daemon.toggle_intention(intention_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Intention not found")
    return result


@router.post("/extensions/runtime/{extension_id}/intentions/{intention_id}/run")
async def extension_intentions_run(
    extension_id: str,
    intention_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("intentions.write")),
):
    """Manually trigger an intention to run now."""
    from pocketpaw.daemon.proactive import get_daemon

    daemon = get_daemon()
    intentions = daemon.get_intentions()
    intention = next((i for i in intentions if i.get("id") == intention_id), None)
    if intention is None:
        raise HTTPException(status_code=404, detail="Intention not found")

    asyncio.create_task(daemon.run_intention_now(intention_id))
    return {
        "id": intention_id,
        "status": "running",
        "message": f"Running intention: {intention.get('name', '')}",
    }


# ═══════════════════════════════════════════════════════════════════════════
#  Extension Runtime — Long-term Memory (list / delete)
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/extensions/runtime/{extension_id}/memory")
async def extension_memory_list(
    extension_id: str,
    limit: int = 50,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("memory.read")),
):
    """Get long-term memories."""
    from pocketpaw.memory import MemoryType, get_memory_manager

    manager = get_memory_manager()
    items = await manager._store.get_by_type(MemoryType.LONG_TERM, limit=limit)
    return [
        {
            "id": item.id,
            "content": item.content,
            "timestamp": (
                item.created_at.isoformat()
                if hasattr(item.created_at, "isoformat")
                else str(item.created_at)
            ),
            "tags": item.tags,
        }
        for item in items
    ]


@router.delete("/extensions/runtime/{extension_id}/memory/{entry_id}")
async def extension_memory_delete(
    extension_id: str,
    entry_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("memory.write")),
):
    """Delete a long-term memory entry by ID."""
    from pocketpaw.memory import get_memory_manager

    manager = get_memory_manager()
    deleted = await manager._store.delete(entry_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory entry not found")
    return {"id": entry_id, "deleted": True}


# ═══════════════════════════════════════════════════════════════════════════
#  Extension Runtime — Skills (list)
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/extensions/runtime/{extension_id}/skills")
async def extension_skills_list(
    extension_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("skills.read")),
):
    """List all installed user-invocable skills."""
    from pocketpaw.skills import get_skill_loader

    loader = get_skill_loader()
    loader.reload()
    return [
        {"name": s.name, "description": s.description, "argument_hint": s.argument_hint}
        for s in loader.get_invocable()
    ]


# ═══════════════════════════════════════════════════════════════════════════
#  Extension Runtime — Health & Version (read-only)
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/extensions/runtime/{extension_id}/health")
async def extension_health(
    extension_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("health.read")),
):
    """Get health summary for the PocketPaw server."""
    try:
        from pocketpaw.health import get_health_engine

        engine = get_health_engine()
        return engine.summary.model_dump() if hasattr(engine.summary, "model_dump") else {}
    except Exception as e:
        return {"error": str(e)}


@router.get("/extensions/runtime/{extension_id}/version")
async def extension_version(
    extension_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("health.read")),
):
    """Get PocketPaw version info."""
    import sys

    from pocketpaw import __version__
    from pocketpaw.config import Settings

    settings = Settings.load()
    return {
        "version": __version__,
        "python": sys.version,
        "agent_backend": settings.agent_backend,
    }


# ═══════════════════════════════════════════════════════════════════════════
#  Extension Runtime — Events SSE stream
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/extensions/runtime/{extension_id}/events/stream")
async def extension_events_stream(
    extension_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("events.read")),
):
    """Subscribe to real-time system events via SSE (scoped to extension)."""
    queue: asyncio.Queue = asyncio.Queue()

    async def _subscribe():
        from pocketpaw.bus import get_message_bus
        from pocketpaw.bus.events import SystemEvent

        bus = get_message_bus()

        async def _on_event(evt: SystemEvent) -> None:
            await queue.put(
                {
                    "event": evt.event_type,
                    "data": evt.data or {},
                }
            )

        bus.subscribe_system(_on_event)
        return _on_event

    sub = await _subscribe()

    async def _event_generator():
        try:
            yield f"event: connected\ndata: {json.dumps({'status': 'ok', 'extension_id': extension_id})}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"event: {event['event']}\ndata: {json.dumps(event)}\n\n"
                except TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            from pocketpaw.bus import get_message_bus

            bus = get_message_bus()
            bus.unsubscribe_system(sub)

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ═══════════════════════════════════════════════════════════════════════════
#  Extension Runtime — Notifications (push toasts / broadcasts)
# ═══════════════════════════════════════════════════════════════════════════
#  Inspired by OpenClaw: plugins can surface information in the dashboard
#  without requiring the user to be inside the extension's iframe.


class _NotificationBody(BaseModel):
    title: str
    message: str = ""
    level: str = "info"  # info | success | warning | error
    duration: int = 5000  # milliseconds, 0 = sticky


@router.post("/extensions/runtime/{extension_id}/notifications")
async def extension_notify(
    extension_id: str,
    body: _NotificationBody,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("notifications.write")),
):
    """Push a toast/notification to the dashboard."""
    from pocketpaw.dashboard_state import active_connections

    payload = {
        "type": "extension_notification",
        "extension_id": extension_id,
        "title": body.title,
        "message": body.message,
        "level": body.level,
        "duration": body.duration,
    }
    # Broadcast to all connected WS clients
    for ws in list(active_connections):
        try:
            await ws.send_json(payload)
        except Exception:
            pass  # Connection may be closed
    return {"sent": True, "to": len(active_connections)}


class _BroadcastBody(BaseModel):
    event: str
    data: dict = {}


@router.post("/extensions/runtime/{extension_id}/broadcast")
async def extension_broadcast(
    extension_id: str,
    body: _BroadcastBody,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("notifications.write")),
):
    """Emit a custom event on the system bus (other extensions/listeners can receive it)."""
    from pocketpaw.bus import get_message_bus
    from pocketpaw.bus.events import SystemEvent

    bus = get_message_bus()
    await bus.publish_system(
        SystemEvent(
            event_type=f"extension:{extension_id}:{body.event}",
            data=body.data,
        )
    )
    return {"broadcast": True, "event": f"extension:{extension_id}:{body.event}"}


# ═══════════════════════════════════════════════════════════════════════════
#  Extension Runtime — Commands (register slash commands from extensions)
# ═══════════════════════════════════════════════════════════════════════════
#  Inspired by OpenClaw's api.registerCommand(): extensions can register
#  auto-reply slash commands that work without invoking the AI agent.

# In-memory command registry (persists for the lifetime of the server)
_extension_commands: dict[str, dict] = {}


class _RegisterCommandBody(BaseModel):
    name: str  # command name without leading /
    description: str = ""
    accepts_args: bool = False
    response_text: str | None = None  # static response; for dynamic, use webhook_url
    webhook_url: str | None = None  # called with POST {args, sender} for dynamic response


@router.post("/extensions/runtime/{extension_id}/commands")
async def extension_register_command(
    extension_id: str,
    body: _RegisterCommandBody,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("commands.write")),
):
    """Register a slash command that routes to this extension."""
    import re

    cmd_name = body.name.lower().strip().lstrip("/")
    if not re.match(r"^[a-z][a-z0-9_-]{0,31}$", cmd_name):
        raise HTTPException(
            status_code=400,
            detail="Command name must start with a letter and contain only a-z, 0-9, -, _",
        )

    # Prevent overriding reserved commands
    reserved = {"help", "status", "reset", "new", "clear", "skills", "reminders"}
    if cmd_name in reserved:
        raise HTTPException(status_code=400, detail=f"/{cmd_name} is a reserved command")

    _extension_commands[cmd_name] = {
        "name": cmd_name,
        "extension_id": extension_id,
        "description": body.description,
        "accepts_args": body.accepts_args,
        "response_text": body.response_text,
        "webhook_url": body.webhook_url,
    }
    return {"registered": True, "command": f"/{cmd_name}"}


@router.get("/extensions/runtime/{extension_id}/commands")
async def extension_list_commands(
    extension_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("commands.read")),
):
    """List commands registered by this extension."""
    return [
        cmd for cmd in _extension_commands.values()
        if cmd["extension_id"] == extension_id
    ]


@router.delete("/extensions/runtime/{extension_id}/commands/{command_name}")
async def extension_unregister_command(
    extension_id: str,
    command_name: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("commands.write")),
):
    """Unregister a command owned by this extension."""
    cmd = _extension_commands.get(command_name)
    if not cmd or cmd["extension_id"] != extension_id:
        raise HTTPException(status_code=404, detail="Command not found")
    del _extension_commands[command_name]
    return {"unregistered": True, "command": f"/{command_name}"}


# Public endpoint for the dashboard/agent to look up extension commands
@router.get("/extensions/commands")
async def list_all_extension_commands(request: Request):
    """List all extension-registered commands (public, no scope check)."""
    return list(_extension_commands.values())


# ═══════════════════════════════════════════════════════════════════════════
#  Extension Runtime — Agent Tools (expose tools to the AI agent)
# ═══════════════════════════════════════════════════════════════════════════
#  Inspired by OpenClaw's agent tool registration: extensions can register
#  tools that the AI agent can call, bridging extension functionality
#  into the agent's tool-use capabilities.

_extension_tools: dict[str, dict] = {}


class _ToolParamSchema(BaseModel):
    name: str
    type: str = "string"
    description: str = ""
    required: bool = False


class _RegisterToolBody(BaseModel):
    name: str  # snake_case tool name
    description: str
    parameters: list[_ToolParamSchema] = []
    webhook_url: str  # POST'd with {params} when the agent calls this tool


@router.post("/extensions/runtime/{extension_id}/tools")
async def extension_register_tool(
    extension_id: str,
    body: _RegisterToolBody,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("tools.write")),
):
    """Register a tool that the AI agent can invoke."""
    import re

    tool_name = body.name.lower().strip()
    if not re.match(r"^[a-z][a-z0-9_]{0,63}$", tool_name):
        raise HTTPException(
            status_code=400,
            detail="Tool name must be snake_case (a-z, 0-9, _)",
        )

    _extension_tools[tool_name] = {
        "name": tool_name,
        "extension_id": extension_id,
        "description": body.description,
        "parameters": [p.model_dump() for p in body.parameters],
        "webhook_url": body.webhook_url,
    }
    return {"registered": True, "tool": tool_name}


@router.get("/extensions/runtime/{extension_id}/tools")
async def extension_list_tools(
    extension_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("tools.read")),
):
    """List tools registered by this extension."""
    return [
        tool for tool in _extension_tools.values()
        if tool["extension_id"] == extension_id
    ]


@router.delete("/extensions/runtime/{extension_id}/tools/{tool_name}")
async def extension_unregister_tool(
    extension_id: str,
    tool_name: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("tools.write")),
):
    """Unregister a tool owned by this extension."""
    tool = _extension_tools.get(tool_name)
    if not tool or tool["extension_id"] != extension_id:
        raise HTTPException(status_code=404, detail="Tool not found")
    del _extension_tools[tool_name]
    return {"unregistered": True, "tool": tool_name}


# Public endpoint — used by agent loop to discover plugin-registered tools
@router.get("/extensions/tools")
async def list_all_extension_tools(request: Request):
    """List all extension-registered agent tools (public)."""
    return list(_extension_tools.values())


# ═══════════════════════════════════════════════════════════════════════════
#  Extension Runtime — Settings (read/write server config)
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/extensions/runtime/{extension_id}/settings")
async def extension_settings_get(
    extension_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("settings.read")),
):
    """Get current PocketPaw settings (safe subset)."""
    from pocketpaw.config import Settings

    settings = Settings.load()
    return {
        "agent_backend": settings.agent_backend,
        "llm_provider": settings.llm_provider,
        "web_search_provider": settings.web_search_provider,
        "tts_provider": settings.tts_provider,
        "stt_provider": settings.stt_provider,
        "memory_backend": settings.memory_backend,
        "tool_profile": settings.tool_profile,
        "plan_mode": settings.plan_mode,
        "bypass_permissions": settings.bypass_permissions,
    }


class _SettingsPatchBody(BaseModel):
    agent_backend: str | None = None
    llm_provider: str | None = None
    web_search_provider: str | None = None
    tts_provider: str | None = None
    stt_provider: str | None = None
    tool_profile: str | None = None
    plan_mode: bool | None = None


@router.patch("/extensions/runtime/{extension_id}/settings")
async def extension_settings_patch(
    extension_id: str,
    body: _SettingsPatchBody,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("settings.write")),
):
    """Update PocketPaw settings (from extension scope)."""
    from pocketpaw.config import Settings

    settings = Settings.load()
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    for key, value in updates.items():
        if hasattr(settings, key):
            setattr(settings, key, value)
    settings.save()
    return {"updated": list(updates.keys())}


# ═══════════════════════════════════════════════════════════════════════════
#  Extension Runtime — Config Store (per-extension validated config)
# ═══════════════════════════════════════════════════════════════════════════
#  Inspired by OpenClaw's configSchema + uiHints: each extension can
#  have its own configuration separate from key-value storage.


@router.get("/extensions/runtime/{extension_id}/config")
async def extension_config_get(
    extension_id: str,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("storage.read")),
):
    """Get the extension's configuration (stored in config.json alongside extension.json)."""
    from pocketpaw.extensions.registry import get_extension_registry

    registry = get_extension_registry()
    ext = registry.get(extension_id)
    if not ext:
        raise HTTPException(status_code=404, detail="Extension not found")

    config_path = ext.root_dir / "config.json"
    if config_path.exists():
        try:
            return json.loads(config_path.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


class _ConfigPutBody(BaseModel):
    config: dict


@router.put("/extensions/runtime/{extension_id}/config")
async def extension_config_put(
    extension_id: str,
    body: _ConfigPutBody,
    _ctx: _ExtensionRuntimeContext = Depends(require_extension_runtime("storage.write")),
):
    """Save the extension's configuration."""
    from pocketpaw.extensions.registry import get_extension_registry

    registry = get_extension_registry()
    ext = registry.get(extension_id)
    if not ext:
        raise HTTPException(status_code=404, detail="Extension not found")

    config_path = ext.root_dir / "config.json"
    config_path.write_text(json.dumps(body.config, indent=2), encoding="utf-8")
    return {"saved": True}


# ═══════════════════════════════════════════════════════════════════════════
#  Plugin Management Endpoints
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/plugins/cuda", response_model=CudaInfoResponse)
async def get_cuda_info_endpoint(request: Request):
    """Detect CUDA / GPU availability."""
    _require_admin_or_full_access(request)

    from pocketpaw.extensions.cuda import get_cuda_info

    info = await get_cuda_info()
    return CudaInfoResponse(
        available=info.available,
        driver_version=info.driver_version,
        cuda_version=info.cuda_version,
        device_name=info.device_name,
        vram_mb=info.vram_mb,
        vram_gb=info.vram_gb,
        cuda_tag=info.cuda_tag,
        platform=info.platform,
        summary=info.summary_line(),
    )


@router.get("/plugins/node")
async def get_node_info_endpoint(request: Request):
    """Detect Node.js / pnpm availability."""
    _require_admin_or_full_access(request)

    from pocketpaw.extensions.nodejs import get_node_info

    info = await get_node_info()
    return {
        "node_available": info.node_available,
        "node_version": info.node_version,
        "node_path": info.node_path,
        "pnpm_available": info.pnpm_available,
        "pnpm_version": info.pnpm_version,
        "pnpm_path": info.pnpm_path,
        "managed": info.managed,
        "summary": info.summary_line(),
    }


@router.post("/plugins/{plugin_id}/install", response_model=PluginStatusResponse)
async def install_plugin(plugin_id: str, request: Request):
    """Install a plugin: create venv, install deps, PyTorch, etc.

    Returns immediately with status="installing". Poll the status endpoint
    to track progress.
    """
    _require_admin_or_full_access(request)

    from pocketpaw.extensions.procs import get_plugin_process_manager

    registry = get_extension_registry(force_reload=True)
    record = registry.get(plugin_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Extension not found")
    if not record.is_plugin:
        raise HTTPException(status_code=400, detail="Extension is not a plugin type")

    sandbox = record.get_sandbox_manager()
    if sandbox is None:
        raise HTTPException(status_code=400, detail="Plugin has no sandbox configuration")

    mgr = get_plugin_process_manager()
    existing = mgr.get(plugin_id)
    if existing and existing.is_alive:
        # Already installing/running — return current status instead of error
        return PluginStatusResponse(
            plugin_id=plugin_id,
            status=existing.status,
            install_progress=existing.install_progress,
            is_installed=record.is_installed,
        )

    # Start install in background
    install_steps = record.manifest.install.steps if record.manifest.install else None

    async def _do_install():
        try:
            await mgr.install(plugin_id, sandbox, install_steps=install_steps)
        except Exception:
            logger.exception("Plugin %s install background task failed", plugin_id)

    asyncio.create_task(_do_install())

    # Give the task a moment to start and set its own status
    await asyncio.sleep(0.1)

    proc = mgr.get_or_create(plugin_id)

    return PluginStatusResponse(
        plugin_id=plugin_id,
        status=proc.status,
        install_progress=proc.install_progress,
        is_installed=record.is_installed,
    )


@router.post("/plugins/{plugin_id}/start", response_model=PluginStatusResponse)
async def start_plugin(plugin_id: str, request: Request):
    """Start a plugin daemon process.

    Optionally accepts JSON body with {"model": "filename.gguf"} to select
    which model to load.  If not provided, picks the first GGUF in models/.
    """
    _require_admin_or_full_access(request)

    from pocketpaw.extensions.procs import get_plugin_process_manager

    registry = get_extension_registry(force_reload=True)
    record = registry.get(plugin_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Extension not found")
    if not record.is_plugin:
        raise HTTPException(status_code=400, detail="Extension is not a plugin type")
    if not record.manifest.start:
        raise HTTPException(status_code=400, detail="Plugin has no start configuration")

    sandbox = record.get_sandbox_manager()
    if sandbox is None:
        raise HTTPException(status_code=400, detail="Plugin has no sandbox configuration")
    if not sandbox.is_installed:
        raise HTTPException(status_code=400, detail="Plugin is not installed yet. Run install first.")

    # Determine which model to use (only needed if command uses __MODEL__)
    from copy import deepcopy
    start_cfg = deepcopy(record.manifest.start)

    # Parse request body for model and engine selection
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    # Engine switching: if "node" engine selected, swap the command
    engine = (body.get("engine") or "python").strip().lower() if body else "python"
    if engine == "node":
        start_cfg.command = "node node_server.mjs --host 127.0.0.1 --port __PORT__"

    needs_model = "__MODEL__" in start_cfg.command or (
        ("llama_cpp.server" in start_cfg.command or "node_server.mjs" in start_cfg.command)
        and "--model" not in start_cfg.command
    )

    if needs_model:
        model_file = body.get("model", "").strip() if body else ""
        if not model_file:
            # Auto-pick the smallest GGUF file in models/ (smallest is safest default)
            models_dir = record.root_dir / "models"
            if models_dir.exists():
                gguf_paths = sorted(
                    (p for p in models_dir.iterdir()
                     if p.is_file() and p.suffix.lower() in (".gguf", ".bin")),
                    key=lambda p: p.stat().st_size,
                )
                if gguf_paths:
                    model_file = gguf_paths[0].name

        if not model_file:
            raise HTTPException(
                status_code=400,
                detail="No model found. Download a GGUF model first.",
            )

        # Build the model path (relative to plugin root for portability)
        model_path = str(record.root_dir / "models" / model_file)

        # Inject the model path into the command
        if "__MODEL__" in start_cfg.command:
            start_cfg.command = start_cfg.command.replace("__MODEL__", model_path)
        # If command still has no --model flag, append it
        if "--model" not in start_cfg.command:
            start_cfg.command += f' --model "{model_path}"'

    mgr = get_plugin_process_manager()
    proc = await mgr.start(plugin_id, sandbox, start_cfg)

    return PluginStatusResponse(
        plugin_id=plugin_id,
        status=proc.status,
        pid=proc.pid,
        port=proc.port,
        url=proc.url,
        started_at=proc.started_at,
        is_installed=True,
    )


@router.post("/plugins/{plugin_id}/stop", response_model=PluginStatusResponse)
async def stop_plugin(plugin_id: str, request: Request):
    """Stop a running plugin process."""
    _require_admin_or_full_access(request)

    from pocketpaw.extensions.procs import get_plugin_process_manager

    mgr = get_plugin_process_manager()
    proc = await mgr.stop(plugin_id)
    if proc is None:
        raise HTTPException(status_code=404, detail="No process found for this plugin")

    return PluginStatusResponse(
        plugin_id=plugin_id,
        status=proc.status,
        stopped_at=proc.stopped_at,
        is_installed=True,
    )


@router.get("/plugins/{plugin_id}/status", response_model=PluginStatusResponse)
async def get_plugin_status(plugin_id: str, request: Request):
    """Get the current status of a plugin process."""
    _require_admin_or_full_access(request)

    from pocketpaw.extensions.procs import get_plugin_process_manager

    registry = get_extension_registry()
    record = registry.get(plugin_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Extension not found")

    mgr = get_plugin_process_manager()
    proc = mgr.get(plugin_id)

    if proc is None:
        return PluginStatusResponse(
            plugin_id=plugin_id,
            status="stopped",
            is_installed=record.is_installed,
        )

    return PluginStatusResponse(
        plugin_id=plugin_id,
        status=proc.status,
        pid=proc.pid,
        port=proc.port,
        url=proc.url,
        started_at=proc.started_at,
        stopped_at=proc.stopped_at,
        error=proc.error,
        install_progress=proc.install_progress,
        uptime_seconds=proc.uptime_seconds,
        is_installed=record.is_installed,
    )


@router.get("/plugins/{plugin_id}/logs", response_model=PluginLogResponse)
async def get_plugin_logs(plugin_id: str, request: Request, tail: int = 200):
    """Get recent log lines from a plugin process."""
    _require_admin_or_full_access(request)

    from pocketpaw.extensions.procs import get_plugin_process_manager

    mgr = get_plugin_process_manager()
    lines = mgr.get_logs(plugin_id, tail=tail)

    return PluginLogResponse(
        plugin_id=plugin_id,
        lines=lines,
        total=len(lines),
    )


@router.delete("/plugins/{plugin_id}/env")
async def reset_plugin_env(plugin_id: str, request: Request):
    """Delete the plugin's venv (reset to pre-install state)."""
    _require_admin_or_full_access(request)

    from pocketpaw.extensions.procs import get_plugin_process_manager

    registry = get_extension_registry()
    record = registry.get(plugin_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Extension not found")
    if not record.is_plugin:
        raise HTTPException(status_code=400, detail="Extension is not a plugin type")

    # Stop if running
    mgr = get_plugin_process_manager()
    proc = mgr.get(plugin_id)
    if proc and proc.is_alive:
        await mgr.stop(plugin_id)

    # Delete venv
    sandbox = record.get_sandbox_manager()
    if sandbox:
        await sandbox.delete_venv()

    return {"status": "ok", "plugin_id": plugin_id, "message": "Environment reset"}


class _RebuildEngineRequest(BaseModel):
    cuda: bool = False


@router.post("/plugins/{plugin_id}/rebuild-engine")
async def rebuild_plugin_engine(
    plugin_id: str,
    request: Request,
    body: _RebuildEngineRequest | None = None,
):
    """Rebuild llama-cpp-python from source with the latest llama.cpp.

    This clones the llama-cpp-python repo, updates its llama.cpp
    submodule to the latest commit, and builds/installs into the
    plugin's venv.  Optionally builds with CUDA support.

    The process runs in the background.  Poll ``/plugins/{plugin_id}/status``
    and ``/plugins/{plugin_id}/logs`` for progress.
    """
    _require_admin_or_full_access(request)

    from pocketpaw.extensions.procs import get_plugin_process_manager

    registry = get_extension_registry()
    record = registry.get(plugin_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Extension not found")
    if not record.is_plugin:
        raise HTTPException(status_code=400, detail="Extension is not a plugin type")

    sandbox = record.get_sandbox_manager()
    if sandbox is None or not sandbox.is_installed:
        raise HTTPException(
            status_code=400,
            detail="Plugin is not installed yet. Run install first.",
        )

    # Stop any running process
    mgr = get_plugin_process_manager()
    proc = mgr.get(plugin_id)
    if proc and proc.is_alive:
        await mgr.stop(plugin_id)

    rebuild_script = record.root_dir / "rebuild_engine.py"
    if not rebuild_script.exists():
        raise HTTPException(
            status_code=400,
            detail="rebuild_engine.py not found in plugin root",
        )

    use_cuda = body.cuda if body else False

    # Run the rebuild as a managed process so logs are captured
    cmd_parts = [str(sandbox.python_path), str(rebuild_script)]
    if use_cuda:
        cmd_parts.append("--cuda")

    async def _do_rebuild():
        proc_entry = mgr.get_or_create(plugin_id)
        proc_entry.status = "installing"
        proc_entry.install_progress = 0.0
        proc_entry.error = None
        proc_entry.log_lines = []

        output_queue: asyncio.Queue[str] = asyncio.Queue()

        async def _drain_output():
            while True:
                try:
                    line = await asyncio.wait_for(output_queue.get(), timeout=0.5)
                    proc_entry.push_log(line)
                except (TimeoutError, asyncio.TimeoutError):
                    if proc_entry.status != "installing":
                        break
                except asyncio.CancelledError:
                    break

        drain_task = asyncio.create_task(_drain_output())

        try:
            env = sandbox.get_env()
            env["PYTHONUNBUFFERED"] = "1"

            rc = await sandbox._run_cmd(
                cmd_parts,
                cwd=record.root_dir,
                env=env,
                on_output=output_queue,
            )

            if rc == 0:
                proc_entry.status = "stopped"
                proc_entry.install_progress = 1.0
                logger.info("Plugin %s engine rebuild complete", plugin_id)
            else:
                proc_entry.status = "error"
                proc_entry.error = f"Engine rebuild failed (exit code {rc})"
                logger.error("Plugin %s engine rebuild failed with code %d", plugin_id, rc)
        except Exception as exc:
            logger.exception("Plugin %s engine rebuild error", plugin_id)
            proc_entry.status = "error"
            proc_entry.error = str(exc)
        finally:
            drain_task.cancel()
            try:
                await drain_task
            except asyncio.CancelledError:
                pass

    asyncio.create_task(_do_rebuild())
    await asyncio.sleep(0.1)

    proc = mgr.get_or_create(plugin_id)
    return PluginStatusResponse(
        plugin_id=plugin_id,
        status=proc.status,
        install_progress=proc.install_progress,
        is_installed=record.is_installed,
    )


@router.post("/plugins/{plugin_id}/uninstall")
async def uninstall_plugin(plugin_id: str, request: Request):
    """Full uninstall: stop daemon, delete venv, upstream/, and built assets.

    Resets the plugin to the state it was in right after cloning the repo
    (only config files like extension.json, build.py, requirements.txt remain).
    """
    import shutil

    _require_admin_or_full_access(request)

    from pocketpaw.extensions.procs import get_plugin_process_manager

    registry = get_extension_registry(force_reload=True)
    record = registry.get(plugin_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Extension not found")
    if not record.is_plugin:
        raise HTTPException(status_code=400, detail="Extension is not a plugin type")

    root = record.root_dir
    removed: list[str] = []

    # 1. Stop daemon if running
    mgr = get_plugin_process_manager()
    proc = mgr.get(plugin_id)
    if proc and proc.is_alive:
        await mgr.stop(plugin_id)
        removed.append("daemon")

    # 2. Delete venv
    sandbox = record.get_sandbox_manager()
    if sandbox and sandbox.venv_path.exists():
        await sandbox.delete_venv()
        removed.append("venv")

    # 3. Delete upstream/ (cloned source)
    upstream_dir = root / "upstream"
    if upstream_dir.exists():
        shutil.rmtree(upstream_dir, ignore_errors=True)
        removed.append("upstream")

    # 4. Delete built assets (index.html + assets/)
    index_html = root / "index.html"
    if index_html.exists():
        index_html.unlink()
        removed.append("index.html")

    assets_dir = root / "assets"
    if assets_dir.exists():
        shutil.rmtree(assets_dir, ignore_errors=True)
        removed.append("assets")

    # 5. Delete models/ (optional, only if exists)
    models_dir = root / "models"
    if models_dir.exists():
        shutil.rmtree(models_dir, ignore_errors=True)
        removed.append("models")

    logger.info("Uninstalled plugin '%s': removed %s", plugin_id, ", ".join(removed))

    return {
        "status": "ok",
        "plugin_id": plugin_id,
        "removed": removed,
        "message": f"Uninstalled: {', '.join(removed)}" if removed else "Nothing to uninstall",
    }


@router.post("/plugins/{plugin_id}/update")
async def update_plugin(plugin_id: str, request: Request):
    """Update a plugin: stop, clean upstream + assets, then re-run install.

    This is equivalent to uninstall (without deleting venv/models) + reinstall.
    The venv is kept to avoid re-downloading Python; only upstream source
    and built frontend are refreshed.

    Returns immediately with status="installing". Poll the status endpoint.
    """
    import shutil

    _require_admin_or_full_access(request)

    from pocketpaw.extensions.procs import get_plugin_process_manager

    registry = get_extension_registry(force_reload=True)
    record = registry.get(plugin_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Extension not found")
    if not record.is_plugin:
        raise HTTPException(status_code=400, detail="Extension is not a plugin type")

    root = record.root_dir

    # 1. Stop daemon if running
    mgr = get_plugin_process_manager()
    proc = mgr.get(plugin_id)
    if proc and proc.is_alive:
        await mgr.stop(plugin_id)

    # 2. Delete upstream/ (will be re-cloned by build.py)
    upstream_dir = root / "upstream"
    if upstream_dir.exists():
        shutil.rmtree(upstream_dir, ignore_errors=True)

    # 3. Delete built assets (will be rebuilt)
    index_html = root / "index.html"
    if index_html.exists():
        index_html.unlink()
    assets_dir = root / "assets"
    if assets_dir.exists():
        shutil.rmtree(assets_dir, ignore_errors=True)

    # 4. Re-run install steps in background
    sandbox = record.get_sandbox_manager()
    if sandbox is None:
        raise HTTPException(status_code=400, detail="Plugin has no sandbox configuration")

    install_steps = record.manifest.install.steps if record.manifest.install else None

    async def _do_update():
        try:
            await mgr.install(plugin_id, sandbox, install_steps=install_steps)
        except Exception:
            logger.exception("Plugin %s update background task failed", plugin_id)

    asyncio.create_task(_do_update())
    await asyncio.sleep(0.1)

    proc = mgr.get_or_create(plugin_id)
    return PluginStatusResponse(
        plugin_id=plugin_id,
        status=proc.status,
        install_progress=proc.install_progress,
        is_installed=record.is_installed,
    )


_MAX_MODEL_BYTES = 20 * 1024 * 1024 * 1024  # 20 GB


@router.post("/plugins/{plugin_id}/upload-model")
async def upload_model_file(plugin_id: str, request: Request, file: UploadFile):
    """Upload a GGUF model file to the plugin's models/ directory.

    The frontend downloads the model via the browser and uploads it here
    so we can save it to the correct location on disk.
    """
    import shutil

    _require_admin_or_full_access(request)

    registry = get_extension_registry()
    record = registry.get(plugin_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Extension not found")
    if not record.is_plugin:
        raise HTTPException(status_code=400, detail="Extension is not a plugin type")

    filename = file.filename or "model.gguf"
    # Sanitize filename
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    models_dir = record.root_dir / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    target = models_dir / filename

    # Stream to disk to avoid loading the whole model into memory
    total = 0
    with open(target, "wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
            total += len(chunk)
            if total > _MAX_MODEL_BYTES:
                # Clean up partial file
                f.close()
                target.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Model file too large (max 20 GB)")
            f.write(chunk)

    logger.info("Saved model '%s' (%d MB) for plugin '%s'", filename, total // (1024 * 1024), plugin_id)

    return {
        "status": "ok",
        "plugin_id": plugin_id,
        "file": filename,
        "size_bytes": total,
    }


@router.get("/plugins/{plugin_id}/models")
async def list_plugin_models(plugin_id: str, request: Request):
    """List downloaded GGUF model files for a plugin."""
    _require_admin_or_full_access(request)

    registry = get_extension_registry()
    record = registry.get(plugin_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Extension not found")

    models_dir = record.root_dir / "models"
    if not models_dir.exists():
        return {"plugin_id": plugin_id, "models": []}

    models = []
    for p in sorted(models_dir.iterdir()):
        if p.is_file() and p.suffix.lower() in (".gguf", ".bin"):
            models.append({
                "file": p.name,
                "size_bytes": p.stat().st_size,
                "size_mb": round(p.stat().st_size / (1024 * 1024), 1),
            })

    return {"plugin_id": plugin_id, "models": models}


class _DownloadModelRequest(BaseModel):
    repo: str
    file: str


@router.post("/plugins/{plugin_id}/download-model")
async def download_model_from_hf(
    plugin_id: str,
    body: _DownloadModelRequest,
    request: Request,
):
    """Download a GGUF model from Hugging Face directly on the server.

    Streams the file from HuggingFace to the plugin's ``models/`` directory,
    bypassing browser CORS restrictions.  Returns an SSE stream with progress.
    """
    import httpx

    _require_admin_or_full_access(request)

    registry = get_extension_registry()
    record = registry.get(plugin_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Extension not found")
    if not record.is_plugin:
        raise HTTPException(status_code=400, detail="Extension is not a plugin type")

    repo = body.repo.strip()
    filename = body.file.strip()

    if not repo or not filename:
        raise HTTPException(status_code=400, detail="repo and file are required")
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    models_dir = record.root_dir / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    target = models_dir / filename

    url = f"https://huggingface.co/{repo}/resolve/main/{filename}"

    async def _stream_download():
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=httpx.Timeout(30, read=300)) as client:
                async with client.stream("GET", url) as resp:
                    if resp.status_code != 200:
                        yield f"data: {json.dumps({'event': 'error', 'detail': f'HF returned {resp.status_code}'})}\n\n"
                        return

                    total = int(resp.headers.get("content-length", 0))
                    received = 0

                    yield f"data: {json.dumps({'event': 'start', 'total': total, 'file': filename})}\n\n"

                    with open(target, "wb") as f:
                        async for chunk in resp.aiter_bytes(chunk_size=1024 * 1024):
                            f.write(chunk)
                            received += len(chunk)
                            pct = round((received / total) * 100) if total else 0
                            # Send progress every ~2 MB to avoid flooding
                            if received % (2 * 1024 * 1024) < (1024 * 1024):
                                yield f"data: {json.dumps({'event': 'progress', 'received': received, 'total': total, 'percent': pct})}\n\n"

                    yield f"data: {json.dumps({'event': 'done', 'file': filename, 'size_bytes': received})}\n\n"

                    logger.info(
                        "Downloaded model '%s' (%d MB) from %s for plugin '%s'",
                        filename, received // (1024 * 1024), repo, plugin_id,
                    )

        except Exception as exc:
            logger.exception("Model download failed: %s", exc)
            # Clean up partial file
            if target.exists():
                target.unlink(missing_ok=True)
            yield f"data: {json.dumps({'event': 'error', 'detail': str(exc)})}\n\n"

    return StreamingResponse(
        _stream_download(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.api_route("/plugins/{plugin_id}/proxy/{proxy_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def proxy_plugin_request(plugin_id: str, proxy_path: str, request: Request):
    """Reverse proxy requests to a running plugin server.

    Forwards the request to the plugin's local server, bypassing CORS
    restrictions that prevent the iframe from talking directly to
    http://127.0.0.1:{port}.

    Supports all HTTP methods (GET, POST, PUT, DELETE, etc.) to enable
    full-featured backends like Gradio.
    """
    import httpx

    _require_admin_or_full_access(request)

    from pocketpaw.extensions.procs import get_plugin_process_manager

    mgr = get_plugin_process_manager()
    proc = mgr.get(plugin_id)

    if proc is None or proc.status != "running" or not proc.port:
        # Auto-start the plugin if it's installed but not running
        registry = get_extension_registry()
        record = registry.get(plugin_id)
        if record and record.is_plugin and record.is_installed and record.manifest.start:
            sandbox = record.get_sandbox_manager()
            if sandbox and sandbox.is_installed:
                from copy import deepcopy
                start_cfg = deepcopy(record.manifest.start)
                try:
                    proc = await mgr.start(plugin_id, sandbox, start_cfg)
                    # Wait up to 15 seconds for the daemon to become ready
                    for _ in range(30):
                        if proc.status == "running" and proc.port:
                            break
                        await asyncio.sleep(0.5)
                except Exception as exc:
                    logger.warning("Auto-start of plugin %s failed: %s", plugin_id, exc)

        # Re-check after auto-start attempt
        proc = mgr.get(plugin_id)
        if proc is None or proc.status != "running" or not proc.port:
            raise HTTPException(
                status_code=503,
                detail=f"Plugin {plugin_id} is not running",
            )

    # Rebuild target URL including query string
    target_url = f"http://127.0.0.1:{proc.port}/{proxy_path}"
    if request.url.query:
        target_url += f"?{request.url.query}"

    # Read request body (empty for GET/HEAD)
    body = await request.body()

    # Check if client wants streaming
    is_stream = False
    if body:
        try:
            parsed = json.loads(body)
            is_stream = parsed.get("stream", False)
        except Exception:
            pass

    # Also treat SSE Accept header as streaming
    accept = request.headers.get("accept", "")
    if "text/event-stream" in accept:
        is_stream = True

    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "connection", "transfer-encoding")
    }

    if is_stream:
        # Stream the SSE response back
        async def _stream_proxy():
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    request.method,
                    target_url,
                    content=body if body else None,
                    headers=headers,
                ) as resp:
                    async for chunk in resp.aiter_bytes():
                        yield chunk

        return StreamingResponse(
            _stream_proxy(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    else:
        # Non-streaming: forward and return
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.request(
                method=request.method,
                url=target_url,
                content=body if body else None,
                headers=headers,
            )
            # Forward response headers — strip framing restrictions so
            # Gradio can be embedded in PocketPaw's iframe.  Gradio sends
            # X-Frame-Options: DENY and CSP frame-ancestors: 'none' by default.
            _skip_headers = {
                "transfer-encoding", "content-encoding", "content-length",
                "x-frame-options", "content-security-policy",
                "content-security-policy-report-only",
            }
            response_headers = {}
            for key, value in resp.headers.items():
                if key.lower() not in _skip_headers:
                    response_headers[key] = value
            return StreamingResponse(
                content=iter([resp.content]),
                status_code=resp.status_code,
                headers=response_headers,
                media_type=resp.headers.get("content-type", "application/octet-stream"),
            )

