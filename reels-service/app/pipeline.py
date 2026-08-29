"""Reels processing pipeline (skeleton).

The real implementation downloads the source via yt-dlp, trims a vertical
segment with ffmpeg, burns a caption overlay, and uploads the result. For now
`process_job` is stubbed so the service flow can be validated end-to-end.
"""

import logging
import tempfile
from dataclasses import dataclass

logger = logging.getLogger("reels.pipeline")


@dataclass
class ReelsResult:
    result_url: str | None
    error: str | None


async def process_job(job_id: str, source_url: str, max_seconds: int) -> ReelsResult:
    """Process a single reels job.

    TODO: implement with yt-dlp + ffmpeg.
      1. yt-dlp download `source_url` to a temp file.
      2. ffmpeg: trim to `max_seconds`, scale to 1080x1920, burn caption.
      3. Upload the rendered clip (Supabase Storage / R2 / Telegram).
      4. Return the public result_url.
    """
    logger.info("processing job=%s url=%s (stub)", job_id, source_url)
    with tempfile.TemporaryDirectory() as _tmp:
        # Skeleton: no real work yet.
        return ReelsResult(result_url=None, error="reels pipeline not implemented yet")
