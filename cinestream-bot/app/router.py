"""Update router — port of handlers.ts onMessage / onCallback / handleAdminFSM.

Dispatches incoming Telegram updates (messages, callback queries) to the
appropriate handler. Multi-step admin dialogs use the admin_sessions FSM.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from .admin import (
    add_channel_from_input,
    admin_stats,
    list_channels_for_delete,
    run_broadcast,
    send_database_dump,
    send_stats,
)
from .database import (
    clear_session,
    get_session,
    get_setting,
    is_admin,
    set_setting,
    set_session,
)
from .keyboards import ik
from .keyboards.menus import admin_menu, cancel_kb, main_menu, subscribe_kb
from .movies import confirm_add_movie, handle_movie_code
from .n8n import get_n8n_webhook_url, set_n8n_webhook_url
from .premium import decide_payment, handle_receipt, send_premium_menu, start_payment
from .promt import send_promt
from .reels import get_reels_webhook_url, request_reels, set_reels_webhook_url
from .telegram_api import bot_username, tg, tg_safe
from .users import check_subscriptions, upsert_user


async def handle_update(update: dict) -> None:
    try:
        if "message" in update:
            await on_message(update["message"])
        elif "callback_query" in update:
            await on_callback(update["callback_query"])
    except Exception as e:
        print(f"[handleUpdate] error: {e}")


# ---------- helpers ----------
async def _send_main_menu(chat_id: int, is_admin_user: bool) -> None:
    await tg(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": "🎬 <b>Bosh menyu</b>\nKino kodini yuboring yoki tugmalardan foydalaning.",
            "parse_mode": "HTML",
            "reply_markup": main_menu(is_admin_user),
        },
    )


async def _send_start_flow(chat_id: int, telegram_id: int, user_id: str, is_admin_user: bool) -> None:
    _, missing = await check_subscriptions(telegram_id)
    if missing:
        await tg(
            "sendMessage",
            {
                "chat_id": chat_id,
                "parse_mode": "HTML",
                "text": (
                    "🎬 Botdan foydalanish uchun quyidagi kanallarga obuna bo'ling:\n\n"
                    "Obuna bo'lgach ✅ Tekshirish tugmasini bosing."
                ),
                "reply_markup": subscribe_kb(missing),
            },
        )
        return
    welcome = get_setting("welcome_text", "Xush kelibsiz!")
    await tg("sendMessage", {"chat_id": chat_id, "text": f"👋 {welcome}", "parse_mode": "HTML"})
    await _send_main_menu(chat_id, is_admin_user)


# ---------- message handler ----------
async def on_message(msg: dict) -> None:
    from_user = msg.get("from")
    chat = msg.get("chat") or {}
    if not from_user or chat.get("type") != "private":
        return
    tg_user = from_user
    user = upsert_user(tg_user)
    chat_id = chat["id"]
    text = (msg.get("text") or "").strip()
    telegram_id = tg_user["id"]
    is_admin_user = is_admin(telegram_id)

    # Admin FSM first
    sess = get_session(telegram_id)
    if sess and is_admin_user:
        if await handle_admin_fsm(chat_id, telegram_id, msg, sess):
            return

    # Awaiting receipt (any user)
    if sess and sess.get("state") == "awaiting_receipt":
        if await handle_receipt(chat_id, telegram_id, msg):
            return

    # Reels link (any user)
    if sess and sess.get("state") == "reels:link":
        link_text = (msg.get("text") or "").strip()
        if not link_text or not re.match(r"^https?://", link_text, re.I):
            await tg("sendMessage", {"chat_id": chat_id, "text": "Iltimos, to'g'ri havola yuboring (http/https)."})
            return
        clear_session(telegram_id)
        await tg("sendMessage", {"chat_id": chat_id, "text": "⏳ Reels tayyorlanmoqda, biroz kuting..."})
        res = await request_reels(chat_id, telegram_id, link_text)
        if not res["ok"]:
            await tg("sendMessage", {"chat_id": chat_id, "text": f"❌ Reels so'rovida xatolik: {res['error']}"})
        return

    # Commands
    if text == "/start":
        clear_session(telegram_id)
        await _send_start_flow(chat_id, telegram_id, user["id"], is_admin_user)
        return
    if text == "/stats":
        await send_stats(chat_id, telegram_id, user["id"])
        return
    if text == "/admin":
        if not is_admin_user:
            await tg("sendMessage", {"chat_id": chat_id, "text": "⛔ Sizda admin huquqi yo'q."})
            return
        await _send_admin_menu(chat_id)
        return
    if text == "/promt":
        if not is_admin_user:
            await tg("sendMessage", {"chat_id": chat_id, "text": "⛔ Bu buyruq faqat admin uchun."})
            return
        await send_promt(chat_id)
        return
    if text in ("/database", "/db"):
        if not is_admin_user:
            await tg("sendMessage", {"chat_id": chat_id, "text": "⛔ Bu buyruq faqat admin uchun."})
            return
        await send_database_dump(chat_id)
        return
    if text == "/myid":
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": f"Sizning Telegram ID: <code>{telegram_id}</code>"})
        return
    if text == "/setwebhook":
        if not is_admin_user:
            await tg("sendMessage", {"chat_id": chat_id, "text": "⛔ Bu buyruq faqat admin uchun."})
            return
        await _cmd_setwebhook(chat_id)
        return
    if text == "/webhookinfo":
        if not is_admin_user:
            await tg("sendMessage", {"chat_id": chat_id, "text": "⛔ Bu buyruq faqat admin uchun."})
            return
        await _cmd_webhookinfo(chat_id)
        return

    # Subscription enforcement
    _, missing = await check_subscriptions(telegram_id)
    if missing:
        await tg(
            "sendMessage",
            {
                "chat_id": chat_id,
                "parse_mode": "HTML",
                "text": "🎬 Botdan foydalanish uchun quyidagi kanallarga obuna bo'ling:\n\nObuna bo'lgach ✅ Tekshirish tugmasini bosing.",
                "reply_markup": subscribe_kb(missing),
            },
        )
        return

    # Numeric input -> movie code
    if re.match(r"^\d{1,10}$", text):
        await handle_movie_code(chat_id, telegram_id, user["id"], text)
        return

    await _send_main_menu(chat_id, is_admin_user)


async def _send_admin_menu(chat_id: int) -> None:
    await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": "🛠 <b>Admin panel</b>", "reply_markup": admin_menu()})


async def _cmd_setwebhook(chat_id: int) -> None:
    from .config import config
    try:
        if not config.webhook_url or not config.webhook_secret:
            await tg("sendMessage", {"chat_id": chat_id, "text": "❌ WEBHOOK_URL yoki TELEGRAM_WEBHOOK_SECRET sozlanmagan."})
            return
        url = config.webhook_path
        res = await tg("setWebhook", {"url": url, "secret_token": config.webhook_secret, "allowed_updates": ["message", "callback_query"]})
        await tg(
            "sendMessage",
            {"chat_id": chat_id, "parse_mode": "HTML", "text": f"✅ Webhook o'rnatildi.\nURL: <code>{res.get('url', url)}</code>\nPending updates: {res.get('pending_update_count', 0)}"},
        )
    except Exception as e:
        await tg("sendMessage", {"chat_id": chat_id, "text": f"❌ Webhook sozlashda xato: {e}"})


async def _cmd_webhookinfo(chat_id: int) -> None:
    try:
        info = await tg("getWebhookInfo", {})
        await tg(
            "sendMessage",
            {
                "chat_id": chat_id,
                "parse_mode": "HTML",
                "text": (
                    f"🔗 <b>Webhook info</b>\n"
                    f"URL: <code>{info.get('url', '—')}</code>\n"
                    f"Has custom cert: {info.get('has_custom_certificate')}\n"
                    f"Pending: {info.get('pending_update_count', 0)}\n"
                    f"Max connections: {info.get('max_connections', '—')}\n"
                    f"Last error: {info.get('last_error_message', '—')}"
                ),
            },
        )
    except Exception as e:
        await tg("sendMessage", {"chat_id": chat_id, "text": f"❌ {e}"})


# ---------- callback handler ----------
async def on_callback(cb: dict) -> None:
    msg = cb.get("message") or {}
    chat_id = msg.get("chat", {}).get("id")
    telegram_id = cb["from"]["id"]
    data = cb.get("data") or ""
    if not chat_id:
        return
    user = upsert_user(cb["from"])
    is_admin_user = is_admin(telegram_id)

    await tg_safe("answerCallbackQuery", {"callback_query_id": cb["id"]})

    if data == "check_subs":
        _, missing = await check_subscriptions(telegram_id)
        if missing:
            await tg("sendMessage", {"chat_id": chat_id, "text": "❌ Hali ham hamma kanallarga obuna bo'lmagansiz."})
        else:
            await tg("sendMessage", {"chat_id": chat_id, "text": "✅ Obuna tasdiqlandi!"})
            await _send_main_menu(chat_id, is_admin_user)
        return
    if data == "premium_menu":
        await send_premium_menu(chat_id)
        return
    if data == "my_stats":
        await send_stats(chat_id, telegram_id, user["id"])
        return
    if data == "reels:menu":
        service_url = get_reels_webhook_url()
        if not service_url:
            await tg("sendMessage", {"chat_id": chat_id, "text": "🎞 Reels servisi hozircha sozlanmagan. Iltimos, keyinroq urinib ko'ring."})
            return
        set_session(telegram_id, "reels:link", {})
        await tg(
            "sendMessage",
            {"chat_id": chat_id, "parse_mode": "HTML", "text": "🎞 <b>Reels yasash</b>\n\nReels uchun manba havolani yuboring (YouTube / TikTok / video URL).", "reply_markup": cancel_kb()},
        )
        return
    if data == "how_to":
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": "Kino kodini raqam sifatida yuboring (masalan: <code>245</code>)."})
        return
    if data == "cancel_payment":
        clear_session(telegram_id)
        await tg("sendMessage", {"chat_id": chat_id, "text": "To'lov bekor qilindi."})
        return
    if data.startswith("buy:"):
        await start_payment(chat_id, user["id"], telegram_id, data[4:])
        return
    if data.startswith("pay_ok:"):
        await decide_payment(cb, data[7:], True)
        return
    if data.startswith("pay_no:"):
        await decide_payment(cb, data[7:], False)
        return

    # Admin-only
    if not is_admin_user:
        return
    if data == "admin_menu":
        await _send_admin_menu(chat_id)
        return
    if data == "adm:cancel":
        clear_session(telegram_id)
        await tg("sendMessage", {"chat_id": chat_id, "text": "Bekor qilindi."})
        return
    if data == "adm:stats":
        await admin_stats(chat_id)
        return
    if data == "adm:add_movie":
        set_session(telegram_id, "add_movie:title", {})
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": "🎬 <b>Yangi kino</b>\n\n1. Kino <b>nomini</b> yuboring:", "reply_markup": cancel_kb()})
        return
    if data == "adm:del_movie":
        set_session(telegram_id, "del_movie:code", {})
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": "🗑 O'chiriladigan kino <b>kodini</b> yuboring:", "reply_markup": cancel_kb()})
        return
    if data == "adm:add_channel":
        set_session(telegram_id, "add_channel:input", {})
        await tg(
            "sendMessage",
            {
                "chat_id": chat_id,
                "parse_mode": "HTML",
                "text": "📺 <b>Yangi majburiy kanal</b>\n\nKanal @username ni yoki chat_id (-100...) ni yuboring.\n\n⚠️ Bot kanalda admin bo'lishi shart, aks holda obunani tekshira olmaydi.",
                "reply_markup": cancel_kb(),
            },
        )
        return
    if data == "adm:del_channel":
        await list_channels_for_delete(chat_id)
        return
    if data == "adm:broadcast":
        set_session(telegram_id, "broadcast:input", {})
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": "📢 Yubormoqchi bo'lgan <b>xabaringizni yuboring</b> (matn, rasm yoki video).", "reply_markup": cancel_kb()})
        return
    if data == "adm:card":
        num = get_setting("card_number", "")
        holder = get_setting("card_holder", "")
        set_session(telegram_id, "card:number", {"current_number": num, "current_holder": holder})
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": f"💳 Hozirgi karta: <code>{num}</code>\nEgasi: <b>{holder}</b>\n\nYangi karta raqamini yuboring:", "reply_markup": cancel_kb()})
        return
    if data == "adm:n8n":
        current = get_n8n_webhook_url() or "—"
        set_session(telegram_id, "n8n:url", {})
        await tg(
            "sendMessage",
            {
                "chat_id": chat_id,
                "parse_mode": "HTML",
                "text": f"🔗 <b>n8n webhook</b>\n\nHozirgi URL: <code>{current}</code>\n\nYangi n8n webhook URL manzilini yuboring (https:// bilan boshlansin).\nO'chirish uchun <code>-</code> yuboring.",
                "reply_markup": cancel_kb(),
            },
        )
        return
    if data == "adm:reels":
        current = get_reels_webhook_url() or "—"
        set_session(telegram_id, "reels_url:input", {})
        await tg(
            "sendMessage",
            {
                "chat_id": chat_id,
                "parse_mode": "HTML",
                "text": f"🎞 <b>Reels service URL</b>\n\nHozirgi URL: <code>{current}</code>\n\nYangi Reels Python service manzilini yuboring (https:// bilan boshlansin).\nO'chirish uchun <code>-</code> yuboring.",
                "reply_markup": cancel_kb(),
            },
        )
        return
    if data == "adm:movie_confirm":
        await confirm_add_movie(chat_id, telegram_id)
        return
    if data.startswith("adm:delch:"):
        chan_id = data[len("adm:delch:"):]
        from .database import db as _db
        _db().table("channels").update({"is_active": False}).eq("id", chan_id).execute()
        await tg("sendMessage", {"chat_id": chat_id, "text": "✅ Kanal ro'yxatdan olib tashlandi."})
        return


# ---------- admin FSM ----------
async def handle_admin_fsm(chat_id: int, telegram_id: int, msg: dict, sess: dict) -> bool:
    text = (msg.get("text") or "").strip()
    state = sess.get("state", "")
    payload = sess.get("payload") or {}

    if state == "add_movie:title":
        if not text:
            await tg("sendMessage", {"chat_id": chat_id, "text": "Nom bo'sh bo'lmasin. Kino nomini yuboring."})
            return True
        set_session(telegram_id, "add_movie:code", {"title": text})
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": f"✔ Nom: <b>{text}</b>\n\n2. Endi kino <b>kodini</b> yuboring (masalan 245):"})
        return True

    if state == "add_movie:code":
        if not re.match(r"^\d{1,10}$", text):
            await tg("sendMessage", {"chat_id": chat_id, "text": "Kod faqat raqamlardan iborat bo'lsin."})
            return True
        from .database import db as _db
        existing = _db().table("movies").select("id").eq("code", text).maybeSingle().execute().data
        if existing:
            await tg("sendMessage", {"chat_id": chat_id, "text": "Bu kod band. Boshqa kod yuboring."})
            return True
        set_session(telegram_id, "add_movie:poster", {**payload, "code": text})
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": f"✔ Kod: <b>{text}</b>\n\n3. Endi kino <b>posterini</b> rasm sifatida yuboring (majburiy)."})
        return True

    if state == "add_movie:poster":
        photo = msg.get("photo") or []
        poster_file_id = photo[-1]["file_id"] if photo else None
        if not poster_file_id:
            await tg("sendMessage", {"chat_id": chat_id, "text": "Iltimos, posterni rasm (photo) sifatida yuboring."})
            return True
        set_session(telegram_id, "add_movie:year", {**payload, "poster_url": poster_file_id})
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": "✔ Poster qabul qilindi.\n\n4. Kino <b>yilini</b> yuboring (masalan 2024) yoki o'tkazib o'tish uchun <code>-</code>:"})
        return True

    if state == "add_movie:year":
        year = None
        if text and text != "-":
            try:
                y = int(text)
                if y < 1800 or y > 2100:
                    raise ValueError
                year = y
            except ValueError:
                await tg("sendMessage", {"chat_id": chat_id, "text": "To'g'ri yil yuboring (masalan 2024) yoki -."})
                return True
        set_session(telegram_id, "add_movie:genre", {**payload, "year": year})
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": "5. Kino <b>janrini</b> yuboring (masalan: Drama, Komediya) yoki <code>-</code>:"})
        return True

    if state == "add_movie:genre":
        genre = text if text and text != "-" else None
        set_session(telegram_id, "add_movie:rating", {**payload, "genre": genre})
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": "6. Kino <b>reytingini</b> yuboring (0.0–10.0, masalan 8.5) yoki <code>-</code>:"})
        return True

    if state == "add_movie:rating":
        rating = None
        if text and text != "-":
            try:
                r = float(text)
                if r < 0 or r > 10:
                    raise ValueError
                rating = round(r, 1)
            except ValueError:
                await tg("sendMessage", {"chat_id": chat_id, "text": "Reyting 0 dan 10 gacha (masalan 8.5) yoki -."})
                return True
        set_session(telegram_id, "add_movie:description", {**payload, "rating": rating})
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": "7. Kino <b>tafsilot/tavsifini</b> yuboring yoki <code>-</code>:"})
        return True

    if state == "add_movie:description":
        description = text if text and text != "-" else None
        set_session(telegram_id, "add_movie:language", {**payload, "description": description})
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": "8. Kino <b>tilini</b> yuboring (masalan: O'zbek, Rus) yoki <code>-</code>:"})
        return True

    if state == "add_movie:language":
        language = text if text and text != "-" else None
        set_session(telegram_id, "add_movie:file", {**payload, "language": language})
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": "9. Endi kino <b>video faylini</b> shu chatga yuboring."})
        return True

    if state == "add_movie:file":
        video = msg.get("video")
        document = msg.get("document")
        file_id = (video or {}).get("file_id") or (document or {}).get("file_id")
        if not file_id:
            await tg("sendMessage", {"chat_id": chat_id, "text": "Iltimos, video faylni yuboring."})
            return True
        draft = {
            **payload,
            "file_id": file_id,
            "file_type": "video" if video else "document",
            "source_chat_id": msg["chat"]["id"],
            "source_message_id": msg["message_id"],
            "caption": msg.get("caption"),
        }
        set_session(telegram_id, "add_movie:confirm", draft)
        summary_parts = [
            f"🎬 {payload.get('title')}",
            f"🔢 Kod: {payload.get('code')}",
            f"📅 Yil: {payload.get('year')}" if payload.get("year") else None,
            f"🎭 Janr: {payload.get('genre')}" if payload.get("genre") else None,
            f"⭐ Reyting: {payload.get('rating')}" if payload.get("rating") is not None else None,
            f"🌐 Til: {payload.get('language')}" if payload.get("language") else None,
            payload.get("description") or None,
            f"🎞 Turi: {draft['file_type']}",
        ]
        summary = "\n".join(p for p in summary_parts if p)
        await tg(
            "sendMessage",
            {
                "chat_id": chat_id,
                "parse_mode": "HTML",
                "text": f"📦 <b>Tasdiqlang</b>\n\n{summary}\n\nKino bazaga qo'shilsinmi?",
                "reply_markup": ik(
                    [
                        [{"text": "✅ Tasdiqlash va qo'shish", "callback_data": "adm:movie_confirm"}],
                        [{"text": "❌ Bekor qilish", "callback_data": "adm:cancel"}],
                    ]
                ),
            },
        )
        return True

    if state == "add_movie:confirm":
        return True

    if state == "reels_url:input":
        if not text or not re.match(r"^https?://", text, re.I):
            await tg("sendMessage", {"chat_id": chat_id, "text": "Iltimos, to'g'ri havola yuboring."})
            return True
        set_reels_webhook_url(text.strip())
        clear_session(telegram_id)
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": f"✅ Reels service URL saqlandi:\n<code>{text.strip()}</code>"})
        return True

    if state == "del_movie:code":
        from .database import db as _db
        m = _db().table("movies").select("*").eq("code", text).maybeSingle().execute().data
        if not m:
            await tg("sendMessage", {"chat_id": chat_id, "text": "Bunday kod topilmadi."})
            clear_session(telegram_id)
            return True
        _db().table("movies").delete().eq("id", m["id"]).execute()
        clear_session(telegram_id)
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": f"🗑 O'chirildi: <b>{m['title']}</b> (kod {m['code']})"})
        return True

    if state == "add_channel:input":
        await add_channel_from_input(chat_id, telegram_id, text)
        return True

    if state == "broadcast:input":
        clear_session(telegram_id)
        import asyncio
        asyncio.create_task(run_broadcast(telegram_id, msg))
        return True

    if state == "card:number":
        if not text:
            await tg("sendMessage", {"chat_id": chat_id, "text": "Karta raqamini yuboring."})
            return True
        set_session(telegram_id, "card:holder", {**payload, "new_number": text})
        await tg("sendMessage", {"chat_id": chat_id, "text": "Endi karta egasining ism-familiyasini yuboring:"})
        return True

    if state == "card:holder":
        if not text:
            await tg("sendMessage", {"chat_id": chat_id, "text": "Ism-familiya yuboring."})
            return True
        set_setting("card_number", payload.get("new_number"))
        set_setting("card_holder", text)
        clear_session(telegram_id)
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": f"✅ Karta ma'lumoti yangilandi:\n\n💳 <code>{payload.get('new_number')}</code>\n👤 <b>{text}</b>"})
        return True

    if state == "n8n:url":
        if not text:
            await tg("sendMessage", {"chat_id": chat_id, "text": "URL yuboring yoki o'chirish uchun -"})
            return True
        if text == "-":
            set_n8n_webhook_url("")
            clear_session(telegram_id)
            await tg("sendMessage", {"chat_id": chat_id, "text": "🗑 n8n webhook URL o'chirildi."})
            return True
        if not re.match(r"^https?://", text, re.I):
            await tg("sendMessage", {"chat_id": chat_id, "text": "❌ URL http:// yoki https:// bilan boshlanishi kerak."})
            return True
        set_n8n_webhook_url(text)
        clear_session(telegram_id)
        await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": f"✅ n8n webhook URL saqlandi:\n<code>{text}</code>\n\nEndi har yangi kino qo'shilganda ushbu URL ga POST yuboriladi."})
        return True

    return False
