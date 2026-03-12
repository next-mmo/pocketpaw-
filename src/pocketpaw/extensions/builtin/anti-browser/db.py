"""
SQLite database layer for Anti-Browser.
Stores profiles, actors, runs, team members, proxies, and groups.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import aiosqlite

logger = logging.getLogger("anti-browser.db")


class Database:
    def __init__(self, db_path: Path):
        self._path = str(db_path)
        self._db: aiosqlite.Connection | None = None

    async def init(self):
        self._db = await aiosqlite.connect(self._path)
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._create_tables()
        logger.info("Database initialized at %s", self._path)

    async def close(self):
        if self._db:
            await self._db.close()

    async def _create_tables(self):
        await self._db.executescript("""
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS actors (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY,
                actor_id TEXT NOT NULL,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS team_members (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS proxies (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS groups_ (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
        """)
        await self._db.commit()

    # ── Generic helpers ─────────────────────────────────────────────

    async def _get(self, table: str, id_: str) -> dict | None:
        cursor = await self._db.execute(f"SELECT data FROM {table} WHERE id = ?", (id_,))
        row = await cursor.fetchone()
        return json.loads(row[0]) if row else None

    async def _save(self, table: str, id_: str, data: dict):
        await self._db.execute(
            f"INSERT OR REPLACE INTO {table} (id, data) VALUES (?, ?)",
            (id_, json.dumps(data)),
        )
        await self._db.commit()

    async def _delete(self, table: str, id_: str):
        await self._db.execute(f"DELETE FROM {table} WHERE id = ?", (id_,))
        await self._db.commit()

    async def _list(self, table: str) -> list[dict]:
        cursor = await self._db.execute(f"SELECT data FROM {table}")
        rows = await cursor.fetchall()
        return [json.loads(r[0]) for r in rows]

    # ── Profiles ────────────────────────────────────────────────────

    async def list_profiles(self, group: str | None = None, tag: str | None = None) -> list[dict]:
        profiles = await self._list("profiles")
        if group:
            profiles = [p for p in profiles if p.get("group") == group]
        if tag:
            profiles = [p for p in profiles if tag in p.get("tags", [])]
        return profiles

    async def get_profile(self, profile_id: str) -> dict | None:
        return await self._get("profiles", profile_id)

    async def save_profile(self, profile: dict):
        await self._save("profiles", profile["id"], profile)

    async def delete_profile(self, profile_id: str):
        await self._delete("profiles", profile_id)

    # ── Actors ──────────────────────────────────────────────────────

    async def list_actors(self) -> list[dict]:
        return await self._list("actors")

    async def get_actor(self, actor_id: str) -> dict | None:
        return await self._get("actors", actor_id)

    async def save_actor(self, actor: dict):
        await self._save("actors", actor["id"], actor)

    async def delete_actor(self, actor_id: str):
        await self._delete("actors", actor_id)

    # ── Runs ────────────────────────────────────────────────────────

    async def list_runs(self, actor_id: str, limit: int = 20) -> list[dict]:
        cursor = await self._db.execute(
            "SELECT data FROM runs WHERE actor_id = ? ORDER BY rowid DESC LIMIT ?",
            (actor_id, limit),
        )
        rows = await cursor.fetchall()
        return [json.loads(r[0]) for r in rows]

    async def get_run(self, run_id: str) -> dict | None:
        return await self._get("runs", run_id)

    async def save_run(self, run: dict):
        await self._db.execute(
            "INSERT OR REPLACE INTO runs (id, actor_id, data) VALUES (?, ?, ?)",
            (run["id"], run["actor_id"], json.dumps(run)),
        )
        await self._db.commit()

    # ── Team ────────────────────────────────────────────────────────

    async def list_team_members(self) -> list[dict]:
        return await self._list("team_members")

    async def get_team_member(self, member_id: str) -> dict | None:
        return await self._get("team_members", member_id)

    async def save_team_member(self, member: dict):
        await self._save("team_members", member["id"], member)

    async def delete_team_member(self, member_id: str):
        await self._delete("team_members", member_id)

    # ── Proxies ─────────────────────────────────────────────────────

    async def list_proxies(self) -> list[dict]:
        return await self._list("proxies")

    async def get_proxy(self, proxy_id: str) -> dict | None:
        return await self._get("proxies", proxy_id)

    async def save_proxy(self, proxy: dict):
        await self._save("proxies", proxy["id"], proxy)

    async def delete_proxy(self, proxy_id: str):
        await self._delete("proxies", proxy_id)

    # ── Groups ──────────────────────────────────────────────────────

    async def list_groups(self) -> list[dict]:
        return await self._list("groups_")

    async def save_group(self, group: dict):
        await self._save("groups_", group["id"], group)

    async def delete_group(self, group_id: str):
        await self._delete("groups_", group_id)
