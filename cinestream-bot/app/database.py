"""Supabase data layer — port of src/lib/telegram/db.ts.

Provides a singleton client, settings helpers, admin checks and FSM
(admin_sessions) helpers, mirroring the TypeScript implementation.
"""
from __future__ import annotations

from typing import Any

from supabase import create_client

from .config import config

_client = None


def db():
    global _client
    if _client is None:
        if not config.supabase_url or not config.supabase_key:
            raise RuntimeError("Supabase URL/service key not configured")
        _client = create_client(config.supabase_url, config.supabase_key)
    return _client


# ---------- settings ----------
def get_setting(key: str, fallback: Any = None) -> Any:
    res = db().table("settings").select("value").eq("key", key).maybeSingle().execute()
    if res.data:
        return res.data.get("value", fallback)
    return fallback


def set_setting(key: str, value: Any) -> None:
    db().table("settings").upsert({"key": key, "value": value}, on_conflict="key").execute()


# ---------- admins ----------
def get_admin_ids() -> list[int]:
    ids = get_setting("admin_telegram_ids", [])
    arr = [int(i) for i in ids] if isinstance(ids, list) else []
    if config.owner_id not in arr:
        arr.append(config.owner_id)
    return arr


def is_admin(telegram_id: int) -> bool:
    tid = int(telegram_id)
    if tid == config.owner_id:
        return True
    return tid in get_admin_ids()


# ---------- FSM (admin_sessions) ----------
def get_session(telegram_id: int) -> dict | None:
    res = (
        db()
        .table("admin_sessions")
        .select("*")
        .eq("telegram_id", telegram_id)
        .maybeSingle()
        .execute()
    )
    return res.data


def set_session(telegram_id: int, state: str, payload: dict | None = None) -> None:
    db().table("admin_sessions").upsert(
        {"telegram_id": telegram_id, "state": state, "payload": payload or {}},
        on_conflict="telegram_id",
    ).execute()


def clear_session(telegram_id: int) -> None:
    db().table("admin_sessions").delete().eq("telegram_id", telegram_id).execute()
