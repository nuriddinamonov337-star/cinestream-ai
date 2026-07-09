// Telegram Bot API wrapper via Lovable connector gateway.
// All calls go through https://connector-gateway.lovable.dev/telegram/<method>.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function getKeys() {
  const lovable = process.env.LOVABLE_API_KEY;
  const telegram = process.env.TELEGRAM_API_KEY;
  if (!lovable) throw new Error("LOVABLE_API_KEY is not configured");
  if (!telegram) throw new Error("TELEGRAM_API_KEY is not configured");
  return { lovable, telegram };
}

export async function tg<T = any>(method: string, body?: Record<string, unknown>): Promise<T> {
  const { lovable, telegram } = getKeys();
  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": telegram,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { ok: false, description: text }; }
  if (!res.ok || json?.ok === false) {
    console.error(`[tg] ${method} failed [${res.status}]:`, text);
    throw new Error(`Telegram ${method} failed: ${json?.description ?? res.status}`);
  }
  return json.result as T;
}

// Fire-and-forget helper — swallows errors (e.g. user blocked bot)
export async function tgSafe(method: string, body?: Record<string, unknown>) {
  try { return await tg(method, body); }
  catch (e) { console.warn(`[tgSafe] ${method}:`, (e as Error).message); return null; }
}

export type InlineButton = { text: string; callback_data?: string; url?: string };
export function inlineKeyboard(rows: InlineButton[][]) {
  return { inline_keyboard: rows };
}

export function replyKeyboard(rows: string[][]) {
  return { keyboard: rows.map(r => r.map(text => ({ text }))), resize_keyboard: true };
}

export const removeKeyboard = { remove_keyboard: true };
