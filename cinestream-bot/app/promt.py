"""Bot architecture explanation — port of PROMT_TEXT (admin /promt command)."""
from __future__ import annotations

import re

from .telegram_api import tg

PROMT_TEXT = """🤖 <b>Bot qanday ishlaydi — to'liq tushuntirish</b>

<b>1. Umumiy tuzilma</b>
• Telegram → Webhook (<code>/webhook</code>) → bot mantiqi → Supabase (baza).
• Telegram API chaqiruvlari to'g'ridan-to'g'ri <code>api.telegram.org</code>'ga boradi (<code>BOT_TOKEN</code> env).
• Webhook <code>X-Telegram-Bot-Api-Secret-Token</code> bilan himoyalangan (<code>TELEGRAM_WEBHOOK_SECRET</code>).
• Bot Python (aiogram 3) da yozilgan, Railway'da ishlaydi.

<b>2. Baza jadvallari</b>
• <code>users</code> — foydalanuvchi, premium muddati, bloklangan holati
• <code>channels</code> — majburiy obuna kanallari
• <code>movies</code> — kino nomi, kodi, file_id, premium belgisi, metadata
• <code>payments</code> — chek rasmi, holati (pending/approved/rejected)
• <code>settings</code> — karta ma'lumoti, admin ro'yxati, sozlamalar
• <code>admin_sessions</code> — ko'p bosqichli dialoglar holati (FSM)
• <code>reels_jobs</code> — Reels buyurtmalari (status, source_url, result_url)
• <code>webhook_logs</code> — tashqi webhook loglari

<b>3. Foydalanuvchi oqimi</b>
1) <code>/start</code> → bot foydalanuvchini bazaga yozadi.
2) Majburiy kanallarga obuna tekshiriladi (<code>getChatMember</code>).
3) Obuna bo'lmasa — kanallar ro'yxati + "Tekshirish" tugmasi chiqadi.
4) Obuna bo'lsa — asosiy menyu ochiladi.
5) Foydalanuvchi <b>kino kodini</b> (raqam) yuboradi → bot <code>movies</code> dan topib, <code>file_id</code> orqali videoni yuboradi.
6) Kino premium bo'lsa — faqat premium foydalanuvchiga yuboriladi.

<b>4. Premium</b>
• ⭐ Premium → tarif tanlanadi → karta ma'lumoti chiqadi.
• Foydalanuvchi chek rasmini yuboradi → chek adminga tugmalar bilan boradi.
• Admin ✅ tasdiqlasa — <code>premium_subscriptions</code> ga yozuv qo'shiladi; ❌ rad etsa — foydalanuvchiga xabar boradi.
• <code>/stats</code> — foydalanuvchi o'z premium holati va muddatini ko'radi.

<b>5. Admin panel (<code>/admin</code>)</b>
• 🎬 Kino qo'shish: nomi → kodi → poster → yil → janr → reyting → tavsif → til → video fayl → tasdiqlash
• 🗑 Kino o'chirish (kod bo'yicha)
• 📺 Kanal qo'shish / ❌ Kanal o'chirish
• 📊 Statistika: foydalanuvchi, kino, premium soni
• 📢 Xabar yuborish: hammaga matn/rasm/video
• 💳 Karta ma'lumoti
• 🔗 n8n webhook: yangi kino qo'shilganda tashqi tizimga POST yuboriladi (<code>webhook_logs</code> ga log yoziladi)
• 🎞 Reels service URL: alohida Python mikroservis manzilini sozlash

<b>6. Reels mikroservisi</b>
• Foydalanuvchi <b>🎞 Reels yasash</b> tugmasini bosib manba havolani yuboradi.
• Bot <code>reels_jobs</code> ga yozuv qo'shadi va Python servisga POST qiladi.
• Servis videoni yuklab olib, vertikal reels yasaydi va natijani botga <code>/reels/callback</code> orqali qaytaradi.
• Callback <code>X-Reels-Secret</code> bilan himoyalangan. Natija foydalanuvchiga yuboriladi.

<b>7. Buyruqlar</b>
<code>/start</code> — boshlash
<code>/stats</code> — o'z holatingiz
<code>/myid</code> — Telegram ID
<code>/admin</code> — admin panel (faqat admin)
<code>/promt</code> — shu tushuntirish (faqat admin)

<b>8. Xavfsizlik</b>
• Admin huquqi faqat egasining Telegram ID si orqali beriladi.
• Baza RLS bilan yopiq, server kaliti faqat serverda ishlatiladi."""


async def send_promt(chat_id: int) -> None:
    parts = re.findall(r"[\s\S]{1,3500}", PROMT_TEXT) or [PROMT_TEXT]
    for part in parts:
        await tg(
            "sendMessage",
            {"chat_id": chat_id, "text": part, "parse_mode": "HTML", "disable_web_page_preview": True},
        )
