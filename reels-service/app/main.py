"""FastAPI entrypoint for the Reels microservice."""

import logging

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from .config import settings
from .pipeline import process_job

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("reels")

app = FastAPI(title="CineStream Reels Service", version="0.1.0")


class ReelsRequest(BaseModel):
    event: str
    job_id: str
    chat_id: int
    telegram_id: int
    url: str
    secret: str | None = None
    requested_at: str | None = None


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/jobs")
async def create_job(req: ReelsRequest, x_reels_secret: str | None = Header(default=None)) -> dict:
    """Receive a reels job from the Node bot.

    Auth: the bot sends `secret` in the body; we additionally accept an
    `X-Reels-Secret` header for symmetry with the callback endpoint.
    """
    secret = x_reels_secret or req.secret
    if not settings.REELS_SECRET or secret != settings.REELS_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")

    logger.info("received job=%s chat=%s url=%s", req.job_id, req.chat_id, req.url)

    # Fire-and-forget style: process and notify. In production, push to a queue
    # (e.g. RQ/Celery) and return 202 immediately.
    result = await process_job(req.job_id, req.url, settings.MAX_CLIP_SECONDS)
    await _notify_callback(req.job_id, result.result_url, result.error)
    return {"accepted": True, "job_id": req.job_id, "error": result.error}


async def _notify_callback(job_id: str, result_url: str | None, error: str | None) -> None:
    """POST the result back to the Node bot callback endpoint."""
    import httpx

    if not settings.BOT_CALLBACK_URL:
        logger.warning("BOT_CALLBACK_URL not set; skipping callback for job=%s", job_id)
        return

    payload: dict = {"job_id": job_id}
    if error:
        payload["error"] = error
    else:
        payload["result_url"] = result_url

    headers = {"X-Reels-Secret": settings.REELS_SECRET}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(settings.BOT_CALLBACK_URL, json=payload, headers=headers)
        logger.info("callback job=%s status=%s", job_id, resp.status_code)
    except Exception as e:  # noqa: BLE001
        logger.error("callback failed job=%s err=%s", job_id, e)
