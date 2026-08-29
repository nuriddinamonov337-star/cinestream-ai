"""FastAPI webhook server — receives Telegram updates and reels callbacks.

Endpoints:
  POST /webhook          — Telegram updates (X-Telegram-Bot-Api-Secret-Token verified)
  POST /reels/callback   — reels microservice completion (X-Reels-Secret verified)
  GET  /health           — healthcheck for Railway
"""
from __future__ import annotations

import json
import logging

from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse

from .config import config
from .reels import complete_reels_job
from .router import handle_update

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("cinestream-bot")

app = FastAPI(title="CineStream AI Bot", version="1.0.0")


@app.get("/health")
async def health():
    return {"status": "ok", "configured": config.is_configured}


@app.post("/webhook")
async def telegram_webhook(request: Request, x_telegram_bot_api_secret_token: str | None = Header(None)):
    if config.webhook_secret:
        if x_telegram_bot_api_secret_token != config.webhook_secret:
            log.warning("[webhook] invalid secret token")
            return JSONResponse(status_code=403, content={"error": "Forbidden"})
    try:
        update = await request.json()
        await handle_update(update)
    except Exception as e:
        log.error("[webhook] error: %s", e)
    return JSONResponse(status_code=200, content={"ok": True})


@app.post("/reels/callback")
async def reels_callback(request: Request, x_reels_secret: str | None = Header(None, alias="X-Reels-Secret")):
    expected = config.reels_secret or config.bot_token
    if expected and x_reels_secret != expected:
        log.warning("[reels/callback] invalid secret")
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    try:
        body = await request.json()
        job_id = body.get("job_id")
        result_url = body.get("result_url")
        error = body.get("error")
        if not job_id:
            return JSONResponse(status_code=400, content={"error": "job_id required"})
        result = await complete_reels_job(str(job_id), result_url, error)
        return JSONResponse(status_code=200, content=result)
    except Exception as e:
        log.error("[reels/callback] error: %s", e)
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.on_event("startup")
async def _startup():
    if config.is_configured:
        log.info("Bot ready. Webhook URL: %s", config.webhook_path)
    else:
        log.warning("Bot not fully configured (missing BOT_TOKEN or Supabase creds)")
