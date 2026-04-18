-- Migration: Add signal_nfx_url to firm_investors
-- Allows the Signal NFX enrichment scraper to skip search and navigate
-- directly to a known investor profile URL on subsequent runs.
-- Idempotent — uses IF NOT EXISTS.

ALTER TABLE public.firm_investors
  ADD COLUMN IF NOT EXISTS signal_nfx_url text;

CREATE INDEX IF NOT EXISTS idx_firm_investors_signal_nfx_url
  ON public.firm_investors (signal_nfx_url)
  WHERE signal_nfx_url IS NOT NULL;

COMMENT ON COLUMN public.firm_investors.signal_nfx_url IS
  'Signal NFX investor profile URL (e.g. https://signal.nfx.com/investors/jane-doe). '
  'Used by the overnight enrichment scraper for direct navigation on re-runs.';
