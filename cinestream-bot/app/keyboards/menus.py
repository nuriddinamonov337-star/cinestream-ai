"""Menu keyboards used across the bot."""
from __future__ import annotations

from . import ik


def main_menu(is_admin: bool) -> object:
    rows = [[{"text": "🎬 Kino kodini kiriting", "callback_data": "how_to"}]]
    rows.append(
        [
            {"text": "⭐ Premium sotib olish", "callback_data": "premium_menu"},
            {"text": "📊 Statusingiz", "callback_data": "my_stats"},
        ]
    )
    rows.append([{"text": "🎞 Reels yasash", "callback_data": "reels:menu"}])
    if is_admin:
        rows.append([{"text": "🛠 Admin panel", "callback_data": "admin_menu"}])
    return ik(rows)


def cancel_kb(callback_data: str = "adm:cancel") -> object:
    return ik([[{"text": "❌ Bekor qilish", "callback_data": callback_data}]])


def admin_menu() -> object:
    return ik(
        [
            [
                {"text": "🎬 Kino qo'shish", "callback_data": "adm:add_movie"},
                {"text": "🗑 Kino o'chirish", "callback_data": "adm:del_movie"},
            ],
            [
                {"text": "📺 Kanal qo'shish", "callback_data": "adm:add_channel"},
                {"text": "❌ Kanal o'chirish", "callback_data": "adm:del_channel"},
            ],
            [
                {"text": "📊 Statistika", "callback_data": "adm:stats"},
                {"text": "📢 Xabar yuborish", "callback_data": "adm:broadcast"},
            ],
            [
                {"text": "💳 Karta ma'lumoti", "callback_data": "adm:card"},
                {"text": "🔗 n8n webhook", "callback_data": "adm:n8n"},
            ],
            [{"text": "🎞 Reels service URL", "callback_data": "adm:reels"}],
        ]
    )


def subscribe_kb(missing: list[dict]) -> object:
    rows: list[list[dict]] = []
    for ch in missing:
        link = ch.get("invite_link") or (
            f"https://t.me/{str(ch.get('username', '')).lstrip('@')}"
            if ch.get("username")
            else None
        )
        if link:
            rows.append([{"text": f"📢 {ch.get('title', 'Kanal')}", "url": link}])
    rows.append([{"text": "✅ Tekshirish", "callback_data": "check_subs"}])
    rows.append([{"text": "⭐ Premium sotib olish", "callback_data": "premium_menu"}])
    return ik(rows)
