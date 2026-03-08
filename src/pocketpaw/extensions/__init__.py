"""PocketPaw extension platform v1.

Supports two extension types:
  - **SPA** (default): Frontend-only web apps served inside an iframe.
  - **Plugin**: Full sandboxed applications with their own Python + CUDA
    environment managed via ``uv``.
"""

from .cuda import CudaInfo, detect_cuda, get_cuda_info
from .procs import PluginProcess, PluginProcessManager, get_plugin_process_manager
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
from .sandbox import (
    InstallConfig,
    InstallStep,
    SandboxConfig,
    SandboxManager,
    StartConfig,
    TorchConfig,
)
from .storage import ExtensionStorage
from .tokens import ExtensionTokenClaims, create_extension_token, verify_extension_token

__all__ = [
    "ALLOWED_EXTENSION_SCOPES",
    "CudaInfo",
    "ExtensionLoadError",
    "ExtensionManifest",
    "ExtensionRecord",
    "ExtensionRegistry",
    "ExtensionStorage",
    "ExtensionTokenClaims",
    "InstallConfig",
    "InstallStep",
    "PluginProcess",
    "PluginProcessManager",
    "SandboxConfig",
    "SandboxManager",
    "StartConfig",
    "TorchConfig",
    "create_extension_token",
    "detect_cuda",
    "get_builtin_extensions_dir",
    "get_cuda_info",
    "get_extension_registry",
    "get_external_extensions_dir",
    "get_plugin_process_manager",
    "verify_extension_token",
]
