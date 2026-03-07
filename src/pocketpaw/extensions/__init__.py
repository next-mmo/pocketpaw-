"""PocketPaw extension platform v1."""

from .registry import (
    ALLOWED_EXTENSION_SCOPES,
    ExtensionLoadError,
    ExtensionManifest,
    ExtensionRecord,
    ExtensionRegistry,
    get_builtin_extensions_dir,
    get_extension_registry,
    get_external_extensions_dir,
)
from .storage import ExtensionStorage
from .tokens import ExtensionTokenClaims, create_extension_token, verify_extension_token

__all__ = [
    "ALLOWED_EXTENSION_SCOPES",
    "ExtensionLoadError",
    "ExtensionManifest",
    "ExtensionRecord",
    "ExtensionRegistry",
    "ExtensionStorage",
    "ExtensionTokenClaims",
    "create_extension_token",
    "get_builtin_extensions_dir",
    "get_extension_registry",
    "get_external_extensions_dir",
    "verify_extension_token",
]
