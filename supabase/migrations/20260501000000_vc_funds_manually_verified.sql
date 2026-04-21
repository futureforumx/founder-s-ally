-- ============================================================
-- vc_funds: add manually_verified overwrite-protection flag
-- ============================================================
-- When manually_verified = true the automated sync pipeline
-- must not overwrite curated fields:
--   name, announcement_url, target_size_usd, final_size_usd,
--   currency, announced_date, stage_focus, sector_focus,
--   geography_focus
-- ============================================================

ALTER TABLE public.vc_funds
  ADD COLUMN IF NOT EXISTS manually_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vc_funds.manually_verified IS
  'When true the ingestion pipeline preserves curated fields '
  '(name, announcement_url, target_size_usd, final_size_usd, currency, '
  'announced_date, stage_focus, sector_focus, geography_focus) and will '
  'not overwrite them on any future automated or manual sync run.';

-- All 93 currently active funds have been manually curated.
-- Mark them protected so the next sync cannot regress their data.
UPDATE public.vc_funds
SET manually_verified = true
WHERE deleted_at IS NULL;
