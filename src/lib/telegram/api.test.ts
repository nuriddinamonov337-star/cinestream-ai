import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Hoisted mock fetch — set per test via global.fetch mock implementation.
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  // Default token so getBotToken doesn't throw unless a test clears it.
  process.env.BOT_TOKEN = "123:test-token";
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.BOT_TOKEN;
});

async function importFresh() {
  // Bust the module cache so process.env changes are picked up.
  vi.resetModules();
  return import("../../lib/telegram/api");
}

describe("api.ts", () => {
  it("calls api.telegram.org directly with the bot token and returns result", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }),
    );
    const { tg } = await importFresh();

    const result = await tg("sendMessage", { chat_id: 1, text: "hi" });

    expect(result).toEqual({ message_id: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:test-token/sendMessage");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ chat_id: 1, text: "hi" });
  });

  it("throws on a Telegram error response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, description: "chat not found" }), { status: 400 }),
    );
    const { tg } = await importFresh();
    await expect(tg("sendMessage", { chat_id: 1 })).rejects.toThrow(/chat not found/);
  });

  it("tgSafe swallows errors and returns null", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, description: "forbidden" }), { status: 403 }),
    );
    const { tgSafe } = await importFresh();
    const res = await tgSafe("sendMessage", { chat_id: 1 });
    expect(res).toBeNull();
  });

  it("getBotToken prefers BOT_TOKEN then falls back to TELEGRAM_BOT_TOKEN", async () => {
    delete process.env.BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = "fallback:token";
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }),
    );
    const { tg } = await importFresh();
    await tg("getMe", {});
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/botfallback:token/getMe");
  });

  it("getBotToken throws when no token is configured", async () => {
    delete process.env.BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_API_KEY;
    const { tg } = await importFresh();
    await expect(tg("getMe", {})).rejects.toThrow(/BOT_TOKEN is not configured/);
  });

  it("inlineKeyboard / replyKeyboard / removeKeyboard produce the expected shapes", async () => {
    const { inlineKeyboard, replyKeyboard, removeKeyboard } = await importFresh();
    expect(inlineKeyboard([[{ text: "a", callback_data: "x" }]])).toEqual({
      inline_keyboard: [[{ text: "a", callback_data: "x" }]],
    });
    expect(replyKeyboard([["a", "b"]])).toEqual({
      keyboard: [[{ text: "a" }, { text: "b" }]],
      resize_keyboard: true,
    });
    expect(removeKeyboard).toEqual({ remove_keyboard: true });
  });

  it("tgForm posts a FormData body without overriding the content-type", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { file_id: "z" } }), { status: 200 }),
    );
    const { tgForm } = await importFresh();
    const fd = new FormData();
    fd.append("chat_id", "1");
    await tgForm("sendPhoto", fd);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    // Must NOT set a JSON content-type so the runtime sets the multipart boundary.
    expect(init.headers?.["Content-Type"]).toBeUndefined();
  });
});
