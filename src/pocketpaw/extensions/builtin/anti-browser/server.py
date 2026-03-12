"""
Anti-Browser — Enterprise anti-detect browser server.
FastAPI backend managing browser profiles, actors, team collaboration,
fingerprint spoofing, and proxy orchestration via Playwright.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import Database
from browser_manager import BrowserManager
from fingerprint_engine import FingerprintEngine
from crawlee_provider import CrawleeProvider
from apify_store import ApifyStoreClient, APIFY_CATEGORIES

logger = logging.getLogger("anti-browser")

# ── Data directory ──────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "anti_browser.db"


# ── Pydantic models ────────────────────────────────────────────────────

class ProxyConfig(BaseModel):
    type: str = "none"  # none | http | socks5
    host: str = ""
    port: int = 0
    username: str = ""
    password: str = ""


class ProfileCreate(BaseModel):
    name: str
    group: str = "default"
    proxy: ProxyConfig = Field(default_factory=ProxyConfig)
    os_type: str = "windows"  # windows | macos | linux
    browser_type: str = "chromium"
    notes: str = ""
    tags: list[str] = Field(default_factory=list)


class ProfileUpdate(BaseModel):
    name: str | None = None
    group: str | None = None
    proxy: ProxyConfig | None = None
    notes: str | None = None
    tags: list[str] | None = None


class ActorCreate(BaseModel):
    name: str
    script: str  # Python script content
    profile_ids: list[str] = Field(default_factory=list)
    schedule: str = ""  # cron expression or empty
    max_concurrency: int = 5
    description: str = ""
    input_schema: dict[str, Any] = Field(default_factory=dict)


class ActorRun(BaseModel):
    input_data: dict[str, Any] = Field(default_factory=dict)
    profile_ids: list[str] = Field(default_factory=list)


class CrawlRequest(BaseModel):
    urls: list[str]
    crawler_type: str = "beautifulsoup"
    script: str = ""
    proxy_urls: list[str] = Field(default_factory=list)
    max_requests: int = 50
    max_concurrency: int = 5
    headless: bool = True
    browser_type: str = "chromium"
    use_fingerprints: bool = True
    timeout_secs: int = 60
    input_data: dict[str, Any] = Field(default_factory=dict)


class TeamMemberCreate(BaseModel):
    name: str
    role: str = "operator"  # admin | manager | operator
    email: str = ""


class GroupCreate(BaseModel):
    name: str
    color: str = "#1677ff"
    description: str = ""


# ── Application ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown."""
    db = Database(DB_PATH)
    await db.init()
    app.state.db = db
    app.state.browser_mgr = BrowserManager(DATA_DIR)
    app.state.fp_engine = FingerprintEngine()
    app.state.crawlee = CrawleeProvider(DATA_DIR)
    app.state.apify_store = ApifyStoreClient()
    logger.info("Anti-Browser server ready (crawlee=%s)", app.state.crawlee.available)
    yield
    await app.state.browser_mgr.close_all()
    await db.close()


app = FastAPI(title="Anti-Browser", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ─────────────────────────────────────────────────────────────

def get_db() -> Database:
    return app.state.db

def get_bm() -> BrowserManager:
    return app.state.browser_mgr

def get_fp() -> FingerprintEngine:
    return app.state.fp_engine

def get_crawlee() -> CrawleeProvider:
    return app.state.crawlee

def get_apify_store() -> ApifyStoreClient:
    return app.state.apify_store


# ═══════════════════════════════════════════════════════════════════════
# PROFILES
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/profiles")
async def list_profiles(group: str | None = None, tag: str | None = None):
    """List all browser profiles, optionally filtered by group or tag."""
    db = get_db()
    profiles = await db.list_profiles(group=group, tag=tag)
    bm = get_bm()
    for p in profiles:
        p["status"] = bm.get_profile_status(p["id"])
    return {"profiles": profiles}


@app.post("/api/profiles")
async def create_profile(body: ProfileCreate):
    """Create a new browser profile with generated fingerprint."""
    db = get_db()
    fp = get_fp()

    profile_id = str(uuid.uuid4())[:8]
    fingerprint = fp.generate(os_type=body.os_type, browser_type=body.browser_type)

    profile = {
        "id": profile_id,
        "name": body.name,
        "group": body.group,
        "os_type": body.os_type,
        "browser_type": body.browser_type,
        "proxy": body.proxy.model_dump(),
        "fingerprint": fingerprint,
        "notes": body.notes,
        "tags": body.tags,
        "created_at": time.time(),
        "last_used": None,
    }
    await db.save_profile(profile)
    return {"profile": profile}


@app.get("/api/profiles/{profile_id}")
async def get_profile(profile_id: str):
    db = get_db()
    profile = await db.get_profile(profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    bm = get_bm()
    profile["status"] = bm.get_profile_status(profile_id)
    return {"profile": profile}


@app.patch("/api/profiles/{profile_id}")
async def update_profile(profile_id: str, body: ProfileUpdate):
    db = get_db()
    profile = await db.get_profile(profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")

    updates = body.model_dump(exclude_none=True)
    if "proxy" in updates:
        updates["proxy"] = updates["proxy"]
    profile.update(updates)
    await db.save_profile(profile)
    return {"profile": profile}


@app.delete("/api/profiles/{profile_id}")
async def delete_profile(profile_id: str):
    db = get_db()
    bm = get_bm()
    await bm.close_profile(profile_id)
    await db.delete_profile(profile_id)
    return {"ok": True}


@app.post("/api/profiles/{profile_id}/regenerate-fingerprint")
async def regenerate_fingerprint(profile_id: str):
    """Regenerate the fingerprint for a profile."""
    db = get_db()
    profile = await db.get_profile(profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")

    fp = get_fp()
    profile["fingerprint"] = fp.generate(
        os_type=profile.get("os_type", "windows"),
        browser_type=profile.get("browser_type", "chromium"),
    )
    await db.save_profile(profile)
    return {"fingerprint": profile["fingerprint"]}


# ── Profile launch / stop ──

@app.post("/api/profiles/{profile_id}/launch")
async def launch_profile(profile_id: str):
    """Launch a browser instance for this profile with spoofed fingerprint."""
    db = get_db()
    profile = await db.get_profile(profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")

    bm = get_bm()
    result = await bm.launch_profile(profile)

    profile["last_used"] = time.time()
    await db.save_profile(profile)

    return {"status": "launched", "cdp_url": result.get("cdp_url", "")}


@app.post("/api/profiles/{profile_id}/stop")
async def stop_profile(profile_id: str):
    bm = get_bm()
    await bm.close_profile(profile_id)
    return {"status": "stopped"}


@app.post("/api/profiles/{profile_id}/screenshot")
async def screenshot_profile(profile_id: str):
    """Take a screenshot of the running browser for a profile."""
    bm = get_bm()
    data = await bm.screenshot(profile_id)
    if not data:
        raise HTTPException(400, "Profile not running")
    return {"image": data}


# ═══════════════════════════════════════════════════════════════════════
# GROUPS
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/groups")
async def list_groups():
    db = get_db()
    groups = await db.list_groups()
    return {"groups": groups}


@app.post("/api/groups")
async def create_group(body: GroupCreate):
    db = get_db()
    group = {
        "id": str(uuid.uuid4())[:8],
        "name": body.name,
        "color": body.color,
        "description": body.description,
    }
    await db.save_group(group)
    return {"group": group}


@app.delete("/api/groups/{group_id}")
async def delete_group(group_id: str):
    db = get_db()
    await db.delete_group(group_id)
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════
# ACTORS (Apify-style)
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/actors")
async def list_actors():
    db = get_db()
    actors = await db.list_actors()
    return {"actors": actors}


@app.post("/api/actors")
async def create_actor(body: ActorCreate):
    db = get_db()
    actor = {
        "id": str(uuid.uuid4())[:8],
        "name": body.name,
        "script": body.script,
        "profile_ids": body.profile_ids,
        "schedule": body.schedule,
        "max_concurrency": body.max_concurrency,
        "description": body.description,
        "input_schema": body.input_schema,
        "created_at": time.time(),
        "total_runs": 0,
        "last_run": None,
    }
    await db.save_actor(actor)
    return {"actor": actor}


@app.get("/api/actors/{actor_id}")
async def get_actor(actor_id: str):
    db = get_db()
    actor = await db.get_actor(actor_id)
    if not actor:
        raise HTTPException(404, "Actor not found")
    return {"actor": actor}


@app.patch("/api/actors/{actor_id}")
async def update_actor(actor_id: str, body: dict):
    db = get_db()
    actor = await db.get_actor(actor_id)
    if not actor:
        raise HTTPException(404, "Actor not found")
    actor.update(body)
    await db.save_actor(actor)
    return {"actor": actor}


@app.delete("/api/actors/{actor_id}")
async def delete_actor(actor_id: str):
    db = get_db()
    await db.delete_actor(actor_id)
    return {"ok": True}


@app.post("/api/actors/{actor_id}/run")
async def run_actor(actor_id: str, body: ActorRun):
    """Execute an actor across specified browser profiles (concurrent)."""
    db = get_db()
    actor = await db.get_actor(actor_id)
    if not actor:
        raise HTTPException(404, "Actor not found")

    bm = get_bm()
    run_id = str(uuid.uuid4())[:8]
    profile_ids = body.profile_ids or actor.get("profile_ids", [])

    run_record = {
        "id": run_id,
        "actor_id": actor_id,
        "status": "running",
        "started_at": time.time(),
        "finished_at": None,
        "profile_ids": profile_ids,
        "input_data": body.input_data,
        "results": [],
        "errors": [],
    }
    await db.save_run(run_record)

    # Fire and forget — run in background
    asyncio.create_task(_execute_actor(db, bm, actor, run_record))

    actor["total_runs"] = actor.get("total_runs", 0) + 1
    actor["last_run"] = time.time()
    await db.save_actor(actor)

    return {"run": run_record}


async def _execute_actor(db: Database, bm: BrowserManager, actor: dict, run: dict):
    """Execute actor script across profiles with concurrency control."""
    sem = asyncio.Semaphore(actor.get("max_concurrency", 5))
    profile_ids = run["profile_ids"]

    async def _run_for_profile(pid: str):
        async with sem:
            try:
                profile = await db.get_profile(pid)
                if not profile:
                    run["errors"].append({"profile_id": pid, "error": "Not found"})
                    return

                result = await bm.run_script_in_profile(profile, actor["script"], run["input_data"])
                run["results"].append({"profile_id": pid, "result": result})
            except Exception as e:
                run["errors"].append({"profile_id": pid, "error": str(e)})

    tasks = [_run_for_profile(pid) for pid in profile_ids]
    await asyncio.gather(*tasks, return_exceptions=True)

    run["status"] = "completed" if not run["errors"] else "partial"
    run["finished_at"] = time.time()
    await db.save_run(run)


@app.get("/api/actors/{actor_id}/runs")
async def list_actor_runs(actor_id: str, limit: int = 20):
    db = get_db()
    runs = await db.list_runs(actor_id, limit)
    return {"runs": runs}


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str):
    db = get_db()
    run = await db.get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return {"run": run}


# ═══════════════════════════════════════════════════════════════════════
# TEAM MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/team")
async def list_team():
    db = get_db()
    members = await db.list_team_members()
    return {"members": members}


@app.post("/api/team")
async def add_team_member(body: TeamMemberCreate):
    db = get_db()
    member = {
        "id": str(uuid.uuid4())[:8],
        "name": body.name,
        "role": body.role,
        "email": body.email,
        "created_at": time.time(),
        "last_active": None,
        "profile_access": [],
    }
    await db.save_team_member(member)
    return {"member": member}


@app.patch("/api/team/{member_id}")
async def update_team_member(member_id: str, body: dict):
    db = get_db()
    member = await db.get_team_member(member_id)
    if not member:
        raise HTTPException(404, "Member not found")
    member.update(body)
    await db.save_team_member(member)
    return {"member": member}


@app.delete("/api/team/{member_id}")
async def remove_team_member(member_id: str):
    db = get_db()
    await db.delete_team_member(member_id)
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════
# PROXY MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/proxies")
async def list_proxies():
    db = get_db()
    proxies = await db.list_proxies()
    return {"proxies": proxies}


@app.post("/api/proxies")
async def add_proxy(body: ProxyConfig):
    db = get_db()
    proxy = {
        "id": str(uuid.uuid4())[:8],
        **body.model_dump(),
        "status": "unchecked",
        "latency_ms": None,
        "country": "",
        "created_at": time.time(),
    }
    await db.save_proxy(proxy)
    return {"proxy": proxy}


@app.post("/api/proxies/check")
async def check_proxies():
    """Health-check all saved proxies."""
    import httpx

    db = get_db()
    proxies = await db.list_proxies()
    results = []

    for px in proxies:
        try:
            proxy_url = _build_proxy_url(px)
            start = time.time()
            async with httpx.AsyncClient(proxy=proxy_url, timeout=10) as client:
                resp = await client.get("https://httpbin.org/ip")
                latency = int((time.time() - start) * 1000)
                px["status"] = "alive" if resp.status_code == 200 else "dead"
                px["latency_ms"] = latency
        except Exception:
            px["status"] = "dead"
            px["latency_ms"] = None

        await db.save_proxy(px)
        results.append(px)

    return {"proxies": results}


@app.delete("/api/proxies/{proxy_id}")
async def delete_proxy(proxy_id: str):
    db = get_db()
    await db.delete_proxy(proxy_id)
    return {"ok": True}


def _build_proxy_url(px: dict) -> str | None:
    ptype = px.get("type", "none")
    if ptype == "none":
        return None
    auth = ""
    if px.get("username"):
        auth = f"{px['username']}:{px.get('password', '')}@"
    scheme = "socks5" if ptype == "socks5" else "http"
    return f"{scheme}://{auth}{px['host']}:{px['port']}"


# ═══════════════════════════════════════════════════════════════════════
# DASHBOARD / STATS
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/stats")
async def get_stats():
    db = get_db()
    bm = get_bm()
    profiles = await db.list_profiles()
    actors = await db.list_actors()
    team = await db.list_team_members()
    proxies = await db.list_proxies()

    active_count = sum(1 for p in profiles if bm.get_profile_status(p["id"]) == "running")

    return {
        "total_profiles": len(profiles),
        "active_profiles": active_count,
        "total_actors": len(actors),
        "total_team_members": len(team),
        "total_proxies": len(proxies),
        "alive_proxies": sum(1 for px in proxies if px.get("status") == "alive"),
    }


# ═══════════════════════════════════════════════════════════════════════
# FINGERPRINT PREVIEW
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/fingerprint/preview")
async def fingerprint_preview(os_type: str = "windows", browser_type: str = "chromium"):
    fp = get_fp()
    fingerprint = fp.generate(os_type=os_type, browser_type=browser_type)
    return {"fingerprint": fingerprint}


# ═══════════════════════════════════════════════════════════════════════
# CRAWLEE PROVIDER
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/crawlee/status")
async def crawlee_status():
    """Check if Crawlee provider is available."""
    crawlee = get_crawlee()
    return {
        "available": crawlee.available,
        "crawlers": await crawlee.get_supported_crawlers(),
    }


@app.post("/api/crawlee/crawl")
async def crawlee_crawl(body: CrawlRequest):
    """Run a crawl job using Crawlee."""
    crawlee = get_crawlee()
    if not crawlee.available:
        raise HTTPException(503, "Crawlee is not installed. Install with: pip install 'crawlee[all]'")

    result = await crawlee.run_crawl(
        urls=body.urls,
        crawler_type=body.crawler_type,
        script=body.script,
        proxy_urls=body.proxy_urls if body.proxy_urls else None,
        max_requests=body.max_requests,
        max_concurrency=body.max_concurrency,
        headless=body.headless,
        browser_type=body.browser_type,
        use_fingerprints=body.use_fingerprints,
        request_handler_timeout_secs=body.timeout_secs,
        input_data=body.input_data,
    )
    return result


@app.get("/api/crawlee/crawlers")
async def crawlee_crawlers():
    """List available crawler types."""
    crawlee = get_crawlee()
    return {"crawlers": await crawlee.get_supported_crawlers()}


# ═══════════════════════════════════════════════════════════════════════
# APIFY STORE
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/store/actors")
async def store_list_actors(
    search: str = "",
    category: str = "",
    limit: int = Query(default=24, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_by: str = "popularity",
):
    """Browse actors from the Apify Store."""
    store = get_apify_store()
    return await store.search_store(
        search=search,
        category=category,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
    )


@app.get("/api/store/categories")
async def store_categories():
    """List Apify Store categories."""
    store = get_apify_store()
    return {"categories": await store.get_categories()}


@app.get("/api/store/actors/{actor_slug:path}")
async def store_get_actor(actor_slug: str):
    """Get details of an actor from the Apify Store."""
    store = get_apify_store()
    actor = await store.get_actor_detail(actor_slug)
    if not actor:
        raise HTTPException(404, "Actor not found in Apify Store")
    return {"actor": actor}


@app.post("/api/store/install/{actor_slug:path}")
async def store_install_actor(actor_slug: str):
    """
    Install an actor from the Apify Store into local actors.
    Creates a local actor entry with a Crawlee-based script template.
    """
    store = get_apify_store()
    detail = await store.get_actor_detail(actor_slug)
    if not detail:
        raise HTTPException(404, "Actor not found in Apify Store")

    db = get_db()

    script = _generate_crawlee_script(detail)

    actor = {
        "id": str(uuid.uuid4())[:8],
        "name": detail.get("name", actor_slug),
        "script": script,
        "profile_ids": [],
        "schedule": "",
        "max_concurrency": 5,
        "description": detail.get("description", ""),
        "input_schema": detail.get("example_run_input", {}),
        "created_at": time.time(),
        "total_runs": 0,
        "last_run": None,
        "source": "apify_store",
        "apify_slug": actor_slug,
        "apify_url": detail.get("apify_url", ""),
        "crawler_type": "beautifulsoup",
    }
    await db.save_actor(actor)
    return {"actor": actor}


def _generate_crawlee_script(actor_detail: dict) -> str:
    """Generate a Crawlee-based Python script template for an installed actor."""
    name = actor_detail.get("name", "Untitled")
    desc = actor_detail.get("description", "")[:200]
    slug = actor_detail.get("slug", "")

    return f'''# {name}
# Installed from Apify Store: {slug}
# {desc}
#
# This script uses Crawlee for Python.
# Modify the handler below to customize the crawling logic.
#
# Available in handler context:
#   context.request.url  — URL being processed
#   context.soup         — BeautifulSoup parsed HTML
#   context.log          — Logger
#   context.enqueue_links() — Enqueue more URLs
#   context.push_data()  — Push extracted data

context.log.info(f"Processing {{context.request.url}} ...")

data = {{
    "url": context.request.url,
    "title": context.soup.title.string if context.soup.title else None,
}}

for tag in context.soup.find_all(["script", "style", "nav", "footer"]):
    tag.decompose()

data["text"] = context.soup.get_text(separator="\\n", strip=True)[:5000]
data["links"] = [
    {{"text": a.get_text(strip=True), "href": a["href"]}}
    for a in context.soup.find_all("a", href=True)[:30]
    if a["href"].startswith("http")
]

await context.push_data(data)
return data
'''


# ── Main ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(name)s  %(message)s")
    uvicorn.run(app, host=args.host, port=args.port)
