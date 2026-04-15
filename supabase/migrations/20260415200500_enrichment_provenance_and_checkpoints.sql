-- =============================================================================
-- Migration: Enrichment provenance, checkpoints, scrape logs, candidate values
-- Supports overnight multi-source enrichment scraper with full provenance
-- =============================================================================

-- --------------------------------------------------------
-- 1. enrichment_field_provenance — per-field provenance for every update
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrichment_field_provenance (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text NOT NULL CHECK (entity_type IN ('firm', 'investor')),
  entity_id      text NOT NULL,
  field_name     text NOT NULL,
  old_value      text,
  new_value      text,
  source_platform text NOT NULL,
  source_url     text,
  scraped_at     timestamptz NOT NULL DEFAULT now(),
  confidence_score numeric(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  extraction_method text,
  match_method   text,
  reviewer_required boolean DEFAULT false,
  raw_snippet    text,
  last_verified_at timestamptz,
  corroborating_sources text[],
  auto_applied   boolean DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efp_entity ON public.enrichment_field_provenance (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_efp_field ON public.enrichment_field_provenance (field_name);
CREATE INDEX IF NOT EXISTS idx_efp_source ON public.enrichment_field_provenance (source_platform);
CREATE INDEX IF NOT EXISTS idx_efp_review ON public.enrichment_field_provenance (reviewer_required) WHERE reviewer_required = true;
CREATE INDEX IF NOT EXISTS idx_efp_scraped ON public.enrichment_field_provenance (scraped_at);

-- --------------------------------------------------------
-- 2. enrichment_candidate_values — ambiguous values queued for review
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrichment_candidate_values (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text NOT NULL CHECK (entity_type IN ('firm', 'investor')),
  entity_id      text NOT NULL,
  field_name     text NOT NULL,
  candidate_value text NOT NULL,
  current_value  text,
  source_platform text NOT NULL,
  source_url     text,
  confidence_score numeric(3,2),
  reason         text,
  raw_snippet    text,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  resolved_by    text,
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecv_status ON public.enrichment_candidate_values (status);
CREATE INDEX IF NOT EXISTS idx_ecv_entity ON public.enrichment_candidate_values (entity_type, entity_id);

-- --------------------------------------------------------
-- 3. enrichment_scrape_checkpoints — resumable checkpoint state
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrichment_scrape_checkpoints (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         text NOT NULL,
  source_platform text NOT NULL,
  entity_type    text NOT NULL CHECK (entity_type IN ('firm', 'investor')),
  last_entity_id text NOT NULL,
  last_entity_name text,
  records_processed int NOT NULL DEFAULT 0,
  records_updated int NOT NULL DEFAULT 0,
  records_skipped int NOT NULL DEFAULT 0,
  records_failed int NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'paused')),
  error_message  text,
  metadata       jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esc_run ON public.enrichment_scrape_checkpoints (run_id);
CREATE INDEX IF NOT EXISTS idx_esc_source ON public.enrichment_scrape_checkpoints (source_platform, entity_type);

-- --------------------------------------------------------
-- 4. enrichment_scrape_runs — top-level run tracking
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrichment_scrape_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         text UNIQUE NOT NULL,
  mode           text NOT NULL DEFAULT 'production' CHECK (mode IN ('dry_run', 'production')),
  sources        text[] NOT NULL DEFAULT '{}',
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'paused')),
  firms_processed   int DEFAULT 0,
  investors_processed int DEFAULT 0,
  firms_updated     int DEFAULT 0,
  investors_updated int DEFAULT 0,
  fields_updated    int DEFAULT 0,
  fields_queued_review int DEFAULT 0,
  duplicates_avoided int DEFAULT 0,
  errors            int DEFAULT 0,
  summary        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- 5. enrichment_match_failures — debugging evidence for failed/ambiguous matches
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrichment_match_failures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         text,
  entity_type    text NOT NULL CHECK (entity_type IN ('firm', 'investor')),
  entity_id      text NOT NULL,
  entity_name    text NOT NULL,
  source_platform text NOT NULL,
  failure_reason text NOT NULL,
  candidate_names text[],
  candidate_urls text[],
  screenshot_path text,
  html_snippet   text,
  search_query   text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emf_run ON public.enrichment_match_failures (run_id);
CREATE INDEX IF NOT EXISTS idx_emf_entity ON public.enrichment_match_failures (entity_type, entity_id);

-- --------------------------------------------------------
-- 6. Add tracxn_url columns to firm_records and firm_investors if missing
-- --------------------------------------------------------
ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS tracxn_url text;

ALTER TABLE public.firm_investors
  ADD COLUMN IF NOT EXISTS tracxn_url text;

-- Add additional enrichment columns to firm_records if they don't exist
ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS alternate_names text[],
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS ownership_type text,
  ADD COLUMN IF NOT EXISTS office_locations jsonb,
  ADD COLUMN IF NOT EXISTS office_count int,
  ADD COLUMN IF NOT EXISTS countries_invested_in text[],
  ADD COLUMN IF NOT EXISTS regions_invested_in text[],
  ADD COLUMN IF NOT EXISTS investing_team_count int,
  ADD COLUMN IF NOT EXISTS operating_partners text[],
  ADD COLUMN IF NOT EXISTS sub_sectors text[],
  ADD COLUMN IF NOT EXISTS investment_themes text[],
  ADD COLUMN IF NOT EXISTS recent_focus text,
  ADD COLUMN IF NOT EXISTS avg_check_size text,
  ADD COLUMN IF NOT EXISTS reserve_strategy text,
  ADD COLUMN IF NOT EXISTS company_type_focus text,
  ADD COLUMN IF NOT EXISTS business_model_focus text,
  ADD COLUMN IF NOT EXISTS investment_philosophy text,
  ADD COLUMN IF NOT EXISTS current_fund_name text,
  ADD COLUMN IF NOT EXISTS current_fund_size text,
  ADD COLUMN IF NOT EXISTS current_fund_vintage_year int,
  ADD COLUMN IF NOT EXISTS num_funds int,
  ADD COLUMN IF NOT EXISTS pct_deployed text,
  ADD COLUMN IF NOT EXISTS dry_powder text,
  ADD COLUMN IF NOT EXISTS latest_fund_close text,
  ADD COLUMN IF NOT EXISTS fund_status text,
  ADD COLUMN IF NOT EXISTS lead_follow_behavior text,
  ADD COLUMN IF NOT EXISTS active_portfolio_count int,
  ADD COLUMN IF NOT EXISTS exited_portfolio_count int,
  ADD COLUMN IF NOT EXISTS ipo_count int,
  ADD COLUMN IF NOT EXISTS acquisition_exits int,
  ADD COLUMN IF NOT EXISTS investment_pace text,
  ADD COLUMN IF NOT EXISTS deals_last_24m int,
  ADD COLUMN IF NOT EXISTS last_5_investments jsonb,
  ADD COLUMN IF NOT EXISTS first_investment_date date,
  ADD COLUMN IF NOT EXISTS most_recent_investment_date date,
  ADD COLUMN IF NOT EXISTS lead_investments_count int,
  ADD COLUMN IF NOT EXISTS co_investor_patterns text[],
  ADD COLUMN IF NOT EXISTS breakout_companies text[],
  ADD COLUMN IF NOT EXISTS unicorns text[],
  ADD COLUMN IF NOT EXISTS portfolio_highlights text[],
  ADD COLUMN IF NOT EXISTS notable_misses text[],
  ADD COLUMN IF NOT EXISTS recent_news jsonb,
  ADD COLUMN IF NOT EXISTS firm_blog_url text,
  ADD COLUMN IF NOT EXISTS interviews jsonb,
  ADD COLUMN IF NOT EXISTS podcasts jsonb,
  ADD COLUMN IF NOT EXISTS newsletters text,
  ADD COLUMN IF NOT EXISTS thought_leadership_links text[],
  ADD COLUMN IF NOT EXISTS hiring_signals jsonb,
  ADD COLUMN IF NOT EXISTS major_announcements jsonb,
  ADD COLUMN IF NOT EXISTS contact_page_url text,
  ADD COLUMN IF NOT EXISTS careers_page_url text;

-- Add additional enrichment columns to firm_investors if they don't exist
ALTER TABLE public.firm_investors
  ADD COLUMN IF NOT EXISTS alternate_names text[],
  ADD COLUMN IF NOT EXISTS seniority text,
  ADD COLUMN IF NOT EXISTS investor_type text,
  ADD COLUMN IF NOT EXISTS prior_firm_associations text[],
  ADD COLUMN IF NOT EXISTS short_summary text,
  ADD COLUMN IF NOT EXISTS prior_roles jsonb,
  ADD COLUMN IF NOT EXISTS operator_background text,
  ADD COLUMN IF NOT EXISTS founder_background text,
  ADD COLUMN IF NOT EXISTS domain_expertise text[],
  ADD COLUMN IF NOT EXISTS investing_themes text[],
  ADD COLUMN IF NOT EXISTS recent_focus text,
  ADD COLUMN IF NOT EXISTS sub_sectors text[],
  ADD COLUMN IF NOT EXISTS geographic_focus text[],
  ADD COLUMN IF NOT EXISTS personal_website text,
  ADD COLUMN IF NOT EXISTS firm_bio_page_url text,
  ADD COLUMN IF NOT EXISTS headshot_url text,
  ADD COLUMN IF NOT EXISTS notable_investments text[],
  ADD COLUMN IF NOT EXISTS portfolio_companies text[],
  ADD COLUMN IF NOT EXISTS last_3_investments jsonb,
  ADD COLUMN IF NOT EXISTS last_5_investments jsonb,
  ADD COLUMN IF NOT EXISTS recent_investments jsonb,
  ADD COLUMN IF NOT EXISTS lead_vs_follow text,
  ADD COLUMN IF NOT EXISTS investment_pace text,
  ADD COLUMN IF NOT EXISTS total_known_investments int,
  ADD COLUMN IF NOT EXISTS avg_deal_size text,
  ADD COLUMN IF NOT EXISTS thematic_concentration text[],
  ADD COLUMN IF NOT EXISTS stage_concentration text[],
  ADD COLUMN IF NOT EXISTS geographic_concentration text[],
  ADD COLUMN IF NOT EXISTS board_seats text[],
  ADD COLUMN IF NOT EXISTS articles jsonb,
  ADD COLUMN IF NOT EXISTS blog_posts jsonb,
  ADD COLUMN IF NOT EXISTS interviews jsonb,
  ADD COLUMN IF NOT EXISTS podcasts jsonb,
  ADD COLUMN IF NOT EXISTS recent_news jsonb,
  ADD COLUMN IF NOT EXISTS current_areas_of_interest text[];

-- --------------------------------------------------------
-- 7. RLS policies — allow service role full access
-- --------------------------------------------------------
ALTER TABLE public.enrichment_field_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_candidate_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_scrape_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_match_failures ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access" ON public.enrichment_field_provenance
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access" ON public.enrichment_candidate_values
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access" ON public.enrichment_scrape_checkpoints
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access" ON public.enrichment_scrape_runs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access" ON public.enrichment_match_failures
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
