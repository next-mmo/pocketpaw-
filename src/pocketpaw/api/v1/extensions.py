from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
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
)
from pocketpaw.extensions.registry import ExtensionRecord
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


@router.post("/extensions/{extension_id}/enabled", response_model=ExtensionSummary)
async def update_extension_enabled(
    extension_id: str,
    body: ExtensionToggleRequest,
    request: Request,
):
    _require_admin_or_full_access(request)

    registry = get_extension_registry(force_reload=True)
    if registry.get(extension_id) is None:
        raise HTTPException(status_code=404, detail="Extension not found")

    settings = Settings.load()
    disabled = set(settings.extension_disabled_ids)
    if body.enabled:
        disabled.discard(extension_id)
    else:
        disabled.add(extension_id)
    settings.extension_disabled_ids = sorted(disabled)
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
