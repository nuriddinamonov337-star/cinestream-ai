"""Reels integration — port of reels.ts.

Creates a reels_jobs row, forwards the job to the Python reels microservice,
and exposes the callback completion used by the /reels/callback endpoint.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import aiohttp

from .config import config
from .database import db, get_setting, set_setting
from .telegram_api import tg, tg_safe

log = logging.getLogger(__name__)
SETTING_KEY = "reels_webhook_url"


def get_reels_webhook_url() -> str | None:
    from_settings = get_setting(SETTING_KEY, None)
    if isinstance(from_settings, str) and from_settings.startswith("http"):
        return from_settings
    if config.reels_service_url and config.reels_service_url.startswith("http"):
        return config.reels_service_url
    return None


def set_reels_webhook_url(url: str) -> None:
    set_setting(SETTING_KEY, url)


def get_reels_secret() -> str:
    return config.reels_secret or config.bot_token


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
        log.error("[reels] log insert failed: %s", e)


async def request_reels(chat_id: int, telegram_id: int, url: str) -> dict:
    res = (
        db()
        .table("reels_jobs")
        .insert(
            {
                "telegram_id": telegram_id,
                "chat_id": chat_id,
                "source_url": url,
                "status": "pending",
            }
        )
        .select("id")
        .single()
        .execute()
    )
    job_id = res.data["id"]

    service_url = get_reels_webhook_url()
    if not service_url:
        db().table("reels_jobs").update(
            {"status": "failed", "error": "Reels service URL not configured"}
        ).eq("id", job_id).execute()
        return {"ok": False, "error": "Reels service URL not configured"}

    payload = {
        "event": "reels.requested",
        "job_id": job_id,
        "chat_id": chat_id,
        "telegram_id": telegram_id,
        "url": url,
        "secret": get_reels_secret(),
        "requested_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(service_url, json=payload) as resp:
                body = await resp.text()
                await _log(
                    {
                        "event": "reels.requested",
                        "target_url": service_url,
                        "payload": payload,
                        "status_code": resp.status,
                        "response_body": body[:2000],
                        "ok": resp.ok,
                    }
                )
                if not resp.ok:
                    db().table("reels_jobs").update(
                        {"status": "failed", "error": f"service {resp.status}"}
                    ).eq("id", job_id).execute()
                    return {"ok": False, "error": f"service returned {resp.status}"}
        db().table("reels_jobs").update({"status": "processing"}).eq("id", job_id).execute()
        return {"ok": True, "job_id": job_id}
    except Exception as e:
        log.error("[reels] request failed: %s", e)
        await _log(
            {"event": "reels.requested", "target_url": service_url, "payload": payload, "error": str(e), "ok": False}
        )
        db().table("reels_jobs").update(
            {"status": "failed", "error": str(e)}
        ).eq("id", job_id).execute()
        return {"ok": False, "error": str(e)}


async def complete_reels_job(job_id: str, result_url: str, error: str | None = None) -> dict:
    res = db().table("reels_jobs").select("*").eq("id", job_id).maybeSingle().execute()
    job = res.data
    if not job:
        return {"ok": False, "error": "job not found"}

    if error:
        db().table("reels_jobs").update(
            {"status": "failed", "error": error, "completed_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", job_id).execute()
        await tg_safe(
            "sendMessage",
            {"chat_id": job["chat_id"], "text": f"❌ Reels yasashda xatolik: {error}"},
        )
        return {"ok": False}

    db().table("reels_jobs").update(
        {"status": "sent", "result_url": result_url, "completed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", job_id).execute()
    try:
        await tg("sendDocument", {"chat_id": job["chat_id"], "document": result_url, "caption": "🎞 Tayyor Reel"})
    except Exception as e:
        log.error("[reels] sendDocument failed: %s", e)
    return {"ok": True}
