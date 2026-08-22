-- Operator ON/OFF list for Fresh Capital Enrichment → Sources (Fund Watch feeds).
-- Latest Funding continues to use fi_sources.active.

ALTER TABLE public.fresh_capital_enrichment_settings
  ADD COLUMN IF NOT EXISTS disabled_source_keys text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.fresh_capital_enrichment_settings.disabled_source_keys IS
  'Fund Watch feed keys that should be skipped by vc-fund-sync (e.g. SHAI_GOLDMAN_NEW_FUNDS_SHEET). Empty = all on.';
