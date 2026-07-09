
# Telegram Kino Bot

Python `aiogram` o'rniga bot butunlay **Lovable Cloud + Telegram webhook** ustida ishlaydi. Foydalanuvchi Telegramda bot bilan gaplashadi, xabarlar `/api/public/telegram/webhook` ga keladi, TanStack server route uni ishlaydi va Telegram Bot API'ga javob yuboradi. Kino fayllari, foydalanuvchilar, kanallar, premium va to'lovlar Lovable Cloud'da (Postgres + Storage) saqlanadi.

Sizga faqat: (1) BotFather'dan bot yaratib token olish va Telegram connector'ga ulash, (2) admin Telegram ID'ni kiritish, (3) kartani ma'lumotini kiritish kerak.

## Foydalanuvchi oqimi (Telegramda)

**/start**
- Bot foydalanuvchini `users` jadvaliga qo'shadi (yoki mavjudini yangilaydi).
- `channels` jadvalidagi barcha majburiy kanallar ro'yxatini oladi.
- Har biri uchun `getChatMember` chaqirib obuna holatini tekshiradi.
- Agar birortasiga obuna bo'lmagan bo'lsa — obuna havolalari + `✅ Tekshirish` va `⭐ Premium` tugmalari bilan xabar chiqadi. Bot boshqa hech nima qilmaydi.
- Hammasiga obuna bo'lsa — asosiy menyu: `🎬 Kino kodi kiriting`, `⭐ Premium`, `📊 /stats`.

**Kino kodi**
- Foydalanuvchi raqam yuboradi (masalan `245`).
- Bot avval qayta obuna tekshiradi (bekor qilish holatiga qarshi). Obuna yo'q bo'lsa — obuna xabari.
- `movies` jadvalidan kod bo'yicha topadi. Yo'q bo'lsa — "Bunday kod topilmadi" javobi.
- Kino `is_premium=true` bo'lsa va foydalanuvchi premium emas bo'lsa — premium taklifi.
- Aks holda `copyMessage` orqali kinoni (arxiv kanaldan) foydalanuvchiga yuboradi va `views_count` ni oshiradi.

**⭐ Premium**
- Bot 2 ta tarifni ko'rsatadi: 1 hafta — 15 000 so'm, 1 oy — 20 000 so'm.
- Foydalanuvchi tarifni tanlaydi → bot karta raqami + karta egasi ism-familiyasi + "chekni rasm ko'rinishida yuboring" xabarini yuboradi.
- Foydalanuvchi rasm/hujjat sifatida chek yuboradi → bot uni `payments` jadvaliga `pending` holatida yozadi, adminlarga (Telegram ID lar) `✅ Tasdiqlash` / `❌ Bekor qilish` tugmalari bilan yo'naltiradi.
- Admin `✅` bossa — `premium` jadvaliga yozuv qo'shiladi (tugash sanasi = hozir + tarif), foydalanuvchiga "Premium faollashtirildi" xabari boradi. `❌` — foydalanuvchiga "Chek qabul qilinmadi" xabari.

**/stats**
- Foydalanuvchining Telegram ID, premium turi (Yo'q / 1 hafta / 1 oy), tugash sanasi, qolgan kun soni, holati (Faol / Muddati o'tgan) ko'rsatiladi.

## Admin panel

**Ichida (Telegram):**
- `/admin` — faqat `ADMIN_TELEGRAM_IDS` ro'yxatidagilarga ochiladi.
- Inline tugmalar: 🎬 Kino qo'shish • 🗑 Kino o'chirish • 📊 Statistika • 📢 Xabar yuborish • 📺 Majburiy kanal qo'shish • ❌ Majburiy kanal o'chirish.
- **Kino qo'shish**: bot "Kino nomini yuboring" → "Kodni yuboring" → "Kino faylini (video) yuboring" (FSM davlati Cloud'da `admin_sessions` jadvalida). Fayl `file_id` sifatida saqlanadi + arxiv kanalga forward qilinadi, keyin foydalanuvchilarga shu yerdan `copyMessage` qilinadi.
- **Kino o'chirish**: kod so'raladi → tasdiq → o'chiriladi.
- **Statistika**: umumiy foydalanuvchi, bugun qo'shilganlar, jami premium, faol premium, jami kino, top 5 ko'rilgan kino, tushum (tasdiqlangan to'lovlar).
- **Xabar yuborish (broadcast)**: matn (yoki matn + rasm) so'raladi → tasdiq → barcha `users` ga navbat bilan yuboriladi (429 rate-limit'ga qarshi kichik pauza), natijada nechtaga yetkazilgani hisoboti.
- **Majburiy kanal qo'shish**: kanal `@username` yoki `-100...` chat ID so'raladi. Bot avval o'zi kanalda admin ekanligini `getChatAdministrators` orqali tekshiradi, keyin qo'shadi.
- **Majburiy kanal o'chirish**: ro'yxatdan tanlash orqali.

**Web admin (qo'shimcha)** — hamma narsani telefondagi Telegramda qilsa bo'ladi, lekin katta ekranda qulay bo'lishi uchun mini web panel ham beriladi (Lovable auth bilan, faqat siz kirasiz): kino ro'yxati/qidiruv, foydalanuvchilar, to'lovlar tarixi, statistika grafiklari, broadcast. Bot funksiyalari to'liq — web ixtiyoriy.

## Ma'lumotlar bazasi (Lovable Cloud)

- `users` — telegram_id (uniq), username, first_name, joined_at, is_blocked
- `channels` — chat_id, username, title, invite_link, added_at
- `movies` — code (uniq), title, file_id, source_chat_id, source_message_id, is_premium, views_count, added_at
- `premium_plans` — key ('week'/'month'), title, price_uzs, duration_days
- `premium_subscriptions` — user_id, plan_key, started_at, expires_at, source_payment_id
- `payments` — user_id, plan_key, receipt_file_id, status ('pending'/'approved'/'rejected'), created_at, decided_at, decided_by
- `admin_sessions` — user_id, state, payload jsonb (FSM uchun)
- `broadcasts` — text, media_file_id, sent_count, failed_count, created_at
- `settings` — key/value (karta raqami, karta egasi, admin ID lar)

RLS: hamma jadval faqat service_role uchun ochiq (webhook va admin server functions orqali kiriladi), web admin uchun `has_role('admin')` policy.

## Texnik strukturasi

```
src/routes/api/public/telegram/webhook.ts   # Asosiy webhook — barcha update'lar
src/lib/telegram/
  ├── api.ts              # sendMessage, copyMessage, getChatMember (gateway orqali)
  ├── handlers/
  │   ├── start.ts
  │   ├── subscription.ts # kanal tekshiruvi
  │   ├── movies.ts       # kod → kino yuborish
  │   ├── premium.ts      # tariflar, chek qabul qilish
  │   ├── stats.ts
  │   ├── admin.ts        # /admin menyu
  │   ├── admin_movies.ts # FSM: qo'shish/o'chirish
  │   ├── admin_channels.ts
  │   └── broadcast.ts
  ├── fsm.ts              # admin_sessions'dan state olish/yozish
  └── keyboards.ts        # inline tugmalar
src/routes/_authenticated/admin/*.tsx       # ixtiyoriy web admin
```

## Sozlash bosqichlari

1. Lovable Cloud yoqiladi, jadvallar migratsiya.
2. Telegram connector: `standard_connectors--connect` orqali ulanadi (siz BotFather tokenini kiritasiz).
3. Webhook route deploy bo'ladi, keyin sandboxdan `setWebhook` chaqiriladi (secret token bilan).
4. Siz Telegramda `/start` yuborasiz → bot sizning Telegram ID ni beradi → siz uni `settings.admin_ids` ga qo'shasiz (yoki dastlabki migratsiyada berilgan ID yoziladi).
5. `/admin` → majburiy kanallar va kinolar qo'shiladi.

## Nima bu bosqichda YO'Q

- Instagram uchun AI reklama video (avvalgi so'rovingiz) — bu keyingi qadamda alohida modul sifatida qo'shiladi, ho'zir e'tibor faqat botga.
- Avtomatik to'lov (Click/Payme) — hozir faqat qo'lda chek + admin tasdig'i. Keyin qo'shsa bo'ladi.
- Kinoni AI ko'rib qiziq joylarini kesish (imkonsiz).

Tasdiqlasangiz — Cloud'ni yoqib, Telegram connector'ini so'raymiz va qurishni boshlaymiz.
