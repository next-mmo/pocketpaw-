from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from pydantic import BaseModel, Field

TOKEN_PREFIX = "pex_"


class ExtensionTokenClaims(BaseModel):
    extension_id: str
    scopes: list[str] = Field(default_factory=list)
    expires_at: int


def create_extension_token(
    master_token: str,
    extension_id: str,
    scopes: list[str],
    ttl_seconds: int = 900,
) -> str:
    payload = {
        "ext": extension_id,
        "scopes": scopes,
        "exp": int(time.time()) + ttl_seconds,
    }
    encoded = _b64_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = _sign(master_token, encoded)
    return f"{TOKEN_PREFIX}{encoded}.{sig}"


def verify_extension_token(token: str, master_token: str) -> ExtensionTokenClaims | None:
    if not token.startswith(TOKEN_PREFIX):
        return None

    raw = token.removeprefix(TOKEN_PREFIX)
    parts = raw.split(".", 1)
    if len(parts) != 2:
        return None
    encoded, sig = parts
    expected = _sign(master_token, encoded)
    if not hmac.compare_digest(sig, expected):
        return None

    try:
        payload: dict[str, Any] = json.loads(_b64_decode(encoded))
    except (ValueError, json.JSONDecodeError):
        return None

    exp = int(payload.get("exp", 0))
    if exp <= int(time.time()):
        return None

    return ExtensionTokenClaims(
        extension_id=str(payload.get("ext", "")),
        scopes=[str(item) for item in payload.get("scopes", [])],
        expires_at=exp,
    )


def _sign(master_token: str, encoded_payload: str) -> str:
    return hmac.new(
        master_token.encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)
