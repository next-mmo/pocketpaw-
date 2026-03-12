"""
Fingerprint generation engine for Anti-Browser.
Uses BrowserForge to generate realistic browser fingerprints.
Falls back to custom generation if BrowserForge is unavailable.
"""
from __future__ import annotations

import hashlib
import random
import time
import logging

logger = logging.getLogger("anti-browser.fingerprint")

# Try importing browserforge — graceful fallback
try:
    from browserforge.fingerprints import FingerprintGenerator
    HAS_BROWSERFORGE = True
except ImportError:
    HAS_BROWSERFORGE = False
    logger.warning("browserforge not installed — using built-in fingerprint generator")


# ── Realistic data pools ────────────────────────────────────────────────

_WEBGL_VENDORS = [
    "Google Inc. (NVIDIA)",
    "Google Inc. (AMD)",
    "Google Inc. (Intel)",
    "Google Inc. (Apple)",
]

_WEBGL_RENDERERS = {
    "NVIDIA": [
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)",
    ],
    "AMD": [
        "ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (AMD, AMD Radeon RX 6900 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
    ],
    "Intel": [
        "ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
    ],
    "Apple": [
        "Apple GPU",
        "Apple M1",
        "Apple M2",
        "Apple M3",
    ],
}

_SCREEN_RESOLUTIONS = [
    (1920, 1080), (2560, 1440), (1366, 768), (1536, 864),
    (1440, 900), (1680, 1050), (2560, 1600), (3840, 2160),
    (1280, 720), (1600, 900),
]

_MACOS_RESOLUTIONS = [
    (2560, 1600), (2880, 1800), (3024, 1964), (3456, 2234),
    (1440, 900), (1680, 1050),
]

_TIMEZONES = {
    "windows": ["America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Asia/Shanghai"],
    "macos": ["America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Tokyo"],
    "linux": ["America/New_York", "UTC", "Europe/Berlin", "Asia/Shanghai"],
}

_LANGUAGES = [
    "en-US,en;q=0.9",
    "en-US,en;q=0.9,es;q=0.8",
    "en-GB,en;q=0.9",
    "en-US,en;q=0.9,fr;q=0.8",
    "en-US,en;q=0.9,de;q=0.8",
    "en-US,en;q=0.9,ja;q=0.8",
]

_USER_AGENTS_WIN = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
]

_USER_AGENTS_MAC = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
]

_USER_AGENTS_LINUX = [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
]

_FONTS_WIN = [
    "Arial", "Calibri", "Cambria", "Consolas", "Courier New", "Georgia",
    "Lucida Console", "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana",
]

_FONTS_MAC = [
    "Arial", "Avenir", "Courier New", "Georgia", "Helvetica", "Helvetica Neue",
    "Lucida Grande", "Menlo", "Monaco", "San Francisco", "Times New Roman",
]


class FingerprintEngine:
    """Generate realistic browser fingerprints."""

    def __init__(self):
        self._bf_gen = None
        if HAS_BROWSERFORGE:
            try:
                self._bf_gen = FingerprintGenerator()
            except Exception as e:
                logger.warning("BrowserForge init failed: %s — using builtin", e)

    def generate(self, os_type: str = "windows", browser_type: str = "chromium") -> dict:
        """Generate a fingerprint for the given OS and browser type."""
        if self._bf_gen:
            return self._generate_browserforge(os_type, browser_type)
        return self._generate_builtin(os_type, browser_type)

    def _generate_browserforge(self, os_type: str, browser_type: str) -> dict:
        """Use BrowserForge for high-quality fingerprint generation."""
        try:
            fp = self._bf_gen.generate(
                browser=("chrome",),
                os=(os_type if os_type != "macos" else "macos",),
            )
            # Extract key fields into our standard format
            return {
                "user_agent": getattr(fp, "navigator", {}).get("userAgent", "") if isinstance(getattr(fp, "navigator", None), dict) else str(getattr(fp, "user_agent", "")),
                "screen": {
                    "width": getattr(fp, "screen", {}).get("width", 1920) if isinstance(getattr(fp, "screen", None), dict) else 1920,
                    "height": getattr(fp, "screen", {}).get("height", 1080) if isinstance(getattr(fp, "screen", None), dict) else 1080,
                    "color_depth": 24,
                    "pixel_ratio": random.choice([1, 1.25, 1.5, 2]),
                },
                "webgl": self._random_webgl(os_type),
                "timezone": random.choice(_TIMEZONES.get(os_type, _TIMEZONES["windows"])),
                "language": random.choice(_LANGUAGES),
                "platform": {"windows": "Win32", "macos": "MacIntel", "linux": "Linux x86_64"}.get(os_type, "Win32"),
                "hardware_concurrency": random.choice([4, 8, 12, 16]),
                "device_memory": random.choice([4, 8, 16, 32]),
                "fonts": self._random_fonts(os_type),
                "canvas_noise": self._canvas_noise_seed(),
                "audio_noise": round(random.uniform(0.00001, 0.0001), 8),
                "do_not_track": random.choice([None, "1"]),
                "source": "browserforge",
            }
        except Exception as e:
            logger.warning("BrowserForge generation failed: %s — falling back", e)
            return self._generate_builtin(os_type, browser_type)

    def _generate_builtin(self, os_type: str, browser_type: str) -> dict:
        """Built-in fingerprint generation (no external dependencies)."""
        ua_pool = {
            "windows": _USER_AGENTS_WIN,
            "macos": _USER_AGENTS_MAC,
            "linux": _USER_AGENTS_LINUX,
        }
        res_pool = _MACOS_RESOLUTIONS if os_type == "macos" else _SCREEN_RESOLUTIONS
        resolution = random.choice(res_pool)

        return {
            "user_agent": random.choice(ua_pool.get(os_type, _USER_AGENTS_WIN)),
            "screen": {
                "width": resolution[0],
                "height": resolution[1],
                "color_depth": 24,
                "pixel_ratio": random.choice([1, 1.25, 1.5, 2]) if os_type == "windows" else 2,
            },
            "webgl": self._random_webgl(os_type),
            "timezone": random.choice(_TIMEZONES.get(os_type, _TIMEZONES["windows"])),
            "language": random.choice(_LANGUAGES),
            "platform": {"windows": "Win32", "macos": "MacIntel", "linux": "Linux x86_64"}.get(os_type, "Win32"),
            "hardware_concurrency": random.choice([4, 8, 12, 16]),
            "device_memory": random.choice([4, 8, 16, 32]),
            "fonts": self._random_fonts(os_type),
            "canvas_noise": self._canvas_noise_seed(),
            "audio_noise": round(random.uniform(0.00001, 0.0001), 8),
            "do_not_track": random.choice([None, "1"]),
            "source": "builtin",
        }

    def _random_webgl(self, os_type: str) -> dict:
        if os_type == "macos":
            vendor = "Google Inc. (Apple)"
            renderer = random.choice(_WEBGL_RENDERERS["Apple"])
        else:
            gpu_brand = random.choices(["NVIDIA", "AMD", "Intel"], weights=[50, 30, 20])[0]
            vendor = f"Google Inc. ({gpu_brand})"
            renderer = random.choice(_WEBGL_RENDERERS[gpu_brand])
        return {"vendor": vendor, "renderer": renderer}

    def _random_fonts(self, os_type: str) -> list[str]:
        pool = _FONTS_MAC if os_type == "macos" else _FONTS_WIN
        count = random.randint(6, len(pool))
        return sorted(random.sample(pool, count))

    def _canvas_noise_seed(self) -> str:
        return hashlib.md5(f"{time.time()}{random.random()}".encode()).hexdigest()[:16]
