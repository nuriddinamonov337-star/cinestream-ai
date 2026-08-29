# Reels Python microservice (skeleton)

Reels (vertikal qisqa klip) yasovchi mustaqil Python mikroservisi. Node bot
`requestReels()` orqali shu servise POST so'rov yuboradi, servis videoni
yuklab olib/qisqartirib, tayyor bo'lgach botning `/api/public/reels/callback`
endpointiga natijani qaytaradi.

## Arxitektura

```
Bot (Node)  --POST job-->  reels-service (FastAPI)
                              |
                              v
                       download (yt-dlp) -> cut/overlay (ffmpeg) -> upload
                              |
                              v
          <--POST callback--  reels-service  --> /api/public/reels/callback
```

## O'zgaruvchilar (env)

| Env                | Tavsif                                                   |
|--------------------|----------------------------------------------------------|
| `BOT_CALLBACK_URL` | Bot callback URL (`https://<app>/api/public/reels/callback`) |
| `REELS_SECRET`     | Bot bilan bo'lishilgan maxfiy token (X-Reels-Secret)    |
| `PORT`             | FastAPI porti (default 8000)                             |

## Ishga tushirish (lokal)

```bash
cd reels-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

> **Eslatma:** `process_job` hozircha stub (skelet). Real implementatsiya
> yt-dlp + ffmpeg bilan to'ldiriladi. Servis faqat interfeys va flow'ni taqdim etadi.
