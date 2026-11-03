ALTER TABLE public.startups
  ADD COLUMN IF NOT EXISTS industry_verticals text[] NOT NULL DEFAULT ARRAY[]::text[];
