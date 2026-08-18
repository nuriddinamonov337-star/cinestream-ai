CREATE TABLE public.reels_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT ALL ON public.reels_jobs TO service_role;
ALTER TABLE public.reels_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_reels_jobs_telegram_id ON public.reels_jobs (telegram_id);