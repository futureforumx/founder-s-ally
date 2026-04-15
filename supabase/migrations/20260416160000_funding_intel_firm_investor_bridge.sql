-- Bridge Prisma funding-intel rollups into Supabase for anon / app client reads.

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS funding_intel_activity_score double precision,
  ADD COLUMN IF NOT EXISTS funding_intel_momentum_score double precision,
  ADD COLUMN IF NOT EXISTS funding_intel_pace_label text,
  ADD COLUMN IF NOT EXISTS funding_intel_summary text,
  ADD COLUMN IF NOT EXISTS funding_intel_focus_json jsonb,
  ADD COLUMN IF NOT EXISTS funding_intel_recent_investments_json jsonb,
  ADD COLUMN IF NOT EXISTS funding_intel_metrics_json jsonb,
  ADD COLUMN IF NOT EXISTS funding_intel_last_deal_at timestamptz,
  ADD COLUMN IF NOT EXISTS funding_intel_updated_at timestamptz;

COMMENT ON COLUMN public.firm_records.funding_intel_activity_score IS 'Synced from Prisma vc_firm_derived_market_intel (90d window, intel_v1).';

ALTER TABLE public.firm_investors
  ADD COLUMN IF NOT EXISTS funding_intel_activity_score double precision,
  ADD COLUMN IF NOT EXISTS funding_intel_momentum_score double precision,
  ADD COLUMN IF NOT EXISTS funding_intel_pace_label text,
  ADD COLUMN IF NOT EXISTS funding_intel_summary text,
  ADD COLUMN IF NOT EXISTS funding_intel_focus_json jsonb,
  ADD COLUMN IF NOT EXISTS funding_intel_recent_investments_json jsonb,
  ADD COLUMN IF NOT EXISTS funding_intel_metrics_json jsonb,
  ADD COLUMN IF NOT EXISTS funding_intel_last_deal_at timestamptz,
  ADD COLUMN IF NOT EXISTS funding_intel_updated_at timestamptz;

COMMENT ON COLUMN public.firm_investors.funding_intel_activity_score IS 'Synced from Prisma vc_person_derived_market_intel when prisma_person_id matches.';

CREATE INDEX IF NOT EXISTS idx_firm_records_funding_intel_activity
  ON public.firm_records (funding_intel_activity_score DESC NULLS LAST)
  WHERE deleted_at IS NULL AND funding_intel_activity_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_firm_investors_funding_intel_activity
  ON public.firm_investors (funding_intel_activity_score DESC NULLS LAST)
  WHERE deleted_at IS NULL AND funding_intel_activity_score IS NOT NULL;
