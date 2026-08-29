import { tg, tgSafe, inlineKeyboard, removeKeyboard } from "./api";
import { db, getSetting, setSetting, getAdminIds, isAdmin, getSession, setSession, clearSession } from "./db";
import { notifyMovieCreated, setN8nWebhookUrl, getN8nWebhookUrl } from "./webhook-n8n";


type TgUser = { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string };
type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  photo?: { file_id: string }[];
  video?: { file_id: string };
  document?: { file_id: string };
  reply_to_message?: TgMessage;
};
type TgCallback = { id: string; from: TgUser; message?: TgMessage; data?: string };
type TgUpdate = { update_id: number; message?: TgMessage; edited_message?: TgMessage; callback_query?: TgCallback };

// ---------- USER upsert ----------
async function upsertUser(u: TgUser) {
  const { data } = await db()
    .from("users")
    .upsert(
      {
        telegram_id: u.id,
        username: u.username ?? null,
        first_name: u.first_name ?? null,
        last_name: u.last_name ?? null,
        language_code: u.language_code ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "telegram_id" }
    )
    .select("*")
    .single();
  return data!;
}

// ---------- Subscription check ----------
async function getRequiredChannels() {
  const { data } = await db().from("channels").select("*").eq("is_active", true).order("created_at");
  return data ?? [];
}

async function checkSubscriptions(telegramUserId: number) {
  const channels = await getRequiredChannels();
  const missing: typeof channels = [];
  for (const ch of channels) {
    try {
      const res: any = await tg("getChatMember", { chat_id: Number(ch.chat_id), user_id: telegramUserId });
      const status = res?.status;
      if (!["member", "administrator", "creator"].includes(status)) missing.push(ch);
    } catch (e) {
      // If bot can't see the chat, treat as missing so user is notified
      console.warn(`[checkSubscriptions] ${ch.chat_id}:`, (e as Error).message);
      missing.push(ch);
    }
  }
  return { channels, missing };
}

function subscribeMessage(missing: any[]) {
  const rows: import("./api").InlineButton[][] = [];
  for (const ch of missing) {
    const link = ch.invite_link || (ch.username ? `https://t.me/${String(ch.username).replace("@", "")}` : null);
    if (link) rows.push([{ text: `📢 ${ch.title}`, url: link }]);
  }
  rows.push([{ text: "✅ Tekshirish", callback_data: "check_subs" }]);
  rows.push([{ text: "⭐ Premium sotib olish", callback_data: "premium_menu" }]);
  return {
    text: "🎬 Botdan foydalanish uchun quyidagi kanallarga obuna bo'ling:\n\nObuna bo'lgach ✅ Tekshirish tugmasini bosing.",
    reply_markup: inlineKeyboard(rows),
  };
}

async function sendMainMenu(chatId: number, isAdminUser: boolean) {
  const keyboard: any[][] = [
    [{ text: "🎬 Kino kodini kiriting", callback_data: "how_to" }],
    [{ text: "⭐ Premium", callback_data: "premium_menu" }, { text: "📊 Mening statusim", callback_data: "my_stats" }],
  ];
  if (isAdminUser) keyboard.push([{ text: "🛠 Admin panel", callback_data: "admin_menu" }]);
  await tg("sendMessage", {
    chat_id: chatId,
    text: "🎬 <b>Kinolar boti</b>\n\nKino kodini yuboring va uni siz uchun yuboraman.",
    parse_mode: "HTML",
    reply_markup: inlineKeyboard(keyboard),
  });
}

// ---------- Premium ----------
async function isUserPremium(userId: string) {
  const { data } = await db()
    .from("premium_subscriptions")
    .select("expires_at")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { active: !!data, expiresAt: data?.expires_at ?? null };
}

async function sendPremiumMenu(chatId: number) {
  const { data: plans } = await db().from("premium_plans").select("*").eq("is_active", true).order("sort_order");
  const rows = (plans ?? []).map((p) => [
    { text: `${p.title} — ${Number(p.price_uzs).toLocaleString("uz-UZ")} so'm`, callback_data: `buy:${p.key}` },
  ]);
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      "⭐ <b>Premium tariflar</b>\n\n" +
      "Premium olsangiz — barcha maxsus kinolarni ko'ra olasiz.\n\n" +
      "Tarifni tanlang:",
    parse_mode: "HTML",
    reply_markup: inlineKeyboard(rows.length ? rows : [[{ text: "Tariflar mavjud emas", callback_data: "noop" }]]),
  });
}

async function startPayment(chatId: number, userId: string, telegramId: number, planKey: string) {
  const { data: plan } = await db().from("premium_plans").select("*").eq("key", planKey).maybeSingle();
  if (!plan) return tg("sendMessage", { chat_id: chatId, text: "Tarif topilmadi." });
  const cardNumber = await getSetting<string>("card_number", "8600 0000 0000 0000");
  const cardHolder = await getSetting<string>("card_holder", "ISM FAMILIYA");
  await setSession(telegramId, "awaiting_receipt", { plan_key: planKey });
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      `💳 <b>${plan.title} — ${Number(plan.price_uzs).toLocaleString("uz-UZ")} so'm</b>\n\n` +
      `Karta raqami: <code>${cardNumber}</code>\n` +
      `Karta egasi: <b>${cardHolder}</b>\n\n` +
      `To'lovni amalga oshiring va <b>chekning rasmini</b> shu chatga yuboring.\n` +
      `Admin tekshirib, premiumingizni yoqadi.`,
    parse_mode: "HTML",
    reply_markup: inlineKeyboard([[{ text: "❌ Bekor qilish", callback_data: "cancel_payment" }]]),
  });
}

async function handleReceipt(chatId: number, telegramId: number, msg: TgMessage) {
  const sess = await getSession(telegramId);
  if (!sess || sess.state !== "awaiting_receipt") return false;
  const planKey = (sess.payload as any)?.plan_key;
  if (!planKey) return false;
  const fileId = msg.photo?.[msg.photo.length - 1]?.file_id || msg.document?.file_id;
  const fileType = msg.photo ? "photo" : msg.document ? "document" : null;
  if (!fileId || !fileType) {
    await tg("sendMessage", { chat_id: chatId, text: "Iltimos, chekni rasm yoki hujjat sifatida yuboring." });
    return true;
  }
  const { data: user } = await db().from("users").select("id").eq("telegram_id", telegramId).single();
  const { data: pay } = await db()
    .from("payments")
    .insert({
      user_id: user!.id,
      plan_key: planKey,
      receipt_file_id: fileId,
      receipt_file_type: fileType,
      status: "pending",
    })
    .select("id")
    .single();
  await clearSession(telegramId);

  await tg("sendMessage", {
    chat_id: chatId,
    text: "✅ Chek qabul qilindi. Admin tekshirgach xabar beramiz.",
  });

  // Forward to admins
  const admins = await getAdminIds();
  const { data: plan } = await db().from("premium_plans").select("*").eq("key", planKey).single();
  const adminMsgIds: Array<{ chat_id: number; message_id: number }> = [];
  const caption =
    `💸 <b>Yangi to'lov</b>\n\n` +
    `Tarif: ${plan?.title}\n` +
    `Narx: ${Number(plan?.price_uzs).toLocaleString("uz-UZ")} so'm\n` +
    `Foydalanuvchi: ${msg.from?.first_name ?? ""} ${msg.from?.username ? `(@${msg.from.username})` : ""}\n` +
    `Telegram ID: <code>${telegramId}</code>`;
  const kb = inlineKeyboard([
    [
      { text: "✅ Tasdiqlash", callback_data: `pay_ok:${pay!.id}` },
      { text: "❌ Bekor qilish", callback_data: `pay_no:${pay!.id}` },
    ],
  ]);
  for (const adminId of admins) {
    try {
      const method = fileType === "photo" ? "sendPhoto" : "sendDocument";
      const body: any = {
        chat_id: adminId,
        [fileType === "photo" ? "photo" : "document"]: fileId,
        caption,
        parse_mode: "HTML",
        reply_markup: kb,
      };
      const res: any = await tg(method, body);
      adminMsgIds.push({ chat_id: adminId, message_id: res.message_id });
    } catch (e) { console.warn("send to admin failed", e); }
  }
  await db().from("payments").update({ admin_message_ids: adminMsgIds }).eq("id", pay!.id);
  return true;
}

async function decidePayment(callback: TgCallback, paymentId: string, approve: boolean) {
  const adminTgId = callback.from.id;
  if (!(await isAdmin(adminTgId))) {
    return tg("answerCallbackQuery", { callback_query_id: callback.id, text: "Ruxsat yo'q", show_alert: true });
  }
  const { data: pay } = await db().from("payments").select("*, users(telegram_id, id), premium_plans(*)").eq("id", paymentId).single();
  if (!pay) return tg("answerCallbackQuery", { callback_query_id: callback.id, text: "To'lov topilmadi" });
  if (pay.status !== "pending") {
    return tg("answerCallbackQuery", { callback_query_id: callback.id, text: `Allaqachon: ${pay.status}`, show_alert: true });
  }

  if (approve) {
    const plan: any = pay.premium_plans;
    const expiresAt = new Date(Date.now() + plan.duration_days * 24 * 3600 * 1000).toISOString();
    await db().from("premium_subscriptions").insert({
      user_id: pay.user_id,
      plan_key: pay.plan_key,
      expires_at: expiresAt,
      payment_id: pay.id,
    });
    await db().from("payments").update({
      status: "approved",
      decided_by_telegram_id: adminTgId,
      decided_at: new Date().toISOString(),
    }).eq("id", paymentId);
    const userTgId = (pay.users as any).telegram_id;
    await tgSafe("sendMessage", {
      chat_id: Number(userTgId),
      text: `✅ Premium faollashtirildi!\n\nTarif: <b>${plan.title}</b>\nAmal qilish muddati: ${new Date(expiresAt).toLocaleDateString("uz-UZ")}`,
      parse_mode: "HTML",
    });
  } else {
    await db().from("payments").update({
      status: "rejected",
      decided_by_telegram_id: adminTgId,
      decided_at: new Date().toISOString(),
    }).eq("id", paymentId);
    const userTgId = (pay.users as any).telegram_id;
    await tgSafe("sendMessage", {
      chat_id: Number(userTgId),
      text: "❌ Chek qabul qilinmadi. Iltimos, admin bilan bog'laning yoki qayta urinib ko'ring.",
    });
  }

  // Update the admin messages
  const msgIds = (pay.admin_message_ids as any[]) ?? [];
  for (const m of msgIds) {
    await tgSafe("editMessageReplyMarkup", {
      chat_id: m.chat_id,
      message_id: m.message_id,
      reply_markup: inlineKeyboard([[{ text: approve ? "✅ Tasdiqlangan" : "❌ Bekor qilingan", callback_data: "noop" }]]),
    });
  }
  await tg("answerCallbackQuery", { callback_query_id: callback.id, text: approve ? "Tasdiqlandi" : "Bekor qilindi" });
}

// ---------- Movie code ----------
async function handleMovieCode(chatId: number, telegramId: number, userId: string, code: string) {
  const { data: movie } = await db().from("movies").select("*").eq("code", code).maybeSingle();
  if (!movie) {
    await tg("sendMessage", { chat_id: chatId, text: `❓ <b>${code}</b> kodi bo'yicha kino topilmadi.`, parse_mode: "HTML" });
    return;
  }
  if (movie.is_premium) {
    const { active } = await isUserPremium(userId);
    if (!active) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⭐ <b>${movie.title}</b> — bu premium kino.\n\nKo'rish uchun premium sotib oling.`,
        parse_mode: "HTML",
        reply_markup: inlineKeyboard([[{ text: "⭐ Premium olish", callback_data: "premium_menu" }]]),
      });
      return;
    }
  }
  const bu = (await botUsername()) || "kino";
  const caption = `🎬 <b>${movie.title}</b>\n\n📺 @${bu}`;
  try {
    // Primary: send by file_id (most reliable — works for any file uploaded to the bot)
    const method = movie.file_type === "document" ? "sendDocument" : "sendVideo";
    const key = movie.file_type === "document" ? "document" : "video";
    await tg(method, {
      chat_id: chatId,
      [key]: movie.file_id,
      caption,
      parse_mode: "HTML",
    });
    await db().from("movies").update({ views_count: (movie.views_count ?? 0) + 1 }).eq("id", movie.id);
  } catch (e) {
    console.error("sendVideo by file_id failed, trying copyMessage:", e);
    // Fallback: copyMessage from source chat
    try {
      if (movie.source_chat_id && movie.source_message_id) {
        await tg("copyMessage", {
          chat_id: chatId,
          from_chat_id: Number(movie.source_chat_id),
          message_id: Number(movie.source_message_id),
          caption,
          parse_mode: "HTML",
        });
        await db().from("movies").update({ views_count: (movie.views_count ?? 0) + 1 }).eq("id", movie.id);
      } else {
        throw e;
      }
    } catch (e2) {
      console.error("copyMessage also failed:", e2);
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Kinoni yuborishda xatolik: ${(e2 as Error).message}\n\nAdmin bilan bog'laning.`,
      });
    }
  }
}

let _botUsername: string | null = null;
async function botUsername(): Promise<string | null> {
  if (_botUsername) return _botUsername;
  try {
    const me: any = await tg("getMe");
    _botUsername = me?.username ?? null;
    return _botUsername;
  } catch { return null; }
}

// ---------- /stats ----------
async function sendStats(chatId: number, telegramId: number, userId: string) {
  const { data: sub } = await db()
    .from("premium_subscriptions")
    .select("*, premium_plans(title)")
    .eq("user_id", userId)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let premiumText = "❌ Yo'q";
  let statusText = "Oddiy foydalanuvchi";
  if (sub) {
    const exp = new Date(sub.expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
    if (daysLeft > 0) {
      premiumText = `⭐ ${(sub.premium_plans as any)?.title}`;
      statusText = `✅ Faol (${daysLeft} kun qoldi, ${exp.toLocaleDateString("uz-UZ")} gacha)`;
    } else {
      premiumText = `⌛ ${(sub.premium_plans as any)?.title} (muddati o'tgan)`;
      statusText = "❌ Muddati tugagan";
    }
  }
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      `📊 <b>Sizning statusingiz</b>\n\n` +
      `🆔 Telegram ID: <code>${telegramId}</code>\n` +
      `⭐ Premium turi: ${premiumText}\n` +
      `📌 Holat: ${statusText}`,
    parse_mode: "HTML",
  });
}

// ---------- ADMIN PANEL ----------
async function sendAdminMenu(chatId: number) {
  await tg("sendMessage", {
    chat_id: chatId,
    text: "🛠 <b>Admin panel</b>",
    parse_mode: "HTML",
    reply_markup: inlineKeyboard([
      [{ text: "🎬 Kino qo'shish", callback_data: "adm:add_movie" }, { text: "🗑 Kino o'chirish", callback_data: "adm:del_movie" }],
      [{ text: "📺 Kanal qo'shish", callback_data: "adm:add_channel" }, { text: "❌ Kanal o'chirish", callback_data: "adm:del_channel" }],
      [{ text: "📊 Statistika", callback_data: "adm:stats" }, { text: "📢 Xabar yuborish", callback_data: "adm:broadcast" }],
      [{ text: "💳 Karta ma'lumoti", callback_data: "adm:card" }, { text: "🔗 n8n webhook", callback_data: "adm:n8n" }],
    ]),
  });
}

async function adminStats(chatId: number) {
  const [{ count: usersCount }, { count: moviesCount }, { count: channelsCount }, { count: pendingPay }, { count: activePremium }] = await Promise.all([
    db().from("users").select("*", { count: "exact", head: true }),
    db().from("movies").select("*", { count: "exact", head: true }),
    db().from("channels").select("*", { count: "exact", head: true }).eq("is_active", true),
    db().from("payments").select("*", { count: "exact", head: true }).eq("status", "pending"),
    db().from("premium_subscriptions").select("*", { count: "exact", head: true }).gt("expires_at", new Date().toISOString()),
  ]);
  const { data: topMovies } = await db().from("movies").select("code, title, views_count").order("views_count", { ascending: false }).limit(5);
  const top = (topMovies ?? []).map((m, i) => `${i + 1}. <b>${m.code}</b> — ${m.title} (${m.views_count} marta)`).join("\n") || "—";
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      `📊 <b>Statistika</b>\n\n` +
      `👥 Foydalanuvchilar: <b>${usersCount ?? 0}</b>\n` +
      `🎬 Kinolar: <b>${moviesCount ?? 0}</b>\n` +
      `📺 Faol kanallar: <b>${channelsCount ?? 0}</b>\n` +
      `⭐ Faol premium: <b>${activePremium ?? 0}</b>\n` +
      `⏳ Kutilayotgan to'lovlar: <b>${pendingPay ?? 0}</b>\n\n` +
      `🔥 <b>Top 5 kino:</b>\n${top}`,
    parse_mode: "HTML",
  });
}

async function startAddMovie(chatId: number, telegramId: number) {
  await setSession(telegramId, "add_movie:title", {});
  await tg("sendMessage", {
    chat_id: chatId,
    text: "🎬 <b>Yangi kino</b>\n\n1/3. Kino <b>nomini</b> yuboring:",
    parse_mode: "HTML",
    reply_markup: inlineKeyboard([[{ text: "❌ Bekor qilish", callback_data: "adm:cancel" }]]),
  });
}

async function startDelMovie(chatId: number, telegramId: number) {
  await setSession(telegramId, "del_movie:code", {});
  await tg("sendMessage", {
    chat_id: chatId,
    text: "🗑 O'chiriladigan kino <b>kodini</b> yuboring:",
    parse_mode: "HTML",
    reply_markup: inlineKeyboard([[{ text: "❌ Bekor qilish", callback_data: "adm:cancel" }]]),
  });
}

async function startAddChannel(chatId: number, telegramId: number) {
  await setSession(telegramId, "add_channel:input", {});
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      "📺 <b>Yangi majburiy kanal</b>\n\n" +
      "Kanal @username ni yoki chat_id (-100...) ni yuboring.\n\n" +
      "⚠️ Bot kanalda admin bo'lishi shart, aks holda obunani tekshira olmaydi.",
    parse_mode: "HTML",
    reply_markup: inlineKeyboard([[{ text: "❌ Bekor qilish", callback_data: "adm:cancel" }]]),
  });
}

async function listChannelsForDelete(chatId: number) {
  const { data: chans } = await db().from("channels").select("*").eq("is_active", true).order("created_at");
  if (!chans || chans.length === 0) {
    return tg("sendMessage", { chat_id: chatId, text: "Faol kanallar yo'q." });
  }
  const rows = chans.map((c) => [{ text: `❌ ${c.title}`, callback_data: `adm:delch:${c.id}` }]);
  await tg("sendMessage", {
    chat_id: chatId,
    text: "O'chiriladigan kanalni tanlang:",
    reply_markup: inlineKeyboard(rows),
  });
}

async function startBroadcast(chatId: number, telegramId: number) {
  await setSession(telegramId, "broadcast:input", {});
  await tg("sendMessage", {
    chat_id: chatId,
    text: "📢 Yubormoqchi bo'lgan <b>xabaringizni yuboring</b> (matn, rasm yoki video).",
    parse_mode: "HTML",
    reply_markup: inlineKeyboard([[{ text: "❌ Bekor qilish", callback_data: "adm:cancel" }]]),
  });
}

async function startCardEdit(chatId: number, telegramId: number) {
  const num = await getSetting<string>("card_number", "");
  const holder = await getSetting<string>("card_holder", "");
  await setSession(telegramId, "card:number", { current_number: num, current_holder: holder });
  await tg("sendMessage", {
    chat_id: chatId,
    text: `💳 Hozirgi karta: <code>${num}</code>\nEgasi: <b>${holder}</b>\n\nYangi karta raqamini yuboring:`,
    parse_mode: "HTML",
    reply_markup: inlineKeyboard([[{ text: "❌ Bekor qilish", callback_data: "adm:cancel" }]]),
  });
}

async function startN8nEdit(chatId: number, telegramId: number) {
  const current = (await getN8nWebhookUrl()) || "—";
  await setSession(telegramId, "n8n:url", {});
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      `🔗 <b>n8n webhook</b>\n\nHozirgi URL: <code>${current}</code>\n\n` +
      `Yangi n8n webhook URL manzilini yuboring (https:// bilan boshlansin).\n` +
      `O'chirish uchun <code>-</code> yuboring.`,
    parse_mode: "HTML",
    reply_markup: inlineKeyboard([[{ text: "❌ Bekor qilish", callback_data: "adm:cancel" }]]),
  });
}

async function runBroadcast(fromTgId: number, msg: TgMessage) {
  const { data: users } = await db().from("users").select("telegram_id").eq("is_blocked", false);
  const total = users?.length ?? 0;
  await tg("sendMessage", { chat_id: fromTgId, text: `📤 Yuborish boshlandi... (${total} ta foydalanuvchi)` });

  let sent = 0, failed = 0;
  const text = msg.text || msg.caption || "";
  const photo = msg.photo?.[msg.photo.length - 1]?.file_id;
  const video = msg.video?.file_id;

  for (const u of users ?? []) {
    try {
      if (photo) {
        await tg("sendPhoto", { chat_id: Number(u.telegram_id), photo, caption: text, parse_mode: "HTML" });
      } else if (video) {
        await tg("sendVideo", { chat_id: Number(u.telegram_id), video, caption: text, parse_mode: "HTML" });
      } else if (text) {
        await tg("sendMessage", { chat_id: Number(u.telegram_id), text, parse_mode: "HTML" });
      }
      sent++;
    } catch (e) {
      failed++;
      const errMsg = (e as Error).message;
      if (errMsg.includes("blocked") || errMsg.includes("deactivated")) {
        await db().from("users").update({ is_blocked: true }).eq("telegram_id", u.telegram_id);
      }
    }
    // small pause every 25 to respect rate limits
    if ((sent + failed) % 25 === 0) await new Promise((r) => setTimeout(r, 1000));
  }
  await db().from("broadcasts").insert({
    text, media_file_id: photo || video || null, media_file_type: photo ? "photo" : video ? "video" : null,
    sent_count: sent, failed_count: failed, created_by_telegram_id: fromTgId,
  });
  await tg("sendMessage", { chat_id: fromTgId, text: `✅ Yuborish tugadi.\n\n📬 Yetkazildi: <b>${sent}</b>\n❌ Xato: <b>${failed}</b>`, parse_mode: "HTML" });
}

// ---------- MAIN UPDATE ROUTER ----------
export async function handleUpdate(update: TgUpdate) {
  try {
    if (update.message) await onMessage(update.message);
    else if (update.callback_query) await onCallback(update.callback_query);
  } catch (e) {
    console.error("[handleUpdate] error:", e);
  }
}

async function onMessage(msg: TgMessage) {
  if (!msg.from || msg.chat.type !== "private") return;
  const tgUser = msg.from;
  const user = await upsertUser(tgUser);
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const isAdminUser = await isAdmin(tgUser.id);

  // Admin FSM handling first
  const sess = await getSession(tgUser.id);
  if (sess && isAdminUser) {
    if (await handleAdminFSM(chatId, tgUser.id, msg, sess)) return;
  }

  // Awaiting receipt (any user)
  if (sess?.state === "awaiting_receipt") {
    if (await handleReceipt(chatId, tgUser.id, msg)) return;
  }

  // Commands
  if (text === "/start") {
    await clearSession(tgUser.id);
    await sendStartFlow(chatId, tgUser.id, user.id, isAdminUser);
    return;
  }
  if (text === "/stats") {
    await sendStats(chatId, tgUser.id, user.id);
    return;
  }
  if (text === "/admin") {
    if (!isAdminUser) {
      await tg("sendMessage", { chat_id: chatId, text: "⛔ Sizda admin huquqi yo'q." });
      return;
    }
    await sendAdminMenu(chatId);
    return;
  }
  if (text === "/promt") {
    if (!isAdminUser) {
      await tg("sendMessage", { chat_id: chatId, text: "\u26d4 Bu buyruq faqat admin uchun." });
      return;
    }
    await sendPromt(chatId);
    return;
  }
  if (text === "/database" || text === "/db") {
    if (!isAdminUser) {
      await tg("sendMessage", { chat_id: chatId, text: "\u26d4 Bu buyruq faqat admin uchun." });
      return;
    }
    await sendDatabaseDump(chatId);
    return;
  }
  if (text === "/myid") {
    await tg("sendMessage", { chat_id: chatId, text: `Sizning Telegram ID: <code>${tgUser.id}</code>`, parse_mode: "HTML" });
    return;
  }

  // Subscription enforcement
  const { missing } = await checkSubscriptions(tgUser.id);
  if (missing.length > 0) {
    const m = subscribeMessage(missing);
    await tg("sendMessage", { chat_id: chatId, ...m });
    return;
  }

  // Numeric input -> movie code
  if (/^\d{1,10}$/.test(text)) {
    await handleMovieCode(chatId, tgUser.id, user.id, text);
    return;
  }

  // Fallback
  await sendMainMenu(chatId, isAdminUser);
}

async function sendStartFlow(chatId: number, telegramId: number, userId: string, isAdminUser: boolean) {
  const { missing } = await checkSubscriptions(telegramId);
  if (missing.length > 0) {
    const m = subscribeMessage(missing);
    await tg("sendMessage", { chat_id: chatId, ...m });
    return;
  }
  const welcome = await getSetting<string>("welcome_text", "Xush kelibsiz!");
  await tg("sendMessage", { chat_id: chatId, text: `👋 ${welcome}`, parse_mode: "HTML" });
  await sendMainMenu(chatId, isAdminUser);
}

async function onCallback(cb: TgCallback) {
  const chatId = cb.message?.chat.id;
  const telegramId = cb.from.id;
  const data = cb.data || "";
  if (!chatId) return;
  const user = await upsertUser(cb.from);
  const isAdminUser = await isAdmin(telegramId);

  await tg("answerCallbackQuery", { callback_query_id: cb.id }).catch(() => {});

  if (data === "check_subs") {
    const { missing } = await checkSubscriptions(telegramId);
    if (missing.length > 0) {
      await tg("sendMessage", { chat_id: chatId, text: "❌ Hali ham hamma kanallarga obuna bo'lmagansiz." });
    } else {
      await tg("sendMessage", { chat_id: chatId, text: "✅ Obuna tasdiqlandi!" });
      await sendMainMenu(chatId, isAdminUser);
    }
    return;
  }
  if (data === "premium_menu") return sendPremiumMenu(chatId);
  if (data === "my_stats") return sendStats(chatId, telegramId, user.id);
  if (data === "how_to") {
    return tg("sendMessage", { chat_id: chatId, text: "Kino kodini raqam sifatida yuboring (masalan: <code>245</code>).", parse_mode: "HTML" });
  }
  if (data === "cancel_payment") {
    await clearSession(telegramId);
    return tg("sendMessage", { chat_id: chatId, text: "To'lov bekor qilindi." });
  }
  if (data.startsWith("buy:")) {
    return startPayment(chatId, user.id, telegramId, data.slice(4));
  }
  if (data.startsWith("pay_ok:")) return decidePayment(cb, data.slice(7), true);
  if (data.startsWith("pay_no:")) return decidePayment(cb, data.slice(7), false);

  // Admin
  if (!isAdminUser) return;
  if (data === "admin_menu") return sendAdminMenu(chatId);
  if (data === "adm:cancel") {
    await clearSession(telegramId);
    return tg("sendMessage", { chat_id: chatId, text: "Bekor qilindi." });
  }
  if (data === "adm:stats") return adminStats(chatId);
  if (data === "adm:add_movie") return startAddMovie(chatId, telegramId);
  if (data === "adm:del_movie") return startDelMovie(chatId, telegramId);
  if (data === "adm:add_channel") return startAddChannel(chatId, telegramId);
  if (data === "adm:del_channel") return listChannelsForDelete(chatId);
  if (data === "adm:broadcast") return startBroadcast(chatId, telegramId);
  if (data === "adm:card") return startCardEdit(chatId, telegramId);
  if (data === "adm:n8n") return startN8nEdit(chatId, telegramId);
  if (data.startsWith("adm:delch:")) {
    const id = data.slice("adm:delch:".length);
    await db().from("channels").update({ is_active: false }).eq("id", id);
    return tg("sendMessage", { chat_id: chatId, text: "✅ Kanal ro'yxatdan olib tashlandi." });
  }
}

async function handleAdminFSM(chatId: number, telegramId: number, msg: TgMessage, sess: any): Promise<boolean> {
  const text = (msg.text || "").trim();
  const state = sess.state as string;
  const payload = (sess.payload || {}) as any;

  if (state === "add_movie:title") {
    if (!text) { await tg("sendMessage", { chat_id: chatId, text: "Nom bo'sh bo'lmasin. Kino nomini yuboring." }); return true; }
    await setSession(telegramId, "add_movie:code", { title: text });
    await tg("sendMessage", { chat_id: chatId, text: `✔ Nom: <b>${text}</b>\n\n2/3. Endi kino <b>kodini</b> yuboring (masalan 245):`, parse_mode: "HTML" });
    return true;
  }
  if (state === "add_movie:code") {
    if (!/^\d{1,10}$/.test(text)) { await tg("sendMessage", { chat_id: chatId, text: "Kod faqat raqamlardan iborat bo'lsin." }); return true; }
    const { data: existing } = await db().from("movies").select("id").eq("code", text).maybeSingle();
    if (existing) { await tg("sendMessage", { chat_id: chatId, text: "Bu kod band. Boshqa kod yuboring." }); return true; }
    await setSession(telegramId, "add_movie:file", { ...payload, code: text });
    await tg("sendMessage", { chat_id: chatId, text: `✔ Kod: <b>${text}</b>\n\n3/3. Endi kino <b>video faylini</b> shu chatga yuboring.`, parse_mode: "HTML" });
    return true;
  }
  if (state === "add_movie:file") {
    const fileId = msg.video?.file_id || msg.document?.file_id;
    if (!fileId) { await tg("sendMessage", { chat_id: chatId, text: "Iltimos, video faylni yuboring." }); return true; }
    const { data: inserted } = await db().from("movies").insert({
      code: payload.code,
      title: payload.title,
      file_id: fileId,
      file_type: msg.video ? "video" : "document",
      source_chat_id: msg.chat.id,
      source_message_id: msg.message_id,
      caption: msg.caption ?? null,
    }).select("*").single();
    await clearSession(telegramId);
    await tg("sendMessage", {
      chat_id: chatId,
      text: `✅ Kino qo'shildi!\n\n🎬 ${payload.title}\n🔢 Kod: <code>${payload.code}</code>`,
      parse_mode: "HTML",
    });
    // Fire-and-await n8n webhook (best effort, errors are logged)
    try {
      await notifyMovieCreated({
        id: inserted?.id,
        code: payload.code,
        title: payload.title,
        caption: msg.caption ?? null,
        file_id: fileId,
        file_type: msg.video ? "video" : "document",
        is_premium: false,
        created_at: inserted?.created_at,
      });
    } catch (e) {
      console.error("[n8n] notifyMovieCreated threw", e);
    }
    return true;
  }

  if (state === "del_movie:code") {
    const { data: m } = await db().from("movies").select("*").eq("code", text).maybeSingle();
    if (!m) { await tg("sendMessage", { chat_id: chatId, text: "Bunday kod topilmadi." }); await clearSession(telegramId); return true; }
    await db().from("movies").delete().eq("id", m.id);
    await clearSession(telegramId);
    await tg("sendMessage", { chat_id: chatId, text: `🗑 O'chirildi: <b>${m.title}</b> (kod ${m.code})`, parse_mode: "HTML" });
    return true;
  }

  if (state === "add_channel:input") {
    let chatIdInput = text;
    let title = text;
    let username: string | null = null;
    let inviteLink: string | null = null;
    let resolvedId: number;
    try {
      if (chatIdInput.startsWith("@")) {
        const info: any = await tg("getChat", { chat_id: chatIdInput });
        resolvedId = info.id;
        title = info.title || chatIdInput;
        username = info.username || chatIdInput.replace("@", "");
        inviteLink = info.invite_link || (username ? `https://t.me/${username}` : null);
      } else {
        const id = Number(chatIdInput);
        if (!Number.isFinite(id)) throw new Error("Notog'ri format");
        const info: any = await tg("getChat", { chat_id: id });
        resolvedId = info.id;
        title = info.title || String(id);
        username = info.username || null;
        inviteLink = info.invite_link || (username ? `https://t.me/${username}` : null);
      }
      // check bot is admin
      const me: any = await tg("getMe");
      const member: any = await tg("getChatMember", { chat_id: resolvedId, user_id: me.id });
      if (!["administrator", "creator"].includes(member.status)) {
        await tg("sendMessage", { chat_id: chatId, text: "⚠️ Bot bu kanalda admin emas. Botni admin qiling va qayta urinib ko'ring." });
        return true;
      }
    } catch (e) {
      await tg("sendMessage", { chat_id: chatId, text: `❌ Xato: ${(e as Error).message}` });
      return true;
    }
    await db().from("channels").upsert(
      { chat_id: resolvedId, username, title, invite_link: inviteLink, is_active: true },
      { onConflict: "chat_id" }
    );
    await clearSession(telegramId);
    await tg("sendMessage", { chat_id: chatId, text: `✅ Kanal qo'shildi: <b>${title}</b>`, parse_mode: "HTML" });
    return true;
  }

  if (state === "broadcast:input") {
    await clearSession(telegramId);
    // fire and forget
    runBroadcast(telegramId, msg).catch((e) => console.error("broadcast err", e));
    return true;
  }

  if (state === "card:number") {
    if (!text) { await tg("sendMessage", { chat_id: chatId, text: "Karta raqamini yuboring." }); return true; }
    await setSession(telegramId, "card:holder", { ...payload, new_number: text });
    await tg("sendMessage", { chat_id: chatId, text: "Endi karta egasining ism-familiyasini yuboring:" });
    return true;
  }
  if (state === "card:holder") {
    if (!text) { await tg("sendMessage", { chat_id: chatId, text: "Ism-familiya yuboring." }); return true; }
    await setSetting("card_number", payload.new_number);
    await setSetting("card_holder", text);
    await clearSession(telegramId);
    await tg("sendMessage", {
      chat_id: chatId, parse_mode: "HTML",
      text: `✅ Karta ma'lumoti yangilandi:\n\n💳 <code>${payload.new_number}</code>\n👤 <b>${text}</b>`,
    });
    return true;
  }

  if (state === "n8n:url") {
    if (!text) { await tg("sendMessage", { chat_id: chatId, text: "URL yuboring yoki o'chirish uchun -" }); return true; }
    if (text === "-") {
      await setN8nWebhookUrl("");
      await clearSession(telegramId);
      await tg("sendMessage", { chat_id: chatId, text: "🗑 n8n webhook URL o'chirildi." });
      return true;
    }
    if (!/^https?:\/\//i.test(text)) {
      await tg("sendMessage", { chat_id: chatId, text: "❌ URL http:// yoki https:// bilan boshlanishi kerak." });
      return true;
    }
    await setN8nWebhookUrl(text);
    await clearSession(telegramId);
    await tg("sendMessage", {
      chat_id: chatId, parse_mode: "HTML",
      text: `✅ n8n webhook URL saqlandi:\n<code>${text}</code>\n\nEndi har yangi kino qo'shilganda ushbu URL ga POST yuboriladi.`,
    });
    return true;
  }

  return false;
}

// ---------- /promt : bot tuzilishi haqida to'liq tushuntirish ----------
const PROMT_TEXT = `🤖 <b>Bot qanday ishlaydi — to'liq tushuntirish</b>

<b>1. Umumiy tuzilma</b>
• Telegram → Webhook (<code>/api/public/telegram/webhook</code>) → bot mantiqi → Lovable Cloud (baza).
• Telegram API chaqiruvlari Lovable connector gateway orqali ketadi (token kodda saqlanmaydi).

<b>2. Baza jadvallari</b>
• <code>users</code> — foydalanuvchi, premium muddati, bloklangan holati
• <code>channels</code> — majburiy obuna kanallari
• <code>movies</code> — kino nomi, kodi, file_id, premium belgisi
• <code>payments</code> — chek rasmi, holati (pending/approved/rejected)
• <code>settings</code> — karta ma'lumoti, admin ro'yxati, sozlamalar
• <code>admin_sessions</code> — ko'p bosqichli dialoglar holati (FSM)

<b>3. Foydalanuvchi oqimi</b>
1) <code>/start</code> → bot foydalanuvchini bazaga yozadi.
2) Majburiy kanallarga obuna tekshiriladi (<code>getChatMember</code>).
3) Obuna bo'lmasa — kanallar ro'yxati + "Tekshirish" tugmasi chiqadi.
4) Obuna bo'lsa — asosiy menyu ochiladi.
5) Foydalanuvchi <b>kino kodini</b> (raqam) yuboradi → bot <code>movies</code> dan topib, <code>file_id</code> orqali videoni yuboradi.
6) Kino premium bo'lsa — faqat premium foydalanuvchiga yuboriladi.

<b>4. Premium</b>
• ⭐ Premium → tarif tanlanadi → karta ma'lumoti chiqadi.
• Foydalanuvchi chek rasmini yuboradi → chek adminga tugmalar bilan boradi.
• Admin ✅ tasdiqlasa — <code>users.premium_until</code> uzaytiriladi; ❌ rad etsa — foydalanuvchiga xabar boradi.
• <code>/stats</code> — foydalanuvchi o'z premium holati va muddatini ko'radi.

<b>5. Admin panel (<code>/admin</code>)</b>
• 🎬 Kino qo'shish: nomi → kodi → video fayl
• 🗑 Kino o'chirish (kod bo'yicha)
• 📺 Kanal qo'shish / ❌ Kanal o'chirish
• 📊 Statistika: foydalanuvchi, kino, premium soni
• 📢 Xabar yuborish: hammaga matn/rasm/video
• 💳 Karta ma'lumoti
• 🔗 n8n webhook: yangi kino qo'shilganda tashqi tizimga POST yuboriladi (<code>webhook_logs</code> ga log yoziladi)

<b>6. Buyruqlar</b>
<code>/start</code> — boshlash
<code>/stats</code> — o'z holatingiz
<code>/myid</code> — Telegram ID
<code>/admin</code> — admin panel (faqat admin)
<code>/promt</code> — shu tushuntirish (faqat admin)

<b>7. Xavfsizlik</b>
• Admin huquqi faqat egasining Telegram ID si orqali beriladi.
• Baza RLS bilan yopiq, server kaliti faqat serverda ishlatiladi.`;

async function sendPromt(chatId: number) {
  const parts = PROMT_TEXT.match(/[\s\S]{1,3500}/g) || [];
  for (const part of parts) {
    await tg("sendMessage", { chat_id: chatId, text: part, parse_mode: "HTML", disable_web_page_preview: true });
  }
}

// ---------- /database : barcha kinolar (nomi, kodi, file_id) ----------
function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendDatabaseDump(chatId: number) {
  const { data, error } = await db()
    .from("movies")
    .select("code,title,file_id,file_type,is_premium,views_count,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    await tg("sendMessage", { chat_id: chatId, text: "❌ Bazani o'qishda xatolik: " + error.message });
    return;
  }
  const rows = data || [];
  if (rows.length === 0) {
    await tg("sendMessage", { chat_id: chatId, text: "📭 Bazada hozircha kino yo'q." });
    return;
  }

  const blocks = rows.map(
    (m, i) =>
      `<b>${i + 1}. ${escHtml(m.title)}</b>\n` +
      `Kod: <code>${escHtml(m.code)}</code>\n` +
      `Turi: ${escHtml(m.file_type)}${m.is_premium ? " • 💎 premium" : ""} • 👁 ${m.views_count}\n` +
      `file_id: <code>${escHtml(m.file_id)}</code>`,
  );

  let buf = `🗄 <b>Baza: ${rows.length} ta kino</b>\n\n`;
  for (const b of blocks) {
    if (buf.length + b.length + 2 > 3500) {
      await tg("sendMessage", { chat_id: chatId, text: buf, parse_mode: "HTML", disable_web_page_preview: true });
      buf = "";
    }
    buf += b + "\n\n";
  }
  if (buf.trim()) {
    await tg("sendMessage", { chat_id: chatId, text: buf, parse_mode: "HTML", disable_web_page_preview: true });
  }
}
