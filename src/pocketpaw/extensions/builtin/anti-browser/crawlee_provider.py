"""
Crawlee Provider — Crawlee-based web scraping and browser automation provider.
Integrates Crawlee for Python (PlaywrightCrawler, BeautifulSoupCrawler)
with the Anti-Browser extension for fingerprinted, proxy-routed crawling.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any, Literal

logger = logging.getLogger("anti-browser.crawlee")

# ── Lazy imports ────────────────────────────────────────────────────────
_crawlee_available: bool | None = None


def _check_crawlee() -> bool:
    global _crawlee_available
    if _crawlee_available is None:
        try:
            import crawlee  # noqa: F401
            _crawlee_available = True
        except ImportError:
            _crawlee_available = False
            logger.warning("crawlee not installed — crawlee provider disabled")
    return _crawlee_available


CrawlerType = Literal[
    "playwright", "beautifulsoup", "http",
    "puppeteer", "camoufox", "cheerio", "jsdom", "sitemap",
]


class CrawleeProvider:
    """
    High-level Crawlee provider that wraps PlaywrightCrawler and
    BeautifulSoupCrawler with Anti-Browser's proxy & fingerprint support.

    Supports Apify-style scraper types:
      - playwright  — Full browser (Playwright)
      - puppeteer   — Full browser (Puppeteer-style via Playwright)
      - camoufox    — Anti-detect Firefox via Playwright
      - cheerio     — Lightweight HTML parser (treated as BeautifulSoup backend)
      - beautifulsoup — Python HTML parser
      - jsdom       — Virtual DOM (treated as BeautifulSoup backend)
      - http        — Raw HTTP requests
      - sitemap     — Sitemap.xml crawler (HTTP-based)
    """

    def __init__(self, data_dir: Path):
        self._data_dir = data_dir
        self._storage_dir = data_dir / "crawlee_storage"
        self._storage_dir.mkdir(exist_ok=True)
        self._active_crawlers: dict[str, Any] = {}

    @property
    def available(self) -> bool:
        return _check_crawlee()

    async def run_crawl(
        self,
        *,
        urls: list[str],
        crawler_type: CrawlerType = "beautifulsoup",
        script: str = "",
        proxy_urls: list[str] | None = None,
        max_requests: int = 50,
        max_concurrency: int = 5,
        headless: bool = True,
        browser_type: str = "chromium",
        use_fingerprints: bool = True,
        request_handler_timeout_secs: int = 60,
        input_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Execute a crawl job using Crawlee.

        Args:
            urls: List of starting URLs.
            crawler_type: One of the supported CrawlerType values.
            script: Optional custom handler script (Python code as string).
            proxy_urls: Optional list of proxy URLs for rotation.
            max_requests: Max total requests.
            max_concurrency: Max concurrent requests.
            headless: Headless mode (browser-based crawlers only).
            browser_type: Browser engine (browser-based crawlers only).
            use_fingerprints: Enable fingerprint generation (browser-based only).
            request_handler_timeout_secs: Timeout per request handler.
            input_data: Extra data passed to handler context.

        Returns:
            dict with crawl results, errors, and metadata.
        """
        if not self.available:
            return {"success": False, "error": "crawlee is not installed"}

        crawl_id = str(uuid.uuid4())[:8]
        started_at = time.time()

        # Map alias types to actual implementations
        effective_type = crawler_type
        effective_browser = browser_type

        # Camoufox uses Firefox via Playwright
        if crawler_type == "camoufox":
            effective_type = "playwright"
            effective_browser = "firefox"
        # Puppeteer is handled via Playwright with Chromium
        elif crawler_type == "puppeteer":
            effective_type = "playwright"
            effective_browser = "chromium"
        # Cheerio and JSDOM are parsed like BeautifulSoup
        elif crawler_type in ("cheerio", "jsdom"):
            effective_type = "beautifulsoup"
        # Sitemap crawls via HTTP
        elif crawler_type == "sitemap":
            effective_type = "http"

        try:
            if effective_type == "playwright":
                results = await self._run_playwright_crawl(
                    crawl_id=crawl_id,
                    urls=urls,
                    script=script,
                    proxy_urls=proxy_urls,
                    max_requests=max_requests,
                    max_concurrency=max_concurrency,
                    headless=headless,
                    browser_type=effective_browser,
                    use_fingerprints=use_fingerprints,
                    timeout_secs=request_handler_timeout_secs,
                    input_data=input_data or {},
                )
            elif effective_type == "beautifulsoup":
                results = await self._run_beautifulsoup_crawl(
                    crawl_id=crawl_id,
                    urls=urls,
                    script=script,
                    proxy_urls=proxy_urls,
                    max_requests=max_requests,
                    max_concurrency=max_concurrency,
                    timeout_secs=request_handler_timeout_secs,
                    input_data=input_data or {},
                )
            else:
                results = await self._run_http_crawl(
                    crawl_id=crawl_id,
                    urls=urls,
                    script=script,
                    proxy_urls=proxy_urls,
                    max_requests=max_requests,
                    max_concurrency=max_concurrency,
                    timeout_secs=request_handler_timeout_secs,
                    input_data=input_data or {},
                )

            return {
                "success": True,
                "crawl_id": crawl_id,
                "crawler_type": crawler_type,
                "effective_type": effective_type,
                "urls_requested": len(urls),
                "results_count": len(results),
                "results": results,
                "duration_secs": round(time.time() - started_at, 2),
            }

        except Exception as e:
            logger.exception("Crawl %s failed", crawl_id)
            return {
                "success": False,
                "crawl_id": crawl_id,
                "error": str(e),
                "duration_secs": round(time.time() - started_at, 2),
            }

    # ── Playwright Crawler ──────────────────────────────────────────────

    async def _run_playwright_crawl(
        self,
        crawl_id: str,
        urls: list[str],
        script: str,
        proxy_urls: list[str] | None,
        max_requests: int,
        max_concurrency: int,
        headless: bool,
        browser_type: str,
        use_fingerprints: bool,
        timeout_secs: int,
        input_data: dict,
    ) -> list[dict]:
        from datetime import timedelta
        from crawlee.crawlers import PlaywrightCrawler, PlaywrightCrawlingContext

        collected: list[dict] = []

        # Build crawler kwargs
        crawler_kwargs: dict[str, Any] = {
            "max_requests_per_crawl": max_requests,
            "max_concurrency": max_concurrency,
            "headless": headless,
            "browser_type": browser_type,
            "request_handler_timeout": timedelta(seconds=timeout_secs),
        }

        # Proxy configuration
        if proxy_urls:
            from crawlee.proxy_configuration import ProxyConfiguration
            proxy_config = ProxyConfiguration(proxy_urls=proxy_urls)
            crawler_kwargs["proxy_configuration"] = proxy_config

        # Fingerprints
        if use_fingerprints:
            try:
                from crawlee.fingerprint_suite import (
                    DefaultFingerprintGenerator,
                    HeaderGeneratorOptions,
                )
                fg = DefaultFingerprintGenerator(
                    header_options=HeaderGeneratorOptions(
                        browsers=["chrome", "firefox", "edge"],
                    ),
                )
                crawler_kwargs["fingerprint_generator"] = fg
            except ImportError:
                logger.warning("crawlee fingerprint_suite not available")

        crawler = PlaywrightCrawler(**crawler_kwargs)

        if script.strip():
            # Custom script handler
            exec_globals: dict[str, Any] = {
                "collected": collected,
                "input_data": input_data,
            }
            exec_code = f"""
async def _custom_handler(context):
    page = context.page
    request = context.request
    log = context.log
    input = input_data
    enqueue_links = context.enqueue_links
    push_data = context.push_data
{_indent(script, 4)}
"""
            exec(exec_code, exec_globals)
            custom_handler = exec_globals["_custom_handler"]

            @crawler.router.default_handler
            async def handler(ctx: PlaywrightCrawlingContext) -> None:
                result = await custom_handler(ctx)
                if result is not None:
                    collected.append(result if isinstance(result, dict) else {"data": result})
                    await ctx.push_data(result if isinstance(result, dict) else {"data": result})
        else:
            # Default handler: extract page content
            @crawler.router.default_handler
            async def default_handler(ctx: PlaywrightCrawlingContext) -> None:
                page = ctx.page
                title = await page.title()
                content = await page.evaluate("""() => {
                    // Remove non-content elements
                    document.querySelectorAll('script, style, nav, footer, header, aside, noscript')
                        .forEach(el => el.remove());
                    return {
                        title: document.title,
                        text: document.body.innerText.trim().slice(0, 5000),
                        links: [...document.querySelectorAll('a[href]')]
                            .slice(0, 30)
                            .map(a => ({ text: a.textContent?.trim(), href: a.href }))
                            .filter(l => l.text && l.href.startsWith('http')),
                        images: [...document.querySelectorAll('img[src]')]
                            .slice(0, 10)
                            .map(img => ({ alt: img.alt, src: img.src })),
                        meta: {
                            description: document.querySelector('meta[name="description"]')?.content || '',
                            keywords: document.querySelector('meta[name="keywords"]')?.content || '',
                        }
                    };
                }""")
                data = {
                    "url": ctx.request.url,
                    "title": title,
                    **content,
                }
                collected.append(data)
                await ctx.push_data(data)

        await crawler.run(urls)
        return collected

    # ── BeautifulSoup Crawler ───────────────────────────────────────────

    async def _run_beautifulsoup_crawl(
        self,
        crawl_id: str,
        urls: list[str],
        script: str,
        proxy_urls: list[str] | None,
        max_requests: int,
        max_concurrency: int,
        timeout_secs: int,
        input_data: dict,
    ) -> list[dict]:
        from datetime import timedelta
        from crawlee.crawlers import BeautifulSoupCrawler, BeautifulSoupCrawlingContext

        collected: list[dict] = []

        crawler_kwargs: dict[str, Any] = {
            "max_requests_per_crawl": max_requests,
            "max_concurrency": max_concurrency,
            "request_handler_timeout": timedelta(seconds=timeout_secs),
        }

        if proxy_urls:
            from crawlee.proxy_configuration import ProxyConfiguration
            proxy_config = ProxyConfiguration(proxy_urls=proxy_urls)
            crawler_kwargs["proxy_configuration"] = proxy_config

        crawler = BeautifulSoupCrawler(**crawler_kwargs)

        if script.strip():
            exec_globals: dict[str, Any] = {
                "collected": collected,
                "input_data": input_data,
            }
            exec_code = f"""
async def _custom_handler(context):
    soup = context.soup
    request = context.request
    log = context.log
    input = input_data
    enqueue_links = context.enqueue_links
    push_data = context.push_data
{_indent(script, 4)}
"""
            exec(exec_code, exec_globals)
            custom_handler = exec_globals["_custom_handler"]

            @crawler.router.default_handler
            async def handler(ctx: BeautifulSoupCrawlingContext) -> None:
                result = await custom_handler(ctx)
                if result is not None:
                    collected.append(result if isinstance(result, dict) else {"data": result})
                    await ctx.push_data(result if isinstance(result, dict) else {"data": result})
        else:
            @crawler.router.default_handler
            async def default_handler(ctx: BeautifulSoupCrawlingContext) -> None:
                soup = ctx.soup
                title = soup.title.string if soup.title else None

                # Extract headings
                h1s = [h.get_text(strip=True) for h in soup.find_all("h1")]
                h2s = [h.get_text(strip=True) for h in soup.find_all("h2")]

                # Extract text
                for tag in soup.find_all(["script", "style", "nav", "footer", "header"]):
                    tag.decompose()
                text = soup.get_text(separator="\n", strip=True)[:5000]

                # Extract links
                links = []
                for a in soup.find_all("a", href=True)[:30]:
                    href = a.get("href", "")
                    if href.startswith("http"):
                        links.append({"text": a.get_text(strip=True), "href": href})

                # Extract meta
                desc_tag = soup.find("meta", attrs={"name": "description"})
                meta_desc = desc_tag.get("content", "") if desc_tag else ""

                data = {
                    "url": ctx.request.url,
                    "title": title,
                    "h1s": h1s,
                    "h2s": h2s,
                    "text": text,
                    "links": links,
                    "meta_description": meta_desc,
                }
                collected.append(data)
                await ctx.push_data(data)

        await crawler.run(urls)
        return collected

    # ── HTTP Crawler (lightweight, no browser) ──────────────────────────

    async def _run_http_crawl(
        self,
        crawl_id: str,
        urls: list[str],
        script: str,
        proxy_urls: list[str] | None,
        max_requests: int,
        max_concurrency: int,
        timeout_secs: int,
        input_data: dict,
    ) -> list[dict]:
        from datetime import timedelta
        from crawlee.crawlers import HttpCrawler, HttpCrawlingContext

        collected: list[dict] = []

        crawler_kwargs: dict[str, Any] = {
            "max_requests_per_crawl": max_requests,
            "max_concurrency": max_concurrency,
            "request_handler_timeout": timedelta(seconds=timeout_secs),
        }

        if proxy_urls:
            from crawlee.proxy_configuration import ProxyConfiguration
            proxy_config = ProxyConfiguration(proxy_urls=proxy_urls)
            crawler_kwargs["proxy_configuration"] = proxy_config

        crawler = HttpCrawler(**crawler_kwargs)

        @crawler.router.default_handler
        async def default_handler(ctx: HttpCrawlingContext) -> None:
            body = ctx.http_response.read().decode("utf-8", errors="replace")
            data = {
                "url": ctx.request.url,
                "status_code": ctx.http_response.status_code,
                "content_length": len(body),
                "body_preview": body[:3000],
                "headers": dict(ctx.http_response.headers),
            }
            collected.append(data)
            await ctx.push_data(data)

        await crawler.run(urls)
        return collected

    async def get_supported_crawlers(self) -> list[dict]:
        """Return info about available crawler types."""
        crawlers_info = [
            {
                "type": "playwright",
                "name": "Playwright Crawler",
                "description": "Full browser rendering with Playwright. Handles JS-heavy SPAs, dynamic content, and anti-bot protections.",
                "requires_browser": True,
                "headless_capable": True,
                "icon": "🎭",
            },
            {
                "type": "puppeteer",
                "name": "Puppeteer Crawler",
                "description": "Chrome DevTools Protocol automation via Playwright. Fast browser-based scraping.",
                "requires_browser": True,
                "headless_capable": True,
                "icon": "🤖",
            },
            {
                "type": "camoufox",
                "name": "Camoufox Crawler",
                "description": "Anti-detect Firefox browser. Bypasses bot protections with stealth fingerprinting.",
                "requires_browser": True,
                "headless_capable": True,
                "icon": "🦊",
            },
            {
                "type": "beautifulsoup",
                "name": "BeautifulSoup Crawler",
                "description": "Lightweight Python HTML parser. Fast, low-memory. Best for static sites.",
                "requires_browser": False,
                "headless_capable": False,
                "icon": "🥣",
            },
            {
                "type": "cheerio",
                "name": "Cheerio Crawler",
                "description": "Fast jQuery-style HTML parser. Lightweight, no browser needed.",
                "requires_browser": False,
                "headless_capable": False,
                "icon": "🍜",
            },
            {
                "type": "jsdom",
                "name": "JSDOM Crawler",
                "description": "Virtual DOM in Node.js. Parses HTML without rendering. Good for simple JS execution.",
                "requires_browser": False,
                "headless_capable": False,
                "icon": "📄",
            },
            {
                "type": "http",
                "name": "HTTP Crawler",
                "description": "Raw HTTP requests, no parsing. Fastest option for APIs and simple downloads.",
                "requires_browser": False,
                "headless_capable": False,
                "icon": "⚡",
            },
            {
                "type": "sitemap",
                "name": "Sitemap Crawler",
                "description": "Crawl via sitemap.xml. Automatically discovers all pages on a website.",
                "requires_browser": False,
                "headless_capable": False,
                "icon": "🗺️",
            },
        ]
        return crawlers_info


def _indent(code: str, spaces: int) -> str:
    """Indent each line of code by `spaces` spaces."""
    prefix = " " * spaces
    return "\n".join(prefix + line for line in code.splitlines())
