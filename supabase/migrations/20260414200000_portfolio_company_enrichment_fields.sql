-- =============================================================================
-- Migration: Portfolio company enrichment fields
-- =============================================================================
-- The live database stores portfolio companies as a rich JSONB array in
-- investormatch_vc_firms.portfolio.  Each element follows the schema:
--
--   {
--     "name":              string,
--     "website":           string | null,
--     "description":       string | null,
--     "logo_url":          string | null,
--     "sector":            string | null,
--     "stage":             string | null,          -- Seed / Series A / …
--     "date_announced":    string | null,          -- YYYY or YYYY-MM-DD
--     "investment_status": "active"|"exited"|"acquired"|"ipo"|"unknown",
--     "hq_city":           string | null,
--     "hq_country":        string | null,
--     "employee_count":    integer | null,
--     "founded_year":      integer | null,
--     "linkedin_url":      string | null,
--     "twitter_url":       string | null,
--     "enrichment_source": string               -- e.g. "website_scrape+brandfetch"
--   }
--
-- This migration adds GIN index support for fast JSON queries and a helper
-- view that unnests the portfolio array for easier querying.
-- =============================================================================

-- ── GIN index for fast JSONB portfolio queries ────────────────────────────────
CREATE INDEX IF NOT EXISTS investormatch_vc_firms_portfolio_gin
  ON public.investormatch_vc_firms USING gin (portfolio jsonb_path_ops);

-- ── Enrichment progress tracking ─────────────────────────────────────────────
-- enriched_at already exists; add a dedicated portfolio_enriched_at if missing
ALTER TABLE public.investormatch_vc_firms
  ADD COLUMN IF NOT EXISTS portfolio_enriched_at  timestamptz,
  ADD COLUMN IF NOT EXISTS portfolio_source        text;   -- 'website_scrape' | 'exa_ai' | 'manual'

CREATE INDEX IF NOT EXISTS investormatch_vc_firms_portfolio_enriched_at_idx
  ON public.investormatch_vc_firms (portfolio_enriched_at)
  WHERE portfolio_enriched_at IS NULL;

-- ── View: flat portfolio companies for easy querying ─────────────────────────
CREATE OR REPLACE VIEW public.portfolio_companies AS
SELECT
  f.id                                    AS firm_id,
  f.name                                  AS firm_name,
  f.website_url                           AS firm_website,
  co.ord                                  AS position,
  (co.item ->> 'name')                    AS company_name,
  (co.item ->> 'website')                 AS company_website,
  (co.item ->> 'description')             AS description,
  (co.item ->> 'logo_url')                AS logo_url,
  (co.item ->> 'sector')                  AS sector,
  (co.item ->> 'stage')                   AS stage,
  (co.item ->> 'date_announced')          AS date_announced,
  (co.item ->> 'investment_status')       AS investment_status,
  (co.item ->> 'hq_city')                 AS hq_city,
  (co.item ->> 'hq_country')              AS hq_country,
  (co.item ->> 'employee_count')::int     AS employee_count,
  (co.item ->> 'founded_year')::int       AS founded_year,
  (co.item ->> 'linkedin_url')            AS linkedin_url,
  (co.item ->> 'twitter_url')             AS twitter_url,
  (co.item ->> 'enrichment_source')       AS enrichment_source
FROM public.investormatch_vc_firms f
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(f.portfolio) = 'array' THEN f.portfolio ELSE '[]'::jsonb END
) WITH ORDINALITY AS co(item, ord)
WHERE f.portfolio IS NOT NULL
  AND jsonb_array_length(
    CASE WHEN jsonb_typeof(f.portfolio) = 'array' THEN f.portfolio ELSE '[]'::jsonb END
  ) > 0;

COMMENT ON VIEW public.portfolio_companies IS
  'Flat view of VC firm portfolio companies unnested from investormatch_vc_firms.portfolio';
