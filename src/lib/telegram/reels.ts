import { createHash } from "crypto";
import { db, getSetting, setSetting } from "./db";

const SETTING_KEY = "n8n_reels_webhook_url";

export async function getReelsWebhookUrl(): Promise<string | null> {
  const fromSettings = await getSetting<string | null>(SETTING_KEY, null);
  if (fromSettings && typeof fromSettings === "string" && fromSettings.startsWith("http")) {
    return fromSettings;
  }
  const fromEnv = process.env.N8N_REELS_WEBHOOK_URL;
  return fromEnv && fromEnv.startsWith("http") ? fromEnv : null;
}

export async function setReelsWebhookUrl(url: string) {
  await setSetting(SETTING_KEY, url);
}

export function reelsSecret(): string {
  const key = process.env.TELEGRAM_API_KEY || "";
  return createHash("sha256").update(`reels-callback:${key}`).digest("base64url");
}

async function log(entry: {
  target_url: string;
  payload: any;
  status_code?: number | null;
  response_body?: string | null;
  error?: string | null;
  ok: boolean;
}) {
  try {
    await db().from("webhook_logs").insert({
      event: "reels.requested",
      target_url: entry.target_url,
      payload: entry.payload,
      status_code: entry.status_code ?? null,
      response_body: entry.response_body ?? null,
      error: entry.error ?? null,
      ok: entry.ok,
    });
  } catch (e) {
    console.error("[reels] log insert failed", e);
  }
}

export type ReelsRequestResult =
  | { ok: true; jobId: string }
  | { ok: false; reason: "no_url" | "failed"; message?: string };

export async function requestReels(params: {
  telegramId: number;
  chatId: number;
  url: string;
}): Promise<ReelsRequestResult> {
  const webhook = await getReelsWebhookUrl();
  if (!webhook) return { ok: false, reason: "no_url" };

  const { data: job } = await db()
    .from("reels_jobs")
    .insert({
      telegram_id: params.telegramId,
      chat_id: params.chatId,
      source_url: params.url,
      status: "pending",
    })
    .select("id, created_at")
    .single();

  const payload = {
    event: "reels.requested",
    job_ref: job?.id ?? null,
    chat_id: params.chatId,
    telegram_id: params.telegramId,
    url: params.url,
    callback_secret: reelsSecret(),
    requested_at: job?.created_at ?? new Date().toISOString(),
  };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.text().catch(() => "");
    await log({
      target_url: webhook,
      payload,
      status_code: res.status,
      response_body: body.slice(0, 2000),
      ok: res.ok,
    });
    if (!res.ok) {
      if (job?.id) {
        await db()
          .from("reels_jobs")
          .update({ status: "failed", error: `n8n ${res.status}`, completed_at: new Date().toISOString() })
          .eq("id", job.id);
      }
      return { ok: false, reason: "failed", message: `n8n javobi: ${res.status}` };
    }
    return { ok: true, jobId: job?.id ?? "" };
  } catch (e) {
    const err = (e as Error).message;
    console.error("[reels] webhook failed", err);
    await log({ target_url: webhook, payload, error: err, ok: false });
    if (job?.id) {
      await db()
        .from("reels_jobs")
        .update({ status: "failed", error: err, completed_at: new Date().toISOString() })
        .eq("id", job.id);
    }
    return { ok: false, reason: "failed", message: err };
  }
}
