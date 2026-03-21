
-- Add enrichment tracking to investor_database
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS aum text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS website_url text DEFAULT NULL;

-- Create firm_recent_deals table
CREATE TABLE public.firm_recent_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.investor_database(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  amount text,
  stage text,
  date_announced text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.firm_recent_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read firm deals"
  ON public.firm_recent_deals FOR SELECT
  TO anon, authenticated
  USING (true);

-- Create investor_partners table
CREATE TABLE public.investor_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.investor_database(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  title text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, full_name)
);

ALTER TABLE public.investor_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read investor partners"
  ON public.investor_partners FOR SELECT
  TO anon, authenticated
  USING (true);

-- Index for batch queries on stale firms
CREATE INDEX idx_investor_database_last_enriched
  ON public.investor_database (last_enriched_at NULLS FIRST);
