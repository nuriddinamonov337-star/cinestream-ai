"""Telegram Bot API wrapper — port of api.ts.

Calls https://api.telegram.org/bot<TOKEN>/<method> directly via aiohttp.
"""
from __future__ import annotations

import logging
from typing import Any

import aiohttp

from .config import config

log = logging.getLogger(__name__)
API_BASE = "https://api.telegram.org"

_bot_username: str | None = None


def _token() -> str:
    if not config.bot_token:
        raise RuntimeError("BOT_TOKEN is not configured")
    return config.bot_token


async def tg(method: str, body: dict | None = None) -> Any:
    token = _token()
    url = f"{API_BASE}/bot{token}/{method}"
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=body or {}) as res:
            text = await res.text()
            try:
                import json

                data = json.loads(text)
            except Exception:
                data = {"ok": False, "description": text}
            if not res.ok or data.get("ok") is False:
                log.error("[tg] %s failed [%s]: %s", method, res.status, text[:500])
                raise RuntimeError(f"Telegram {method} failed: {data.get('description', res.status)}")
            return data["result"]


async def tg_safe(method: str, body: dict | None = None) -> Any:
    try:
        return await tg(method, body)
    except Exception as e:
        log.warning("[tgSafe] %s: %s", method, e)
        return None


async def bot_username() -> str | None:
    global _bot_username
    if _bot_username:
        return _bot_username
    try:
        me = await tg("getMe")
        _bot_username = me.get("username")
        return _bot_username
    except Exception:
        return None
