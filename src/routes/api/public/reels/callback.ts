import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/reels/callback")({
  server: {
    handlers: {
      // POST /api/public/reels/callback — the Python reels service calls this
      // when a job finishes. Authenticated via X-Reels-Secret header.
      POST: async ({ request }) => {
        const expected =
          process.env.REELS_SECRET || process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
        const provided = request.headers.get("X-Reels-Secret") || "";
        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid json" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const jobId = String(body?.job_id ?? "");
        const resultUrl = String(body?.result_url ?? "");
        const error = body?.error ? String(body.error) : null;
        if (!jobId) {
          return new Response(JSON.stringify({ error: "job_id required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const { completeReelsJob } = await import("../../../../lib/telegram/reels");
        const res = await completeReelsJob(jobId, resultUrl, error);
        return new Response(JSON.stringify(res), {
          status: res.ok ? 200 : 400,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
