"""Admin operations: stats, broadcast, channel CRUD, card edit, DB dump."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from .database import db, get_setting, set_setting, clear_session, set_session
from .keyboards import ik
from .telegram_api import tg, tg_safe


def _fmt_uzs(n: int | float) -> str:
    return f"{int(n):,}".replace(",", " ")


async def admin_stats(chat_id: int) -> None:
    now = datetime.now(timezone.utc).isoformat()
    users_count = db().table("users").select("*", count="exact").execute().count or 0
    movies_count = db().table("movies").select("*", count="exact").execute().count or 0
    channels_count = db().table("channels").select("*", count="exact").eq("is_active", True).execute().count or 0
    pending_pay = db().table("payments").select("*", count="exact").eq("status", "pending").execute().count or 0
    active_premium = db().table("premium_subscriptions").select("*", count="exact").gt("expires_at", now).execute().count or 0

    top_res = (
        db()
        .table("movies")
        .select("code, title, views_count")
        .order("views_count", descending=True)
        .limit(5)
        .execute()
    )
    top_movies = top_res.data or []
    top = "\n".join(f"{i + 1}. <b>{m['code']}</b> — {m['title']} ({m.get('views_count', 0)} marta)" for i, m in enumerate(top_movies)) or "—"
    await tg(
        "sendMessage",
        {
            "chat_id": chat_id,
            "parse_mode": "HTML",
            "text": (
                "📊 <b>Statistika</b>\n\n"
                f"👥 Foydalanuvchilar: <b>{users_count}</b>\n"
                f"🎬 Kinolar: <b>{movies_count}</b>\n"
                f"📺 Faol kanallar: <b>{channels_count}</b>\n"
                f"⭐ Faol premium: <b>{active_premium}</b>\n"
                f"⏳ Kutilayotgan to'lovlar: <b>{pending_pay}</b>\n\n"
                f"🔥 <b>Top 5 kino:</b>\n{top}"
            ),
        },
    )


async def send_stats(chat_id: int, telegram_id: int, user_id: str) -> None:
    res = (
        db()
        .table("premium_subscriptions")
        .select("*, premium_plans(title)")
        .eq("user_id", user_id)
        .order("expires_at", descending=True)
        .limit(1)
        .maybeSingle()
        .execute()
    )
    sub = res.data
    premium_text = "❌ Yo'q"
    status_text = "Oddiy foydalanuvchi"
    if sub:
        exp = datetime.fromisoformat(sub["expires_at"].replace("Z", "+00:00"))
        days_left = (exp - datetime.now(timezone.utc)).days
        plan_title = (sub.get("premium_plans") or {}).get("title", "")
        if days_left > 0:
            premium_text = f"⭐ {plan_title}"
            status_text = f"✅ Faol ({days_left} kun qoldi, {exp.date()} gacha)"
        else:
            premium_text = f"⌛ {plan_title} (muddati o'tgan)"
            status_text = "❌ Muddati tugagan"
    await tg(
        "sendMessage",
        {
            "chat_id": chat_id,
            "parse_mode": "HTML",
            "text": (
                "📊 <b>Sizning statusingiz</b>\n\n"
                f"🆔 Telegram ID: <code>{telegram_id}</code>\n"
                f"⭐ Premium turi: {premium_text}\n"
                f"📌 Holat: {status_text}"
            ),
        },
    )


async def run_broadcast(from_tg_id: int, msg: dict) -> None:
    res = db().table("users").select("telegram_id").eq("is_blocked", False).execute()
    users = res.data or []
    total = len(users)
    await tg("sendMessage", {"chat_id": from_tg_id, "text": f"📤 Yuborish boshlandi... ({total} ta foydalanuvchi)"})

    sent = 0
    failed = 0
    text = msg.get("text") or msg.get("caption") or ""
    photo = (msg.get("photo") or [None])[-1]
    photo = photo["file_id"] if photo else None
    video = (msg.get("video") or {}).get("file_id")

    for u in users:
        try:
            if photo:
                await tg("sendPhoto", {"chat_id": int(u["telegram_id"]), "photo": photo, "caption": text, "parse_mode": "HTML"})
            elif video:
                await tg("sendVideo", {"chat_id": int(u["telegram_id"]), "video": video, "caption": text, "parse_mode": "HTML"})
            elif text:
                await tg("sendMessage", {"chat_id": int(u["telegram_id"]), "text": text, "parse_mode": "HTML"})
            sent += 1
        except Exception as e:
            failed += 1
            err = str(e)
            if "blocked" in err or "deactivated" in err:
                db().table("users").update({"is_blocked": True}).eq("telegram_id", u["telegram_id"]).execute()
        if (sent + failed) % 25 == 0:
            await asyncio.sleep(1)

    db().table("broadcasts").insert(
        {
            "text": text,
            "media_file_id": photo or video,
            "media_file_type": "photo" if photo else ("video" if video else None),
            "sent_count": sent,
            "failed_count": failed,
            "created_by_telegram_id": from_tg_id,
        }
    ).execute()
    await tg(
        "sendMessage",
        {"chat_id": from_tg_id, "parse_mode": "HTML", "text": f"✅ Yuborish tugadi.\n\n📬 Yetkazildi: <b>{sent}</b>\n❌ Xato: <b>{failed}</b>"},
    )


async def list_channels_for_delete(chat_id: int) -> None:
    res = db().table("channels").select("*").eq("is_active", True).order("created_at").execute()
    chans = res.data or []
    if not chans:
        await tg("sendMessage", {"chat_id": chat_id, "text": "Faol kanallar yo'q."})
        return
    rows = [[{"text": f"❌ {c['title']}", "callback_data": f"adm:delch:{c['id']}"}] for c in chans]
    await tg("sendMessage", {"chat_id": chat_id, "text": "O'chiriladigan kanalni tanlang:", "reply_markup": ik(rows)})


async def add_channel_from_input(chat_id: int, telegram_id: int, text: str) -> None:
    from .telegram_api import tg as _tg

    try:
        if text.startswith("@"):
            info = await _tg("getChat", {"chat_id": text})
        else:
            cid = int(text)
            info = await _tg("getChat", {"chat_id": cid})
        resolved_id = info["id"]
        title = info.get("title") or text
        username = info.get("username") or (text.lstrip("@") if text.startswith("@") else None)
        invite_link = info.get("invite_link") or (f"https://t.me/{username}" if username else None)
        me = await _tg("getMe")
        member = await _tg("getChatMember", {"chat_id": resolved_id, "user_id": me["id"]})
        if member.get("status") not in ("administrator", "creator"):
            await tg("sendMessage", {"chat_id": chat_id, "text": "⚠️ Bot bu kanalda admin emas. Botni admin qiling va qayta urinib ko'ring."})
            return
    except Exception as e:
        await tg("sendMessage", {"chat_id": chat_id, "text": f"❌ Xato: {e}"})
        return
    db().table("channels").upsert(
        {"chat_id": resolved_id, "username": username, "title": title, "invite_link": invite_link, "is_active": True},
        on_conflict="chat_id",
    ).execute()
    clear_session(telegram_id)
    await tg("sendMessage", {"chat_id": chat_id, "parse_mode": "HTML", "text": f"✅ Kanal qo'shildi: <b>{title}</b>"})


def _esc_html(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


async def send_database_dump(chat_id: int) -> None:
    res = (
        db()
        .table("movies")
        .select("code,title,file_id,file_type,is_premium,views_count,created_at,poster_url,year,genre,rating,language")
        .order("created_at", descending=True)
        .execute()
    )
    rows = res.data or []
    if not rows:
        await tg("sendMessage", {"chat_id": chat_id, "text": "📭 Bazada hozircha kino yo'q."})
        return

    blocks = []
    for i, m in enumerate(rows):
        meta: list[str] = []
        if m.get("year"):
            meta.append(str(m["year"]))
        if m.get("genre"):
            meta.append(m["genre"])
        if m.get("language"):
            meta.append(m["language"])
        if m.get("rating") is not None:
            meta.append(f"⭐{m['rating']}")
        meta_line = f"\n{' • '.join(meta)}" if meta else ""
        premium_tag = " • 💎 premium" if m.get("is_premium") else ""
        blocks.append(
            f"<b>{i + 1}. {_esc_html(m['title'])}</b>{meta_line}\n"
            f"Kod: <code>{_esc_html(m['code'])}</code>\n"
            f"Turi: {_esc_html(m.get('file_type', 'video'))}{premium_tag} • 👁 {m.get('views_count', 0)}\n"
            f"file_id: <code>{_esc_html(m['file_id'])}</code>"
        )

    buf = f"🗄 <b>Baza: {len(rows)} ta kino</b>\n\n"
    for b in blocks:
        if len(buf) + len(b) + 2 > 3500:
            await tg("sendMessage", {"chat_id": chat_id, "text": buf, "parse_mode": "HTML", "disable_web_page_preview": True})
            buf = ""
        buf += b + "\n\n"
    if buf.strip():
        await tg("sendMessage", {"chat_id": chat_id, "text": buf, "parse_mode": "HTML", "disable_web_page_preview": True})
