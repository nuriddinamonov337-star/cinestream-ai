-- Add optional metadata columns to public.movies.
-- Additive only (IF NOT EXISTS, default NULL): existing rows and file_ids are untouched.
ALTER TABLE public.movies
  ADD COLUMN IF NOT EXISTS poster_url TEXT,
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS genre TEXT,
  ADD COLUMN IF NOT EXISTS rating NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT;

GRANT ALL ON public.movies TO service_role;
