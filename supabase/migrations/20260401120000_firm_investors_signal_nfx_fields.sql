-- Migration: Add Signal NFX enrichment fields to firm_investors
-- sweet_spot, networks, past_investments, co_investors

ALTER TABLE public.firm_investors
  ADD COLUMN IF NOT EXISTS sweet_spot        numeric  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS networks          text[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS past_investments  jsonb    DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS co_investors      jsonb    DEFAULT '[]'::jsonb;

-- GIN indexes for array/jsonb filtering
CREATE INDEX IF NOT EXISTS idx_firm_investors_networks
  ON public.firm_investors USING GIN (networks);

CREATE INDEX IF NOT EXISTS idx_firm_investors_past_investments
  ON public.firm_investors USING GIN (past_investments);

CREATE INDEX IF NOT EXISTS idx_firm_investors_co_investors
  ON public.firm_investors USING GIN (co_investors);

COMMENT ON COLUMN public.firm_investors.sweet_spot IS
  'Preferred single check size in USD (from Signal NFX profile)';

COMMENT ON COLUMN public.firm_investors.networks IS
  'Network memberships e.g. {Harvard Business School Network, NFX Network}';

COMMENT ON COLUMN public.firm_investors.past_investments IS
  'Array of {company, stage, date, round_size_usd, total_raised_usd, co_investors[]}';

COMMENT ON COLUMN public.firm_investors.co_investors IS
  'Investors who co-invest with this person: [{name, firm, slug}]';
