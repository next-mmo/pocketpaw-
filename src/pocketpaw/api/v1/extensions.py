from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from pocketpaw.api.v1.chat import _APISessionBridge, _send_message
from pocketpaw.api.v1.schemas.chat import ChatRequest, ChatResponse
from pocketpaw.api.v1.schemas.extensions import (
    ExtensionListResponse,
    ExtensionSessionResponse,
    ExtensionStatusResponse,
    ExtensionStorageDeleteResponse,
    ExtensionStorageItem,
    ExtensionStorageListResponse,
    ExtensionStorageValueRequest,
    ExtensionSummary,
    ExtensionToggleRequest,
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
async def upload_extension(request: Request, file: UploadFile):
    """Upload a local extension as a ZIP file.

    The ZIP must contain an extension.json manifest at the root level
    (or inside a single wrapper directory). The extension is installed
    into ``~/.pocketpaw/extensions/<id>/``.
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

    # Prevent overwriting built-in extensions
    registry = get_extension_registry(force_reload=True)
    existing = registry.get(manifest.id)
    if existing and existing.source == "builtin":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot overwrite built-in extension '{manifest.id}'",
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
