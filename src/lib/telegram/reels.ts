import { db, getSetting, setSetting } from "./db";
import { tg } from "./api";

// Reels generation is delegated to a separate Python microservice (see reels-service/).
// This module: resolves the service URL, creates a reels_jobs row, POSTs the job, and logs.

const SETTING_KEY = "reels_webhook_url";

export async function getReelsWebhookUrl(): Promise<string | null> {
  const fromSettings = await getSetting<string | null>(SETTING_KEY, null);
  if (fromSettings && typeof fromSettings === "string" && fromSettings.startsWith("http")) {
    return fromSettings;
  }
  const fromEnv = process.env.REELS_SERVICE_URL || process.env.N8N_REELS_WEBHOOK_URL;
  return fromEnv && fromEnv.startsWith("http") ? fromEnv : null;
}

export async function setReelsWebhookUrl(url: string) {
  await setSetting(SETTING_KEY, url);
}

// Shared secret the Python service sends back on its callback (X-Reels-Secret).
export function getReelsSecret(): string {
  return process.env.REELS_SECRET || process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
}

async function logReels(entry: {
  event: string;
  target_url: string;
  payload: any;
  status_code?: number | null;
  response_body?: string | null;
  error?: string | null;
  ok: boolean;
}) {
  try {
    await db()
      .from("webhook_logs")
      .insert({
        event: entry.event,
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

// Create a pending job and forward it to the Python reels service.
export async function requestReels({
  chat_id,
  telegram_id,
  url,
}: {
  chat_id: number;
  telegram_id: number;
  url: string;
}) {
  const { data: job } = await db()
    .from("reels_jobs")
    .insert({
      telegram_id,
      chat_id,
      source_url: url,
      status: "pending",
    })
    .select("id")
    .single();

  const serviceUrl = await getReelsWebhookUrl();
  if (!serviceUrl) {
    await db()
      .from("reels_jobs")
      .update({ status: "failed", error: "Reels service URL not configured" })
      .eq("id", job!.id);
    return { ok: false, error: "Reels service URL not configured" };
  }

  const payload = {
    event: "reels.requested",
    job_id: job!.id,
    chat_id,
    telegram_id,
    url,
    secret: getReelsSecret(),
    requested_at: new Date().toISOString(),
  };

  try {
    const res = await fetch(serviceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.text().catch(() => "");
    await logReels({
      event: "reels.requested",
      target_url: serviceUrl,
      payload,
      status_code: res.status,
      response_body: body.slice(0, 2000),
      ok: res.ok,
    });
    if (!res.ok) {
      await db()
        .from("reels_jobs")
        .update({ status: "failed", error: `service ${res.status}` })
        .eq("id", job!.id);
      return { ok: false, error: `service returned ${res.status}` };
    }
    await db().from("reels_jobs").update({ status: "processing" }).eq("id", job!.id);
    return { ok: true, jobId: job!.id };
  } catch (e) {
    const err = (e as Error).message;
    console.error("[reels] request failed", err);
    await logReels({
      event: "reels.requested",
      target_url: serviceUrl,
      payload,
      error: err,
      ok: false,
    });
    await db().from("reels_jobs").update({ status: "failed", error: err }).eq("id", job!.id);
    return { ok: false, error: err };
  }
}

// Called by the reels-callback endpoint when the Python service finishes a job.
export async function completeReelsJob(jobId: string, resultUrl: string, error?: string | null) {
  const { data: job } = await db().from("reels_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, error: "job not found" };
  if (error) {
    await db()
      .from("reels_jobs")
      .update({ status: "failed", error, completed_at: new Date().toISOString() })
      .eq("id", jobId);
    await tg("sendMessage", { chat_id: job.chat_id, text: `❌ Reels yasashda xatolik: ${error}` });
    return { ok: false };
  }
  await db()
    .from("reels_jobs")
    .update({ status: "sent", result_url: resultUrl, completed_at: new Date().toISOString() })
    .eq("id", jobId);
  // Send the finished reel to the user as a document.
  try {
    await tg("sendDocument", {
      chat_id: job.chat_id,
      document: resultUrl,
      caption: "🎞 Tayyor Reel",
    });
  } catch (e) {
    console.error("[reels] sendDocument failed", e);
  }
  return { ok: true };
}

// Resolve a temporary Telegram CDN URL for a file_id (used when the service needs the source video).
export async function resolveTelegramFileUrl(fileId: string): Promise<string | null> {
  try {
    const info: any = await tg("getFile", { file_id: fileId });
    if (info?.file_path) {
      const token =
        process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_KEY;
      if (!token) return null;
      return `https://api.telegram.org/file/bot${token}/${info.file_path}`;
    }
  } catch (e) {
    console.warn("[reels] getFile failed", (e as Error).message);
  }
  return null;
}
