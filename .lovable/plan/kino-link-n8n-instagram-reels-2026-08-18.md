# Kino link → n8n → Instagram Reels

Bot foydalanuvchidan UzMovie/Asil Media havolasini oladi, uni n8n ish oqimiga uzatadi, n8n (OpenShorts + Gemini) qisqa Reels tayyorlaydi va tayyor video foydalanuvchiga Telegram orqali qaytadi.

## Muhim bir tuzatish

Sizning rejangizda n8n'da **Telegram Trigger** ishlatilgan. Bu ishlamaydi: bitta bot tokeni uchun Telegram faqat **bitta** webhook manzilini qabul qiladi, hozir u bizning botimizga (`/api/public/telegram/webhook`) ulangan. Agar n8n Telegram Trigger qo'yilsa, mavjud bot (kino kodlari, premium, admin panel) butunlay o'chib qoladi.

Yechim: n8n'da Telegram Trigger o'rniga oddiy **Webhook node** ishlatiladi. Bot linkni o'sha Webhook URL ga o'zi POST qiladi. Qolgan 4 node (HTTP Request → Wait → HTTP Request → Telegram Send Document) o'zgarishsiz qoladi.

## Botdagi oqim

1. Asosiy menyuga **🎞 Reels yasash** tugmasi qo'shiladi.
2. Bosilganda bot: "UzMovie yoki Asil Media havolasini yuboring" deydi (FSM holati `reels:link`).
3. Foydalanuvchi link yuboradi → bot linkni tekshiradi (http/https bo'lishi kerak).
4. Bot n8n Reels webhook URL ga POST yuboradi:

```json
{
  "event": "reels.requested",
  "job_ref": "<uuid>",
  "chat_id": 123456789,
  "telegram_id": 123456789,
  "url": "https://asilmedia.org/...",
  "requested_at": "2026-08-18T08:00:00Z"
}
```

5. Foydalanuvchiga: "⏳ Qabul qilindi. Video tayyor bo'lgach yuboriladi (2–5 daqiqa)."
6. n8n oxirgi node'da tayyor video URL ni to'g'ridan-to'g'ri Telegram Send Document orqali `chat_id` ga yuboradi. (Xohlasangiz n8n callback route'ga POST qilishi ham mumkin — pastda.)

## Cheklovlar (ochiq aytaman)

- Har bir so'rov Render'dagi OpenShorts serveriga bog'liq. Bepul Render 15 daqiqa harakatsizlikdan keyin uxlaydi — birinchi so'rov 1 daqiqagacha kechikadi va Wait vaqti yetmasligi mumkin.
- Telegram bot fayl yuborish limiti 50 MB. Reels kliplari odatda kichik, muammo bo'lmasligi kerak.
- OpenShorts UzMovie/Asil Media linklarini o'zi yuklab ololmasligi mumkin (ular yt-dlp qo'llab-quvvatlamaydigan sayt bo'lsa). Bu n8n/OpenShorts tomonidagi masala — bot faqat linkni uzatadi.
- Mualliflik huquqi: boshqa saytlarning kinolaridan Reels yasab tarqatish bloklanishga olib kelishi mumkin.

## Sozlamalar

Admin panelga (`/admin`) yangi tugma: **🎞 Reels webhook** — n8n Webhook node'ining Production URL ini kiritish/o'chirish. Mavjud `🔗 n8n webhook` (yangi kino qo'shilganda ishlaydigan) alohida qoladi — ikki xil vazifa, ikki xil URL.

Ixtiyoriy fallback env: `N8N_REELS_WEBHOOK_URL`.

## Texnik o'zgarishlar

- `src/lib/telegram/reels.ts` (yangi) — `getReelsWebhookUrl()`, `setReelsWebhookUrl()`, `requestReels({chat_id, url})`; har urinish mavjud `webhook_logs` jadvaliga `event: 'reels.requested'` bilan yoziladi.
- Migratsiya: `reels_jobs` jadvali — `id`, `telegram_id`, `chat_id`, `source_url`, `status` (`pending`/`sent`/`failed`), `result_url`, `error`, `created_at`, `completed_at`. RLS yoqiladi, faqat `service_role` uchun grant.
- `src/lib/telegram/handlers.ts` — menyuga `🎞 Reels yasash` tugmasi, `reels:link` FSM holati, admin menyuga `adm:reels` tugmasi va `reels:url` holati.
- `src/routes/api/public/n8n/reels-callback.ts` (yangi, ixtiyoriy) — n8n tayyor video URL ni shu yerga POST qilsa, bot o'zi foydalanuvchiga yuboradi va `reels_jobs` ni `sent` ga o'tkazadi. Himoya: `X-Reels-Secret` header (`TELEGRAM_API_KEY` dan SHA-256 hosila, `setWebhook` dagi kabi).
- `src/routes/index.tsx` — qo'llanmaga Reels bo'limi qo'shiladi.

## n8n tomonida siz qiladigan ish

1. Telegram Trigger o'rniga **Webhook (POST)** node qo'ying, Production URL ni ko'chiring.
2. HTTP Request (1): `url = {{ $json.url }}`, `acknowledged = true`, header `X-Gemini-Key`.
3. Wait → HTTP Request (2) `/api/status/{{ $json.job_id }}`.
4. Telegram Send Document: `chat_id = {{ $('Webhook').item.json.chat_id }}`, document = `{{ $json.data.clips[0].url }}`.
5. URL ni botda `/admin` → 🎞 Reels webhook ga kiriting.
