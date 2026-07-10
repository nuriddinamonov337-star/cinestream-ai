import { createFileRoute } from "@tanstack/react-router";
import { handleUpdate } from "@/lib/telegram/handlers";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const update = await request.json();
          // Must await — Cloudflare Workers kill background tasks after response returns
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
