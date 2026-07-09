import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let _client: ReturnType<typeof createClient<Database>> | null = null;

export function db() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server env not configured");
  _client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

// Settings helpers
export async function getSetting<T = any>(key: string, fallback: T): Promise<T> {
  const { data } = await db().from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: any) {
  await db().from("settings").upsert({ key, value }, { onConflict: "key" });
}

export async function getAdminIds(): Promise<number[]> {
  const ids = await getSetting<number[]>("admin_telegram_ids", []);
  return Array.isArray(ids) ? ids.map(Number) : [];
}

export async function isAdmin(telegramId: number): Promise<boolean> {
  const ids = await getAdminIds();
  if (ids.length === 0) return true; // first user becomes admin implicitly until one is set
  return ids.includes(Number(telegramId));
}

// FSM
export async function getSession(telegramId: number) {
  const { data } = await db().from("admin_sessions").select("*").eq("telegram_id", telegramId).maybeSingle();
  return data;
}
export async function setSession(telegramId: number, state: string, payload: Record<string, any> = {}) {
  await db().from("admin_sessions").upsert(
    { telegram_id: telegramId, state, payload },
    { onConflict: "telegram_id" }
  );
}
export async function clearSession(telegramId: number) {
  await db().from("admin_sessions").delete().eq("telegram_id", telegramId);
}
