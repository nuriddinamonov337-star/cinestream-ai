import { tg, getBotToken } from "./api";

// Configure the Telegram webhook to point at the Railway app URL.
// Run once after deploy (e.g. via the /setwebhook admin command or a deploy script).
// Requires WEBHOOK_URL (public base URL, e.g. https://<app>.up.railway.app) and
// TELEGRAM_WEBHOOK_SECRET (shared secret verified on each incoming update).

export function getWebhookUrl(): string {
  const base = process.env.WEBHOOK_URL || process.env.RAILWAY_PUBLIC_URL;
  if (!base) throw new Error("WEBHOOK_URL is not configured");
  const trimmed = base.replace(/\/+$/, "");
  return `${trimmed}/api/public/telegram/webhook`;
}

export function getWebhookSecret(): string {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET is not configured");
  return secret;
}

export async function setupWebhook() {
  const url = getWebhookUrl();
  const secret = getWebhookSecret();
  return tg("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  });
}

export async function getWebhookInfo() {
  return tg("getWebhookInfo", {});
}

export async function deleteWebhook() {
  return tg("deleteWebhook", {});
}
