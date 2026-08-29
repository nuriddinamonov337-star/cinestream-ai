"""Premium + payment flow — port of handlers.ts premium/payment functions."""
from __future__ import annotations

from datetime import datetime, timezone
from datetime import timedelta

from .database import db, get_admin_ids, get_setting, clear_session, get_session, set_session
from .keyboards import ik
from .telegram_api import tg, tg_safe


def _fmt_uzs(n: int | float) -> str:
    return f"{int(n):,}".replace(",", " ")


async def send_premium_menu(chat_id: int) -> None:
    res = (
        db()
        .table("premium_plans")
        .select("*")
        .eq("is_active", True)
        .order("sort_order")
        .execute()
    )
    plans = res.data or []
    rows = [[{"text": f"{p['title']} — {_fmt_uzs(p['price_uzs'])} so'm", "callback_data": f"buy:{p['key']}"}] for p in plans]
    await tg(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": (
                "⭐ <b>Premium tariflar</b>\n\n"
                "Premium olsangiz — barcha maxsus kinolarni ko'ra olasiz.\n\n"
                "Tarifni tanlang:"
            ),
            "parse_mode": "HTML",
            "reply_markup": ik(rows if rows else [[{"text": "Tariflar mavjud emas", "callback_data": "noop"}]]),
        },
    )


async def start_payment(chat_id: int, user_id: str, telegram_id: int, plan_key: str) -> None:
    res = db().table("premium_plans").select("*").eq("key", plan_key).maybeSingle().execute()
    plan = res.data
    if not plan:
        await tg("sendMessage", {"chat_id": chat_id, "text": "Tarif topilmadi."})
        return
    card_number = get_setting("card_number", "8600 0000 0000 0000")
    card_holder = get_setting("card_holder", "ISM FAMILIYA")
    set_session(telegram_id, "awaiting_receipt", {"plan_key": plan_key})
    await tg(
        "sendMessage",
        {
            "chat_id": chat_id,
            "parse_mode": "HTML",
            "text": (
                f"💳 <b>{plan['title']} — {_fmt_uzs(plan['price_uzs'])} so'm</b>\n\n"
                f"Karta raqami: <code>{card_number}</code>\n"
                f"Karta egasi: <b>{card_holder}</b>\n\n"
                "To'lovni amalga oshiring va <b>chekning rasmini</b> shu chatga yuboring.\n"
                "Admin tekshirib, premiumingizni yoqadi."
            ),
            "reply_markup": ik([[{"text": "❌ Bekor qilish", "callback_data": "cancel_payment"}]]),
        },
    )


async def handle_receipt(chat_id: int, telegram_id: int, msg: dict) -> bool:
    sess = get_session(telegram_id)
    if not sess or sess.get("state") != "awaiting_receipt":
        return False
    plan_key = (sess.get("payload") or {}).get("plan_key")
    if not plan_key:
        return False

    photo = msg.get("photo") or []
    file_id = photo[-1]["file_id"] if photo else (msg.get("document", {}) or {}).get("file_id")
    file_type = "photo" if photo else ("document" if msg.get("document") else None)
    if not file_id or not file_type:
        await tg("sendMessage", {"chat_id": chat_id, "text": "Iltimos, chekni rasm yoki hujjat sifatida yuboring."})
        return True

    ures = db().table("users").select("id").eq("telegram_id", telegram_id).single().execute()
    user_id = ures.data["id"]
    pres = (
        db()
        .table("payments")
        .insert(
            {
                "user_id": user_id,
                "plan_key": plan_key,
                "receipt_file_id": file_id,
                "receipt_file_type": file_type,
                "status": "pending",
            }
        )
        .select("id")
        .single()
        .execute()
    )
    pay_id = pres.data["id"]
    clear_session(telegram_id)

    await tg("sendMessage", {"chat_id": chat_id, "text": "✅ Chek qabul qilindi. Admin tekshirgach xabar beramiz."})

    # Forward to admins
    admins = get_admin_ids()
    plan_res = db().table("premium_plans").select("*").eq("key", plan_key).single().execute()
    plan = plan_res.data
    from_user = msg.get("from") or {}
    uname = from_user.get("username")
    caption = (
        "💸 <b>Yangi to'lov</b>\n\n"
        f"Tarif: {plan.get('title')}\n"
        f"Narx: {_fmt_uzs(plan.get('price_uzs', 0))} so'm\n"
        f"Foydalanuvchi: {from_user.get('first_name', '')} {f'(@{uname})' if uname else ''}\n"
        f"Telegram ID: <code>{telegram_id}</code>"
    )
    kb = ik(
        [
            [
                {"text": "✅ Tasdiqlash", "callback_data": f"pay_ok:{pay_id}"},
                {"text": "❌ Bekor qilish", "callback_data": f"pay_no:{pay_id}"},
            ]
        ]
    )
    admin_msg_ids = []
    for admin_id in admins:
        try:
            method = "sendPhoto" if file_type == "photo" else "sendDocument"
            key = "photo" if file_type == "photo" else "document"
            res = await tg(method, {"chat_id": admin_id, key: file_id, "caption": caption, "parse_mode": "HTML", "reply_markup": kb})
            admin_msg_ids.append({"chat_id": admin_id, "message_id": res["message_id"]})
        except Exception as e:
            print(f"send to admin failed: {e}")
    db().table("payments").update({"admin_message_ids": admin_msg_ids}).eq("id", pay_id).execute()
    return True


async def decide_payment(callback: dict, payment_id: str, approve: bool) -> None:
    from .database import is_admin

    admin_tg_id = callback["from"]["id"]
    if not is_admin(admin_tg_id):
        await tg("answerCallbackQuery", {"callback_query_id": callback["id"], "text": "Ruxsat yo'q", "show_alert": True})
        return

    pres = (
        db()
        .table("payments")
        .select("*, users(telegram_id, id), premium_plans(*)")
        .eq("id", payment_id)
        .single()
        .execute()
    )
    pay = pres.data
    if not pay:
        await tg("answerCallbackQuery", {"callback_query_id": callback["id"], "text": "To'lov topilmadi"})
        return
    if pay["status"] != "pending":
        await tg("answerCallbackQuery", {"callback_query_id": callback["id"], "text": f"Allaqachon: {pay['status']}", "show_alert": True})
        return

    if approve:
        plan = pay["premium_plans"]
        expires_at = (datetime.now(timezone.utc) + timedelta(days=plan["duration_days"])).isoformat()
        db().table("premium_subscriptions").insert(
            {"user_id": pay["user_id"], "plan_key": pay["plan_key"], "expires_at": expires_at, "payment_id": pay["id"]}
        ).execute()
        db().table("payments").update(
            {"status": "approved", "decided_by_telegram_id": admin_tg_id, "decided_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", payment_id).execute()
        user_tg_id = pay["users"]["telegram_id"]
        await tg_safe(
            "sendMessage",
            {
                "chat_id": int(user_tg_id),
                "text": f"✅ Premium faollashtirildi!\n\nTarif: <b>{plan['title']}</b>\nAmal qilish muddati: {expires_at[:10]}",
                "parse_mode": "HTML",
            },
        )
    else:
        db().table("payments").update(
            {"status": "rejected", "decided_by_telegram_id": admin_tg_id, "decided_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", payment_id).execute()
        user_tg_id = pay["users"]["telegram_id"]
        await tg_safe("sendMessage", {"chat_id": int(user_tg_id), "text": "❌ Chek qabul qilinmadi. Iltimos, admin bilan bog'laning yoki qayta urinib ko'ring."})

    msg_ids = pay.get("admin_message_ids") or []
    for m in msg_ids:
        await tg_safe(
            "editMessageReplyMarkup",
            {
                "chat_id": m["chat_id"],
                "message_id": m["message_id"],
                "reply_markup": ik([[{"text": "✅ Tasdiqlangan" if approve else "❌ Bekor qilingan", "callback_data": "noop"}]]),
            },
        )
    await tg("answerCallbackQuery", {"callback_query_id": callback["id"], "text": "Tasdiqlandi" if approve else "Bekor qilindi"})
