-- =============================================================================
-- Migration: Portfolio enrichment columns on firm_records
-- =============================================================================
-- Adds portfolio JSONB storage + tracking columns to firm_records so the
-- enrich-portfolio-websites edge function can write results directly without
-- touching the normalised portfolio_companies / portfolio_investments tables.
--
-- Each element of the portfolio array:
--   { name, website, description, logo_url, sector, stage,
--     date_announced, investment_status, hq_city, hq_country,
--     enrichment_source }
-- =============================================================================

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS portfolio             jsonb        DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS portfolio_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS portfolio_source      text;   -- 'website_scrape_html' | 'website_scrape+ai' | 'attempted'

-- Partial index: quickly find firms still waiting to be enriched
CREATE INDEX IF NOT EXISTS firm_records_portfolio_enriched_at_null_idx
  ON public.firm_records (id)
  WHERE portfolio_enriched_at IS NULL
    AND website_url IS NOT NULL
    AND deleted_at IS NULL;

-- GIN index for fast JSONB portfolio queries
CREATE INDEX IF NOT EXISTS firm_records_portfolio_gin
  ON public.firm_records USING gin (portfolio jsonb_path_ops)
  WHERE portfolio IS NOT NULL AND portfolio != '[]'::jsonb;
