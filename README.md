# CineStream AI

Kino bot strukturasi

kino_bot/

│

├── bot.py

├── config.py

├── requirements.txt

├── database.py

├── states.py

│

├── handlers/

│   ├── start.py

│   ├── subscription.py      # Majburiy kanallar

│   ├── movies.py            # Kino kodi orqali yuborish

│   ├── premium.py           # Premium sotib olish

│   ├── payment.py           # Chek qabul qilish

│   ├── profile.py           # /stats

│   ├── admin.py             # Admin panel

│   └── broadcast.py         # Xabar yuborish

│

├── services/

│   ├── channel_checker.py

│   ├── premium_service.py

│   ├── movie_service.py

│   ├── instagram_ai.py      # AI reklama yaratish

│   └── payment_service.py

│

├── database/

│   ├── users.db

│   ├── movies.db

│   ├── premium.db

│   ├── channels.db

│   └── payments.db

│

└── media/

    ├── movies/

    └── posters/

Foydalanuvchi oqimi

/start

Majburiy kanallar ro'yxati chiqadi.

Tugmalar:

✅ Tasdiqlash

⭐ Premium

Obuna bo'lmagan bo'lsa, botdan foydalana olmaydi.

Obuna tasdiqlansa, asosiy menyu ochiladi.

Premium

Premium tugmasi bosilganda:

1 hafta — 15 000 so'm

1 oy — 20 000 so'm

Keyin:

Karta raqami

Karta egasining ism-familiyasi

chiqadi.

Foydalanuvchi chek yuboradi.

Admin:

✅ Tasdiqlash

❌ Bekor qilish

tugmalari orqali premiumni yoqadi.

/stats

Ko'rsatadi:

ID

Premium turi

Tugash sanasi

Necha kun qolgani

Foydalanuvchi holati

Admin panel

🎬 Kino qo'shish

🗑 Kino o'chirish

📊 Statistika

📢 Xabar yuborish

📺 Majburiy kanal qo'shish

❌ Majburiy kanal o'chirish

Yana bir muammo men misoli uchun kino qo'shmoqchi bo'lsam uni qoʻshaman birinchi nomini keyin kodini keyin sen menga uni instagramda reklama qilish uchun qisqa video qilib bera olasanmi yoki boshqa ish qilish kerakmi uchun asosan menda kompyuter boʻlmagani uchun va video edit qilishni yaxshi bilmaganim uchun bu muammo boʻlib qolgan menga o'zi kinoni ko'rib qisqa video yasab bera oladigan instagram uchun ai kerak shu yordamni sendan so'rayapman

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a1fd40ce-fe2b-4921-bf8d-60e9080595ef).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
