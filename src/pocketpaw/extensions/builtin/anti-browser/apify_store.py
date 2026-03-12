"""
Apify Store Client — Fetches actors from the public Apify Store API.
Provides browsing, searching, and installing actors from https://apify.com/store.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx

logger = logging.getLogger("anti-browser.apify_store")

APIFY_STORE_API = "https://api.apify.com/v2/store"
APIFY_ACTOR_API = "https://api.apify.com/v2/acts"
APIFY_STORE_WEB = "https://apify.com"

# ── Category mapping for Apify Store ────────────────────────────────────
APIFY_CATEGORIES = [
    {"key": "all", "label": "All", "apify_tag": ""},
    {"key": "social-media", "label": "Social Media", "apify_tag": "SOCIAL_MEDIA"},
    {"key": "e-commerce", "label": "E-commerce", "apify_tag": "ECOMMERCE"},
    {"key": "seo", "label": "SEO Tools", "apify_tag": "SEO_TOOLS"},
    {"key": "lead-gen", "label": "Lead Generation", "apify_tag": "LEAD_GENERATION"},
    {"key": "ai-agents", "label": "AI & ML", "apify_tag": "AI"},
    {"key": "scraping", "label": "Web Scraping", "apify_tag": "SCRAPING"},
    {"key": "data", "label": "Data Extraction", "apify_tag": "DATA_EXTRACTION"},
    {"key": "automation", "label": "Automation", "apify_tag": "AUTOMATION"},
    {"key": "real-estate", "label": "Real Estate", "apify_tag": "REAL_ESTATE"},
    {"key": "travel", "label": "Travel", "apify_tag": "TRAVEL"},
    {"key": "jobs", "label": "Jobs", "apify_tag": "JOBS"},
    {"key": "news", "label": "News & Media", "apify_tag": "NEWS"},
    {"key": "finance", "label": "Finance", "apify_tag": "FINANCE"},
]


class ApifyStoreClient:
    """Client for browsing the Apify Store public API."""

    def __init__(self, api_token: str | None = None):
        self._token = api_token
        self._cache: dict[str, Any] = {}
        self._cache_ttl = 300  # 5 minutes
        self._cache_timestamps: dict[str, float] = {}

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {
            "Accept": "application/json",
            "User-Agent": "PocketPaw-AntiBrowser/1.0",
        }
        if self._token:
            h["Authorization"] = f"Bearer {self._token}"
        return h

    def _is_cache_valid(self, key: str) -> bool:
        ts = self._cache_timestamps.get(key, 0)
        return (time.time() - ts) < self._cache_ttl

    async def search_store(
        self,
        *,
        search: str = "",
        category: str = "",
        limit: int = 24,
        offset: int = 0,
        sort_by: str = "popularity",
    ) -> dict[str, Any]:
        """
        Search the Apify Store for actors.

        Args:
            search: Search query text.
            category: Category filter key (from APIFY_CATEGORIES).
            limit: Max results per page.
            offset: Pagination offset.
            sort_by: Sort by 'popularity', 'newest', 'alphabetical'.

        Returns:
            dict with actors list and pagination info.
        """
        cache_key = f"store:{search}:{category}:{limit}:{offset}:{sort_by}"
        if cache_key in self._cache and self._is_cache_valid(cache_key):
            return self._cache[cache_key]

        params: dict[str, Any] = {
            "limit": limit,
            "offset": offset,
        }

        if search:
            params["search"] = search

        if category and category != "all":
            cat_info = next(
                (c for c in APIFY_CATEGORIES if c["key"] == category),
                None,
            )
            if cat_info and cat_info["apify_tag"]:
                params["category"] = cat_info["apify_tag"]

        if sort_by == "newest":
            params["sortBy"] = "createdAt"
        elif sort_by == "alphabetical":
            params["sortBy"] = "name"
        else:
            params["sortBy"] = "popularity"

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    APIFY_STORE_API,
                    params=params,
                    headers=self._headers(),
                )
                resp.raise_for_status()
                data = resp.json()

            # Transform to our format
            items = data.get("data", {}).get("items", [])
            total = data.get("data", {}).get("total", len(items))

            actors = [self._transform_actor(item) for item in items]

            result = {
                "actors": actors,
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": offset + limit < total,
            }

            self._cache[cache_key] = result
            self._cache_timestamps[cache_key] = time.time()
            return result

        except httpx.HTTPStatusError as e:
            logger.warning("Apify Store API error: %s (status %s)", e, e.response.status_code)
            return {"actors": [], "total": 0, "limit": limit, "offset": offset, "has_more": False, "error": str(e)}
        except Exception as e:
            logger.warning("Apify Store request failed: %s", e)
            return {"actors": [], "total": 0, "limit": limit, "offset": offset, "has_more": False, "error": str(e)}

    @staticmethod
    def _to_api_id(actor_id: str) -> str:
        """Convert a slash-separated slug to the tilde format the Apify API expects.

        The Apify REST API requires ``username~actorname`` in the URL path,
        but our UI stores slugs as ``username/actorname``.  A bare ``/``
        would create an unwanted extra path segment and yield a 404.
        """
        return actor_id.replace("/", "~")

    async def get_actor_detail(self, actor_id: str) -> dict[str, Any] | None:
        """
        Get detailed information about a specific actor.

        Args:
            actor_id: Actor ID or slug (e.g., 'apify/web-scraper').
        """
        cache_key = f"detail:{actor_id}"
        if cache_key in self._cache and self._is_cache_valid(cache_key):
            return self._cache[cache_key]

        api_id = self._to_api_id(actor_id)

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{APIFY_ACTOR_API}/{api_id}",
                    headers=self._headers(),
                )
                resp.raise_for_status()
                data = resp.json()

            actor = self._transform_actor_detail(data.get("data", {}))

            self._cache[cache_key] = actor
            self._cache_timestamps[cache_key] = time.time()
            return actor

        except Exception as e:
            logger.warning("Failed to get actor detail for %s: %s", actor_id, e)
            return None

    async def get_actor_input_schema(self, actor_id: str) -> dict[str, Any]:
        """Get the input schema for an actor."""
        api_id = self._to_api_id(actor_id)
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{APIFY_ACTOR_API}/{api_id}/input-schema",
                    headers=self._headers(),
                )
                if resp.status_code == 200:
                    return resp.json().get("data", {})
                return {}
        except Exception as e:
            logger.warning("Failed to get input schema for %s: %s", actor_id, e)
            return {}

    async def get_categories(self) -> list[dict[str, str]]:
        """Return supported store categories."""
        return APIFY_CATEGORIES

    def _transform_actor(self, item: dict) -> dict:
        """Transform an Apify Store API item to our format."""
        stats = item.get("stats", {})
        user_info = item.get("userInfo", item.get("username", {}))
        username = ""
        if isinstance(user_info, dict):
            username = user_info.get("username", "")
        elif isinstance(user_info, str):
            username = user_info

        name = item.get("name", item.get("title", ""))
        slug = f"{username}/{name}" if username else name

        # Determine category from categories field
        categories = item.get("categories", [])
        category = self._map_category(categories)

        # Pick icon based on category
        icon = self._category_icon(category)
        color = self._category_color(category)

        total_runs = stats.get("totalRuns", 0)
        total_users = stats.get("totalUsers", 0)

        return {
            "id": item.get("id", ""),
            "name": item.get("title", name),
            "slug": slug,
            "author": username,
            "description": item.get("description", ""),
            "category": category,
            "icon": icon,
            "color": color,
            "runs": self._format_count(total_runs),
            "runs_raw": total_runs,
            "users": self._format_count(total_users),
            "users_raw": total_users,
            "rating": round(stats.get("rating", {}).get("value", 0), 1) if isinstance(stats.get("rating"), dict) else 0,
            "reviews": stats.get("rating", {}).get("count", 0) if isinstance(stats.get("rating"), dict) else 0,
            "tags": item.get("taggedCategories", item.get("categories", [])),
            "featured": stats.get("totalRuns", 0) > 100000,
            "source": "apify",
            "apify_url": f"{APIFY_STORE_WEB}/{slug}",
            "is_paid": item.get("pricingModel", "FREE") != "FREE",
            "pricing_model": item.get("pricingModel", "FREE"),
            "last_modified": item.get("modifiedAt", ""),
            "version": item.get("version", {}).get("versionNumber", "")
            if isinstance(item.get("version"), dict) else "",
        }

    def _transform_actor_detail(self, item: dict) -> dict:
        """Transform detailed actor data."""
        base = self._transform_actor(item)

        # Add extra detail fields
        versions = item.get("versions", [])
        base.update({
            "readme": item.get("readme", item.get("description", "")),
            "default_run_options": item.get("defaultRunOptions", {}),
            "example_run_input": item.get("exampleRunInput", {}),
            "versions": [
                {
                    "version": v.get("versionNumber", ""),
                    "build_tag": v.get("buildTag", ""),
                    "source_type": v.get("sourceType", ""),
                }
                for v in versions[:5]
            ],
            "is_public": item.get("isPublic", True),
            "is_deprecated": item.get("isDeprecated", False),
            "created_at": item.get("createdAt", ""),
            "modified_at": item.get("modifiedAt", ""),
        })
        return base

    @staticmethod
    def _map_category(categories: list[str]) -> str:
        """Map Apify categories to our category keys."""
        categories_lower = [c.lower() for c in categories]
        if any("social" in c for c in categories_lower):
            return "social-media"
        if any("commerce" in c or "shop" in c for c in categories_lower):
            return "e-commerce"
        if any("seo" in c for c in categories_lower):
            return "seo"
        if any("lead" in c or "email" in c for c in categories_lower):
            return "lead-gen"
        if any("ai" in c or "ml" in c or "machine" in c for c in categories_lower):
            return "ai-agents"
        if any("scraping" in c or "crawling" in c for c in categories_lower):
            return "scraping"
        if any("real" in c and "estate" in c for c in categories_lower):
            return "real-estate"
        if any("travel" in c for c in categories_lower):
            return "travel"
        if any("job" in c for c in categories_lower):
            return "jobs"
        if any("news" in c for c in categories_lower):
            return "news"
        if any("data" in c for c in categories_lower):
            return "data"
        return "scraping"

    @staticmethod
    def _category_icon(category: str) -> str:
        icons = {
            "social-media": "📱",
            "e-commerce": "🛒",
            "seo": "📊",
            "lead-gen": "📧",
            "ai-agents": "🤖",
            "scraping": "🕷️",
            "data": "📦",
            "automation": "⚙️",
            "real-estate": "🏠",
            "travel": "✈️",
            "jobs": "💼",
            "news": "📰",
            "finance": "💰",
        }
        return icons.get(category, "🔧")

    @staticmethod
    def _category_color(category: str) -> str:
        colors = {
            "social-media": "#e1306c",
            "e-commerce": "#ff9900",
            "seo": "#34d399",
            "lead-gen": "#f97316",
            "ai-agents": "#764ba2",
            "scraping": "#667eea",
            "data": "#06b6d4",
            "automation": "#8b5cf6",
            "real-estate": "#10b981",
            "travel": "#3b82f6",
            "jobs": "#0a66c2",
            "news": "#ef4444",
            "finance": "#eab308",
        }
        return colors.get(category, "#667eea")

    @staticmethod
    def _format_count(n: int) -> str:
        if n >= 1_000_000:
            return f"{n / 1_000_000:.1f}M"
        if n >= 1_000:
            return f"{n / 1_000:.0f}K"
        return str(n)
