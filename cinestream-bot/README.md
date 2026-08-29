# CineStream AI — Python Telegram Bot

TypeScript bot (`src/lib/telegram/`) ning Python porti. Bir xil Supabase
sxemasi, bir xil FSM holatlari, bir xil admin oqimlari — Railway'da ishlash
uchun qayta yozilgan.

## Texnologiyalar

- **aiogram 3** — Telegram Bot API (webhook rejimida)
- **FastAPI** — webhook qabul qiluvchi HTTP server
- **Supabase** — baza (service role kaliti bilan)
- **uvicorn** — ASGI server
- **Python 3.12**

## Tuzilma

```
cinestream-bot/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI: /webhook, /reels/callback, /health
│   ├── router.py        # update router (on_message, on_callback, admin FSM)
│   ├── config.py        # env-driven konfiguratsiya
│   ├── database.py      # Supabase client + settings/admin/FSM helperlar
│   ├── telegram_api.py  # api.telegram.org to'g'ridan-to'g'ri wrapper
│   ├── users.py         # upsertUser + majburiy obuna tekshiruv
│   ├── movies.py        # kino kodi qidirish + add-movie tasdiqlash
│   ├── premium.py       # premium tariflar + to'lov + chek oqimi
│   ├── admin.py         # statistika, broadcast, kanal CRUD, karta, DB dump
│   ├── n8n.py           # n8n webhook integratsiyasi
│   ├── reels.py         # reels_jobs + Python servisga POST + callback
│   ├── promt.py         # /promt — bot tuzilishi tushuntirish
│   └── keyboards/
│       ├── __init__.py  # inline/reply keyboard builderlar
│       └── menus.py     # asosiy menyu, admin menyu, obuna keyboard
├── Dockerfile
├── railway.toml
├── requirements.txt
└── .env.example
```

## Buyruqlar

| Buyruq | Kim | Tavsif |
|--------|-----|--------|
| `/start` | hammaga | Foydalanuvchini bazaga yozish + obuna tekshiruv |
| `/stats` | hammaga | Premium holati va muddati |
| `/myid` | hammaga | Telegram ID |
| `/admin` | admin | Admin panel |
| `/promt` | admin | Bot tuzilishi tushuntirish |
| `/database` | admin | Barcha kinolar ro'yxati |
| `/setwebhook` | admin | Webhook sozlash |
| `/webhookinfo` | admin | Webhook holati |

## FSM oqimlari (admin_sessions jadvali)

- **add_movie** — title → code → poster → year → genre → rating → description → language → file → confirm
- **del_movie** — kod kiritish → o'chirish
- **add_channel** — @username / chat_id → bot admin tekshiruv → qo'shish
- **broadcast** — xabar matni/rasm/video → hammaga yuborish
- **card** — karta raqami → egasi → saqlash
- **n8n:url** — webhook URL sozlash
- **reels_url:input** — reels servis URL sozlash
- **reels:link** (foydalanuvchi) — manba havola → reels servisga yuborish
- **awaiting_receipt** (foydalanuvchi) — chek rasmi → adminga forward

## Railway deploy

1. Railway'da yangi service yarating, bu papkani ulang.
2. Variables'ga quyidagilarni qo'shing (`.env.example`'ga qarang):
   - `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `WEBHOOK_URL`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_ID`
   - (ixtiyoriy) `N8N_WEBHOOK_URL`, `REELS_SERVICE_URL`, `REELS_SECRET`
3. Deploy'dan keyin `/health` tekshiring.
4. Bot ichida `/setwebhook` buyrug'i bilan webhook sozlang.

## Reels microservice

Reels generatsiyasi alohida Python servisida ishlaydi (`../reels-service/`).
Admin panelidan "🎞 Reels service URL" orqali servis manzilini sozlang.
Foydalanuvchi "🎞 Reels yasash" tugmasi orqali manba havola yuboradi — bot
`reels_jobs` ga yozuv qo'shib servisga POST qiladi, servis tayyor bo'lgach
`/reels/callback` orqali natijani qaytaradi (X-Reels-Secret bilan himoyalangan).

## TS bot bilan moslik

Bu Python bot TS bot bilan **bir xil** Supabase jadvallari va FSM holatlarini
ishlatadi. Ikkalasi bir-birini almashtira oladi — faqat bittasi webhook sifatida
sozlanishi kerak (token bir xil bo'lsa).
