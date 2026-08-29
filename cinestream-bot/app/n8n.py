"""n8n webhook integration — port of webhook-n8n.ts.

On each new movie, POSTs to a configured n8n URL (best effort, logged).
"""
from __future__ import annotations

import logging
from typing import Any

import aiohttp

from .config import config
from .database import db, get_setting, set_setting

log = logging.getLogger(__name__)
SETTING_KEY = "n8n_webhook_url"


def get_n8n_webhook_url() -> str | None:
    from_settings = get_setting(SETTING_KEY, None)
    if isinstance(from_settings, str) and from_settings.startswith("http"):
        return from_settings
    if config.n8n_webhook_url and config.n8n_webhook_url.startswith("http"):
        return config.n8n_webhook_url
    return None


def set_n8n_webhook_url(url: str) -> None:
    set_setting(SETTING_KEY, url)


async def _resolve_file_url(file_id: str) -> str | None:
    """Resolve a temporary Telegram CDN URL for a file_id."""
    from .telegram_api import tg

    try:
        info = await tg("getFile", {"file_id": file_id})
        if info and info.get("file_path"):
            return f"https://api.telegram.org/file/bot{config.bot_token}/{info['file_path']}"
    except Exception as e:
        log.warning("[n8n] getFile failed: %s", e)
    return None


async def _log(entry: dict) -> None:
    try:
        db().table("webhook_logs").insert(
            {
                "event": entry["event"],
                "target_url": entry["target_url"],
                "payload": entry["payload"],
                "status_code": entry.get("status_code"),
                "response_body": entry.get("response_body"),
                "error": entry.get("error"),
                "ok": entry["ok"],
            }
        ).execute()
    except Exception as e:
        log.error("[n8n] log insert failed: %s", e)


async def notify_movie_created(movie: dict) -> None:
    url = get_n8n_webhook_url()
    if not url:
        log.info("[n8n] webhook URL not configured, skipping")
        return

    file_url = await _resolve_file_url(movie["file_id"])
    payload = {
        "event": "movie.created",
        "movie": {
            "id": movie.get("id"),
            "code": movie["code"],
            "title": movie["title"],
            "description": movie.get("caption"),
            "file_id": movie["file_id"],
            "file_type": movie.get("file_type", "video"),
            "file_url": file_url,
            "is_premium": bool(movie.get("is_premium", False)),
            "created_at": movie.get("created_at"),
        },
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as res:
                body = await res.text()
                await _log(
                    {
                        "event": "movie.created",
                        "target_url": url,
                        "payload": payload,
                        "status_code": res.status,
                        "response_body": body[:2000],
                        "ok": res.ok,
                    }
                )
                if not res.ok:
                    log.warning("[n8n] webhook non-2xx: %s %s", res.status, body[:200])
    except Exception as e:
        log.error("[n8n] webhook failed: %s", e)
        await _log(
            {"event": "movie.created", "target_url": url, "payload": payload, "error": str(e), "ok": False}
        )
