// Telegram Bot API wrapper — calls https://api.telegram.org/bot<TOKEN>/<method> directly.
// Previously routed through the Lovable connector gateway; that dependency is removed so the
// bot runs standalone on Railway using BOT_TOKEN (TELEGRAM_BOT_TOKEN also accepted).

const API_BASE = "https://api.telegram.org";

export function getBotToken(): string {
  const token =
    process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_KEY;
  if (!token) throw new Error("BOT_TOKEN is not configured");
  return token;
}

export async function tg<T = any>(method: string, body?: Record<string, unknown>): Promise<T> {
  const token = getBotToken();
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, description: text };
  }
  if (!res.ok || json?.ok === false) {
    console.error(`[tg] ${method} failed [${res.status}]:`, text);
    throw new Error(`Telegram ${method} failed: ${json?.description ?? res.status}`);
  }
  return json.result as T;
}

// Multipart upload helper (e.g. sendPhoto/sendVideo with a raw file stream/Buffer).
export async function tgForm<T = any>(method: string, formData: FormData): Promise<T> {
  const token = getBotToken();
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    body: formData,
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, description: text };
  }
  if (!res.ok || json?.ok === false) {
    console.error(`[tgForm] ${method} failed [${res.status}]:`, text);
    throw new Error(`Telegram ${method} failed: ${json?.description ?? res.status}`);
  }
  return json.result as T;
}

// Fire-and-forget helper — swallows errors (e.g. user blocked bot)
export async function tgSafe(method: string, body?: Record<string, unknown>) {
  try {
    return await tg(method, body);
  } catch (e) {
    console.warn(`[tgSafe] ${method}:`, (e as Error).message);
    return null;
  }
}

export type InlineButton = { text: string; callback_data?: string; url?: string };
export function inlineKeyboard(rows: InlineButton[][]) {
  return { inline_keyboard: rows };
}

export function replyKeyboard(rows: string[][]) {
  return { keyboard: rows.map((r) => r.map((text) => ({ text }))), resize_keyboard: true };
}

export const removeKeyboard = { remove_keyboard: true };
