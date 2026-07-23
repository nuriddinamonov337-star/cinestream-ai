CREATE TABLE public.webhook_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event text NOT NULL,
  target_url text NOT NULL,
  payload jsonb NOT NULL,
  status_code integer,
  response_body text,
  error text,
  ok boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.webhook_logs TO service_role;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.webhook_logs FOR ALL TO service_role USING (true) WITH CHECK (true);