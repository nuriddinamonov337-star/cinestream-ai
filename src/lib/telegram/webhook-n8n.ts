import { db, getSetting } from "./db";
import { tg } from "./api";

const SETTING_KEY = "n8n_webhook_url";

export async function getN8nWebhookUrl(): Promise<string | null> {
  const fromSettings = await getSetting<string | null>(SETTING_KEY, null);
  if (fromSettings && typeof fromSettings === "string" && fromSettings.startsWith("http")) {
    return fromSettings;
  }
  const fromEnv = process.env.N8N_WEBHOOK_URL;
  return fromEnv && fromEnv.startsWith("http") ? fromEnv : null;
}

async function log(entry: {
  event: string;
  target_url: string;
  payload: any;
  status_code?: number | null;
  response_body?: string | null;
  error?: string | null;
  ok: boolean;
}) {
  try {
    await db().from("webhook_logs").insert({
      event: entry.event,
      target_url: entry.target_url,
      payload: entry.payload,
      status_code: entry.status_code ?? null,
      response_body: entry.response_body ?? null,
      error: entry.error ?? null,
      ok: entry.ok,
    });
  } catch (e) {
    console.error("[n8n] log insert failed", e);
  }
}

// Best-effort resolve of a temporary Telegram CDN URL for the file.
// Note: Telegram file URLs expire (~1 hour). n8n should re-fetch via getFile when needed.
async function resolveTelegramFileUrl(fileId: string): Promise<string | null> {
  try {
    const token = process.env.TELEGRAM_API_KEY || process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    const info: any = await tg("getFile", { file_id: fileId });
    if (info?.file_path) {
      return `https://api.telegram.org/file/bot${token}/${info.file_path}`;
    }
  } catch (e) {
    console.warn("[n8n] getFile failed", (e as Error).message);
  }
  return null;
}

export async function notifyMovieCreated(movie: {
  id?: string;
  code: string;
  title: string;
  caption?: string | null;
  file_id: string;
  file_type?: string;
  is_premium?: boolean;
  created_at?: string;
}) {
  const url = await getN8nWebhookUrl();
  if (!url) {
    console.log("[n8n] webhook URL not configured, skipping");
    return;
  }

  const fileUrl = await resolveTelegramFileUrl(movie.file_id);
  const payload = {
    event: "movie.created",
    movie: {
      id: movie.id ?? null,
      code: movie.code,
      title: movie.title,
      description: movie.caption ?? null,
      file_id: movie.file_id,
      file_type: movie.file_type ?? "video",
      file_url: fileUrl, // temporary Telegram CDN URL (may expire)
      is_premium: !!movie.is_premium,
      created_at: movie.created_at ?? new Date().toISOString(),
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.text().catch(() => "");
    await log({
      event: "movie.created",
      target_url: url,
      payload,
      status_code: res.status,
      response_body: body.slice(0, 2000),
      ok: res.ok,
    });
    if (!res.ok) console.warn(`[n8n] webhook non-2xx: ${res.status} ${body.slice(0, 200)}`);
  } catch (e) {
    const err = (e as Error).message;
    console.error("[n8n] webhook failed", err);
    await log({ event: "movie.created", target_url: url, payload, error: err, ok: false });
  }
}

export async function setN8nWebhookUrl(url: string) {
  const { setSetting } = await import("./db");
  await setSetting(SETTING_KEY, url);
}
