"""User + subscription logic — port of handlers.ts user/subscription functions."""
from __future__ import annotations

from datetime import datetime, timezone

from .database import db
from .telegram_api import tg


def upsert_user(u: dict) -> dict:
    """Insert/update a user row, return the full record."""
    res = (
        db()
        .table("users")
        .upsert(
            {
                "telegram_id": u["id"],
                "username": u.get("username"),
                "first_name": u.get("first_name"),
                "last_name": u.get("last_name"),
                "language_code": u.get("language_code"),
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="telegram_id",
        )
        .select("*")
        .single()
        .execute()
    )
    return res.data


def get_required_channels() -> list[dict]:
    res = (
        db()
        .table("channels")
        .select("*")
        .eq("is_active", True)
        .order("created_at")
        .execute()
    )
    return res.data or []


async def check_subscriptions(telegram_user_id: int) -> tuple[list[dict], list[dict]]:
    """Return (all_channels, missing_channels)."""
    channels = get_required_channels()
    missing: list[dict] = []
    for ch in channels:
        try:
            res = await tg("getChatMember", {"chat_id": int(ch["chat_id"]), "user_id": telegram_user_id})
            status = res.get("status") if res else None
            if status not in ("member", "administrator", "creator"):
                missing.append(ch)
        except Exception as e:
            print(f"[checkSubscriptions] {ch['chat_id']}: {e}")
            missing.append(ch)
    return channels, missing


def is_user_premium(user_id: str) -> dict:
    res = (
        db()
        .table("premium_subscriptions")
        .select("expires_at")
        .eq("user_id", user_id)
        .gt("expires_at", datetime.now(timezone.utc).isoformat())
        .order("expires_at", descending=True)
        .limit(1)
        .maybeSingle()
        .execute()
    )
    data = res.data
    return {"active": bool(data), "expires_at": data["expires_at"] if data else None}
