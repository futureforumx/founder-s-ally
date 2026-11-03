ALTER TABLE public.startup_founders
  ADD COLUMN IF NOT EXISTS website_url text;
