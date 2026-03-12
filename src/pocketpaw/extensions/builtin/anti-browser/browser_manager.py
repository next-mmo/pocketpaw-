"""
Browser Manager — Playwright-based multi-profile browser orchestration.
Handles launching, stopping, and running scripts in isolated browser contexts
with fingerprint spoofing applied via Playwright's CDP and context options.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import textwrap
from pathlib import Path
from typing import Any

logger = logging.getLogger("anti-browser.browser_mgr")

try:
    from playwright.async_api import async_playwright, Browser, BrowserContext, Page
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False
    logger.warning("playwright not installed — browser features disabled")


class BrowserManager:
    """Manages multiple simultaneous browser profiles via Playwright."""

    def __init__(self, data_dir: Path):
        self._data_dir = data_dir
        self._profiles_dir = data_dir / "profiles_data"
        self._profiles_dir.mkdir(exist_ok=True)
        self._playwright = None
        self._browser: Browser | None = None
        self._contexts: dict[str, BrowserContext] = {}
        self._pages: dict[str, Page] = {}
        self._lock = asyncio.Lock()

    async def _ensure_browser(self, headless: bool = True):
        """Lazily start a shared Playwright Chromium instance."""
        if self._browser and self._browser.is_connected():
            return
        if not HAS_PLAYWRIGHT:
            raise RuntimeError("Playwright is not installed")
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-features=IsolateOrigins,site-per-process",
                "--no-first-run",
                "--no-default-browser-check",
            ],
        )
        logger.info("Chromium browser launched (headless=%s)", headless)

    def _profile_storage_dir(self, profile_id: str) -> Path:
        d = self._profiles_dir / profile_id
        d.mkdir(exist_ok=True)
        return d

    def get_profile_status(self, profile_id: str) -> str:
        if profile_id in self._contexts:
            return "running"
        return "stopped"

    async def launch_profile(self, profile: dict) -> dict:
        """Launch a browser context for the given profile with fingerprint spoofing."""
        profile_id = profile["id"]
        if profile_id in self._contexts:
            return {"cdp_url": "", "message": "Already running"}

        await self._ensure_browser(headless=profile.get("headless", True))

        fp = profile.get("fingerprint", {})
        proxy_cfg = profile.get("proxy", {})

        # Build context options
        context_opts: dict[str, Any] = {
            "storage_state": None,
            "user_agent": fp.get("user_agent", ""),
            "viewport": {
                "width": fp.get("screen", {}).get("width", 1920),
                "height": fp.get("screen", {}).get("height", 1080),
            },
            "locale": fp.get("language", "en-US").split(",")[0],
            "timezone_id": fp.get("timezone", "America/New_York"),
            "device_scale_factor": fp.get("screen", {}).get("pixel_ratio", 1),
            "color_scheme": "light",
            "ignore_https_errors": True,
        }

        # Proxy
        if proxy_cfg.get("type") and proxy_cfg["type"] != "none":
            context_opts["proxy"] = {
                "server": f"{proxy_cfg['type']}://{proxy_cfg['host']}:{proxy_cfg['port']}",
            }
            if proxy_cfg.get("username"):
                context_opts["proxy"]["username"] = proxy_cfg["username"]
                context_opts["proxy"]["password"] = proxy_cfg.get("password", "")

        # Restore saved state if available
        state_file = self._profile_storage_dir(profile_id) / "state.json"
        if state_file.exists():
            context_opts["storage_state"] = str(state_file)

        context = await self._browser.new_context(**context_opts)

        # Apply fingerprint spoofing via init script
        stealth_js = self._build_stealth_script(fp)
        await context.add_init_script(stealth_js)

        # Open a default page
        page = await context.new_page()
        await page.goto("about:blank")

        self._contexts[profile_id] = context
        self._pages[profile_id] = page

        logger.info("Profile %s launched", profile_id)
        return {"cdp_url": "", "message": "Launched"}

    async def close_profile(self, profile_id: str):
        """Close a profile's browser context and save state."""
        context = self._contexts.pop(profile_id, None)
        self._pages.pop(profile_id, None)
        if context:
            try:
                state_file = self._profile_storage_dir(profile_id) / "state.json"
                storage = await context.storage_state()
                with open(state_file, "w") as f:
                    json.dump(storage, f)
            except Exception as e:
                logger.warning("Failed to save state for %s: %s", profile_id, e)
            await context.close()
            logger.info("Profile %s closed", profile_id)

    async def close_all(self):
        """Shut down all contexts and the browser."""
        ids = list(self._contexts.keys())
        for pid in ids:
            await self.close_profile(pid)
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()
        logger.info("All browsers closed")

    async def screenshot(self, profile_id: str) -> str | None:
        """Take a screenshot of a running profile and return base64 PNG."""
        page = self._pages.get(profile_id)
        if not page:
            return None
        try:
            buf = await page.screenshot(type="png")
            return base64.b64encode(buf).decode()
        except Exception as e:
            logger.warning("Screenshot failed for %s: %s", profile_id, e)
            return None

    async def run_script_in_profile(
        self,
        profile: dict,
        script: str,
        input_data: dict,
    ) -> dict:
        """
        Launch a profile, execute a Python-defined script as
        page JavaScript, and return results.
        """
        profile_id = profile["id"]
        was_running = profile_id in self._contexts

        if not was_running:
            await self.launch_profile(profile)

        page = self._pages.get(profile_id)
        if not page:
            return {"error": "Could not get page"}

        try:
            # Navigate to target URL if specified in input
            url = input_data.get("url", "")
            if url:
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)

            # Execute the actor script (treated as JavaScript to run in page)
            eval_script = input_data.get("evaluate", script)
            result = await page.evaluate(eval_script)

            return {"success": True, "data": result}
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            if not was_running:
                await self.close_profile(profile_id)

    def _build_stealth_script(self, fp: dict) -> str:
        """Build JavaScript stealth injection script for fingerprint spoofing."""
        webgl = fp.get("webgl", {})
        screen = fp.get("screen", {})

        return textwrap.dedent(f"""\
            // ── Anti-detection: Remove webdriver flag ──
            Object.defineProperty(navigator, 'webdriver', {{
                get: () => undefined,
            }});

            // ── Override navigator.platform ──
            Object.defineProperty(navigator, 'platform', {{
                get: () => '{fp.get("platform", "Win32")}',
            }});

            // ── Override hardware concurrency ──
            Object.defineProperty(navigator, 'hardwareConcurrency', {{
                get: () => {fp.get("hardware_concurrency", 8)},
            }});

            // ── Override device memory ──
            Object.defineProperty(navigator, 'deviceMemory', {{
                get: () => {fp.get("device_memory", 8)},
            }});

            // ── Override languages ──
            Object.defineProperty(navigator, 'languages', {{
                get: () => {json.dumps(fp.get("language", "en-US").split(","))},
            }});

            // ── WebGL vendor/renderer spoofing ──
            const getParameterOrig = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(param) {{
                if (param === 0x9245) return '{webgl.get("vendor", "Google Inc. (NVIDIA)")}';
                if (param === 0x9246) return '{webgl.get("renderer", "ANGLE (NVIDIA)")}';
                return getParameterOrig.call(this, param);
            }};

            // Also patch WebGL2
            if (typeof WebGL2RenderingContext !== 'undefined') {{
                const getParam2Orig = WebGL2RenderingContext.prototype.getParameter;
                WebGL2RenderingContext.prototype.getParameter = function(param) {{
                    if (param === 0x9245) return '{webgl.get("vendor", "Google Inc. (NVIDIA)")}';
                    if (param === 0x9246) return '{webgl.get("renderer", "ANGLE (NVIDIA)")}';
                    return getParam2Orig.call(this, param);
                }};
            }}

            // ── Canvas noise injection ──
            const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function(type) {{
                const ctx = this.getContext('2d');
                if (ctx) {{
                    const imgData = ctx.getImageData(0, 0, this.width, this.height);
                    const seed = '{fp.get("canvas_noise", "0")}';
                    for (let i = 0; i < imgData.data.length; i += 4) {{
                        imgData.data[i] = imgData.data[i] ^ ((seed.charCodeAt(i % seed.length) % 2));
                    }}
                    ctx.putImageData(imgData, 0, 0);
                }}
                return origToDataURL.apply(this, arguments);
            }};

            // ── AudioContext fingerprint noise ──
            const origGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
            AnalyserNode.prototype.getFloatFrequencyData = function(array) {{
                origGetFloatFrequencyData.call(this, array);
                const noise = {fp.get("audio_noise", 0.00005)};
                for (let i = 0; i < array.length; i++) {{
                    array[i] += (Math.random() - 0.5) * noise;
                }}
            }};

            // ── Plugins — mimic Chrome plugins ──
            Object.defineProperty(navigator, 'plugins', {{
                get: () => {{
                    const arr = [
                        {{ name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }},
                        {{ name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' }},
                        {{ name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }},
                    ];
                    arr.length = 3;
                    return arr;
                }},
            }});

            // ── Don't Track ──
            Object.defineProperty(navigator, 'doNotTrack', {{
                get: () => {json.dumps(fp.get("do_not_track"))},
            }});

            // ── Chrome runtime mock ──
            if (!window.chrome) {{
                window.chrome = {{
                    runtime: {{
                        connect: () => {{}},
                        sendMessage: () => {{}},
                    }},
                }};
            }}

            // ── Permissions query override ──
            const origQuery = window.Permissions.prototype.query;
            window.Permissions.prototype.query = function(parameters) {{
                if (parameters.name === 'notifications') {{
                    return Promise.resolve({{ state: Notification.permission }});
                }}
                return origQuery.call(this, parameters);
            }};
        """)
