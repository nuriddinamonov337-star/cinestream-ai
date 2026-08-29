import { createFileRoute } from "@tanstack/react-router";
import { handleUpdate } from "@/lib/telegram/handlers";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Verify the Telegram-provided secret token (set via setWebhook's secret_token).
          const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
          if (expected) {
            const got = request.headers.get("x-telegram-bot-api-secret-token");
            if (got !== expected) {
              console.warn("[webhook] invalid secret token");
              return new Response("Forbidden", { status: 403 });
            }
          }
          const update = await request.json();
          // Must await — background tasks may be killed after the response returns.
          await handleUpdate(update);
        } catch (e) {
          console.error("[webhook] error:", e);
        }
        return new Response("ok");
      },
      GET: async () => new Response("Telegram webhook alive"),
    },
  },
});
