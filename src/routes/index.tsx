import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kino Xitlar Bot — Admin ma'lumot" },
      { name: "description", content: "Telegram kino bot: majburiy obuna, kino kodlari, premium, admin panel." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-10 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Bot faol
          </div>
          <h1 className="text-4xl font-bold tracking-tight">🎬 Kino Xitlar Bot</h1>
          <p className="mt-3 text-muted-foreground">
            Telegram bot ishga tushdi. Botni ochish uchun quyidagi tugmani bosing.
          </p>
          <a
            href="https://t.me/K1no_kidlar_bot"
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            @K1no_kidlar_bot ochish
          </a>
        </div>

        <div className="space-y-6">
          <Section title="1. Adminni sozlash">
            <p>
              Birinchi ishga tushirishda botga <code className="rounded bg-muted px-1">/myid</code>{" "}
              yuboring — bot sizning Telegram ID raqamingizni beradi. Uni saqlab
              qo'ying. Keyin <code className="rounded bg-muted px-1">/admin</code> yozib admin panelga
              kiring. (Boshida ro'yxat bo'sh bo'lgani uchun har kim admin bo'la oladi —
              o'zingizni tezda ID orqali admin ro'yxatiga qo'ying.)
            </p>
          </Section>

          <Section title="2. Majburiy kanal qo'shish">
            <p>
              Admin panel → <b>📺 Kanal qo'shish</b>. Botni kanalga <b>admin</b> qilib
              qo'shing, keyin kanal <code className="rounded bg-muted px-1">@username</code>{" "}
              ni yoki chat ID (<code className="rounded bg-muted px-1">-100...</code>) ni yuboring.
            </p>
          </Section>

          <Section title="3. Kino qo'shish">
            <p>
              Admin panel → <b>🎬 Kino qo'shish</b>. Kino nomi → kod (raqam) →
              video faylni yuborasiz. Foydalanuvchi shu kodni yuborsa, bot kinoni
              yuboradi.
            </p>
          </Section>

          <Section title="4. Premium va to'lovlar">
            <p>
              Foydalanuvchi <b>⭐ Premium</b> tugmasidan tarif tanlab, karta orqali
              to'laydi va chek rasmini yuboradi. Sizga chek yetkaziladi —
              <b> ✅ Tasdiqlash</b> yoki <b>❌ Bekor qilish</b> tugmalari bilan
              hal qilasiz. Karta ma'lumotini admin panel → <b>💳 Karta ma'lumoti</b>{" "}
              da o'zgartirasiz.
            </p>
          </Section>

          <Section title="5. Boshqa imkoniyatlar">
            <ul className="list-disc space-y-1 pl-5">
              <li><b>📊 Statistika</b> — foydalanuvchilar, kinolar, premium soni</li>
              <li><b>📢 Xabar yuborish</b> — barcha foydalanuvchilarga matn/rasm/video</li>
              <li><b>🗑 Kino / kanal o'chirish</b></li>
              <li>Foydalanuvchi uchun <code className="rounded bg-muted px-1">/stats</code> — o'z premium holati</li>
            </ul>
          </Section>
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Barcha ma'lumotlar Lovable Cloud'da xavfsiz saqlanadi.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="text-sm text-muted-foreground [&_b]:text-foreground [&_code]:text-foreground">
        {children}
      </div>
    </div>
  );
}
