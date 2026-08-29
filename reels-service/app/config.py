"""Reels microservice configuration (env-driven)."""

import os


class Settings:
    BOT_CALLBACK_URL: str = os.getenv("BOT_CALLBACK_URL", "http://localhost:3000/api/public/reels/callback")
    REELS_SECRET: str = os.getenv("REELS_SECRET", "")
    PORT: int = int(os.getenv("PORT", "8000"))
    # Max source clip length (seconds) to extract into a reel.
    MAX_CLIP_SECONDS: int = int(os.getenv("MAX_CLIP_SECONDS", "60"))


settings = Settings()
