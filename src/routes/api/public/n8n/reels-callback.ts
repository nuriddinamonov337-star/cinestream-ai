import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/telegram/db";
import { tg } from "@/lib/telegram/api";
import { reelsSecret } from "@/lib/telegram/reels";

function safeEqual(a: string, b: string) {
  const l = Buffer.from(a);
  const r = Buffer.from(b);
  return l.length === r.length && timingSafeEqual(l, r);
}

export const Route = createFileRoute("/api/public/n8n/reels-callback")({
  server: {
    handlers: {
      GET: async () => new Response("reels callback alive"),
      POST: async ({ request }) => {
        const expected = reelsSecret();
        const provided =
          request.headers.get("X-Reels-Secret") ?? new URL(request.url).searchParams.get("secret") ?? "";
        if (!expected || !safeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid json" }, { status: 400 });
        }

        const jobRef: string | null = body?.job_ref ?? null;
        const videoUrl: string | null = body?.video_url ?? body?.url ?? null;
        const errorText: string | null = body?.error ?? null;
        let chatId: number | null = body?.chat_id ? Number(body.chat_id) : null;

        if (!chatId && jobRef) {
          const { data } = await db().from("reels_jobs").select("chat_id").eq("id", jobRef).maybeSingle();
          chatId = data ? Number((data as any).chat_id) : null;
        }
        if (!chatId) return Response.json({ error: "chat_id or job_ref required" }, { status: 400 });

        try {
          if (videoUrl) {
            try {
              await tg("sendVideo", {
                chat_id: chatId,
                video: videoUrl,
                caption: body?.caption ?? "🎞 Instagram Reels tayyor!",
              });
            } catch {
              await tg("sendDocument", { chat_id: chatId, document: videoUrl });
            }
          } else {
            await tg("sendMessage", {
              chat_id: chatId,
              text: `❌ Video tayyorlanmadi.${errorText ? `\n\n${errorText}` : ""}`,
            });
          }
        } catch (e) {
          console.error("[reels-callback] send failed", e);
        }

        if (jobRef) {
          await db()
            .from("reels_jobs")
            .update({
              status: videoUrl ? "sent" : "failed",
              result_url: videoUrl,
              error: errorText,
              completed_at: new Date().toISOString(),
            })
            .eq("id", jobRef);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
