-- Canonical HQ governance for public.firm_records
-- UI and APIs should prefer structured hq_* (+ optional display line) as the single source of truth.
-- Automated jobs must not overwrite HQ when canonical_hq_locked is true.

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS canonical_hq_locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS canonical_hq_source text NULL;

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS canonical_hq_set_at timestamptz NULL;

COMMENT ON COLUMN public.firm_records.canonical_hq_locked IS
  'When true, batch enrichment and imports must not change hq_city, hq_state, hq_country, hq_zip_code, hq_region, address, or legacy location.';

COMMENT ON COLUMN public.firm_records.canonical_hq_source IS
  'Provenance of the locked canonical HQ, e.g. manual_admin | prisma_sync | signal_nfx | enrich_all | csv_backfill.';

COMMENT ON COLUMN public.firm_records.canonical_hq_set_at IS
  'When canonical_hq_source was last set (manual or job).';
