"""Movie logic — port of handleMovieCode + admin add/delete movie operations."""
from __future__ import annotations

from .database import db
from .telegram_api import tg, bot_username
from .users import is_user_premium


async def handle_movie_code(chat_id: int, telegram_id: int, user_id: str, code: str) -> None:
    res = db().table("movies").select("*").eq("code", code).maybeSingle().execute()
    movie = res.data
    if not movie:
        await tg(
            "sendMessage",
            {"chat_id": chat_id, "text": f"❓ <b>{code}</b> kodi bo'yicha kino topilmadi.", "parse_mode": "HTML"},
        )
        return

    if movie.get("is_premium"):
        premium = is_user_premium(user_id)
        if not premium["active"]:
            await tg(
                "sendMessage",
                {
                    "chat_id": chat_id,
                    "text": f"⭐ <b>{movie['title']}</b> — bu premium kino.\n\nKo'rish uchun premium sotib oling.",
                    "parse_mode": "HTML",
                    "reply_markup": {"inline_keyboard": [[{"text": "⭐ Premium olish", "callback_data": "premium_menu"}]]},
                },
            )
            return

    bu = await bot_username() or "kino"
    meta: list[str] = []
    if movie.get("year"):
        meta.append(str(movie["year"]))
    if movie.get("genre"):
        meta.append(movie["genre"])
    if movie.get("language"):
        meta.append(movie["language"])
    if movie.get("rating") is not None:
        meta.append(f"⭐ {movie['rating']}")
    meta_line = f"\n{' • '.join(meta)}" if meta else ""
    desc_line = f"\n\n{movie['description']}" if movie.get("description") else ""
    caption = f"🎬 <b>{movie['title']}</b>{meta_line}\n\n📺 @{bu}{desc_line}"

    file_type = movie.get("file_type", "video")
    method = "sendDocument" if file_type == "document" else "sendVideo"
    key = "document" if file_type == "document" else "video"
    try:
        await tg(method, {"chat_id": chat_id, key: movie["file_id"], "caption": caption, "parse_mode": "HTML"})
        db().table("movies").update({"views_count": (movie.get("views_count") or 0) + 1}).eq("id", movie["id"]).execute()
    except Exception as e:
        print(f"[sendVideo] file_id failed, trying copyMessage: {e}")
        try:
            if movie.get("source_chat_id") and movie.get("source_message_id"):
                await tg(
                    "copyMessage",
                    {
                        "chat_id": chat_id,
                        "from_chat_id": int(movie["source_chat_id"]),
                        "message_id": int(movie["source_message_id"]),
                        "caption": caption,
                        "parse_mode": "HTML",
                    },
                )
                db().table("movies").update({"views_count": (movie.get("views_count") or 0) + 1}).eq("id", movie["id"]).execute()
            else:
                raise e
        except Exception as e2:
            print(f"[copyMessage] also failed: {e2}")
            await tg(
                "sendMessage",
                {"chat_id": chat_id, "text": f"⚠️ Kinoni yuborishda xatolik: {e2}\n\nAdmin bilan bog'laning."},
            )


async def confirm_add_movie(chat_id: int, telegram_id: int) -> None:
    from .database import clear_session, get_session
    from .n8n import notify_movie_created

    sess = get_session(telegram_id)
    if not sess or sess.get("state") != "add_movie:confirm":
        return
    p = sess.get("payload") or {}
    if not p.get("code") or not p.get("title") or not p.get("file_id"):
        clear_session(telegram_id)
        await tg("sendMessage", {"chat_id": chat_id, "text": "❌ Eski sessiya topilmadi. Qaytadan urinib ko'ring."})
        return

    res = (
        db()
        .table("movies")
        .insert(
            {
                "code": p["code"],
                "title": p["title"],
                "file_id": p["file_id"],
                "file_type": p.get("file_type"),
                "source_chat_id": p.get("source_chat_id"),
                "source_message_id": p.get("source_message_id"),
                "caption": p.get("caption"),
                "poster_url": p.get("poster_url"),
                "year": p.get("year"),
                "genre": p.get("genre"),
                "rating": p.get("rating"),
                "description": p.get("description"),
                "language": p.get("language"),
            }
        )
        .select("*")
        .single()
        .execute()
    )
    inserted = res.data
    clear_session(telegram_id)
    await tg(
        "sendMessage",
        {
            "chat_id": chat_id,
            "parse_mode": "HTML",
            "text": f"✅ Kino qo'shildi!\n\n🎬 {p['title']}\n🔢 Kod: <code>{p['code']}</code>",
        },
    )
    try:
        await notify_movie_created(
            {
                "id": inserted.get("id"),
                "code": p["code"],
                "title": p["title"],
                "caption": p.get("caption"),
                "file_id": p["file_id"],
                "file_type": p.get("file_type"),
                "is_premium": False,
                "created_at": inserted.get("created_at"),
            }
        )
    except Exception as e:
        print(f"[n8n] notifyMovieCreated threw: {e}")
