import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    bot_token: str
    webhook_secret: str
    webhook_url: str
    supabase_url: str
    supabase_key: str
    owner_id: int
    n8n_webhook_url: str | None
    reels_service_url: str | None
    reels_secret: str

    @property
    def webhook_path(self) -> str:
        return f"{self.webhook_url.rstrip('/')}/webhook"

    @property
    def is_configured(self) -> bool:
        return bool(self.bot_token and self.supabase_url and self.supabase_key)


def _int(value: str, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


config = Config(
    bot_token=os.getenv("BOT_TOKEN", os.getenv("TELEGRAM_BOT_TOKEN", "")),
    webhook_secret=os.getenv("TELEGRAM_WEBHOOK_SECRET", ""),
    webhook_url=os.getenv("WEBHOOK_URL", os.getenv("RAILWAY_PUBLIC_URL", "")),
    supabase_url=os.getenv("SUPABASE_URL", ""),
    supabase_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
    owner_id=_int(os.getenv("ADMIN_ID", os.getenv("OWNER_TELEGRAM_ID", "")), 5583787103),
    n8n_webhook_url=os.getenv("N8N_WEBHOOK_URL") or None,
    reels_service_url=os.getenv("REELS_SERVICE_URL") or None,
    reels_secret=os.getenv("REELS_SECRET", ""),
)
