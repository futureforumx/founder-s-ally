-- ============================================================
-- Migration: Backfill Pipeline Schema
-- Date:      2026-04-15
-- Purpose:   Extend firm_records with fields required for the
--            Playwright-based multi-source backfill pipeline.
--            Add provenance table for field-level audit trail.
--            Safe / idempotent — uses IF NOT EXISTS.
-- ============================================================

-- ─── firm_records: identity + URL columns ───────────────────────────────────

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS description           TEXT,
  ADD COLUMN IF NOT EXISTS elevator_pitch        TEXT,
  ADD COLUMN IF NOT EXISTS website_url           TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url          TEXT,
  ADD COLUMN IF NOT EXISTS x_url                 TEXT,
  ADD COLUMN IF NOT EXISTS crunchbase_url        TEXT,
  ADD COLUMN IF NOT EXISTS tracxn_url            TEXT,
  ADD COLUMN IF NOT EXISTS cbinsights_url        TEXT,
  ADD COLUMN IF NOT EXISTS pitchbook_url         TEXT,
  ADD COLUMN IF NOT EXISTS signal_nfx_url        TEXT,
  ADD COLUMN IF NOT EXISTS openvc_url            TEXT,
  ADD COLUMN IF NOT EXISTS vcsheet_url           TEXT,
  ADD COLUMN IF NOT EXISTS startups_gallery_url  TEXT,
  ADD COLUMN IF NOT EXISTS angellist_url         TEXT,
  ADD COLUMN IF NOT EXISTS wellfound_url         TEXT,
  ADD COLUMN IF NOT EXISTS blog_url              TEXT,
  ADD COLUMN IF NOT EXISTS medium_url            TEXT,
  ADD COLUMN IF NOT EXISTS substack_url          TEXT;

-- ─── firm_records: HQ + identity ────────────────────────────────────────────

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS hq_city       TEXT,
  ADD COLUMN IF NOT EXISTS hq_state      TEXT,
  ADD COLUMN IF NOT EXISTS hq_country    TEXT,
  ADD COLUMN IF NOT EXISTS hq_region     TEXT,
  ADD COLUMN IF NOT EXISTS founded_year  INTEGER,
  ADD COLUMN IF NOT EXISTS aum           TEXT,        -- free-text like "$500M" preserved for legacy UI
  ADD COLUMN IF NOT EXISTS aum_usd       BIGINT,      -- normalized
  ADD COLUMN IF NOT EXISTS min_check_size BIGINT,
  ADD COLUMN IF NOT EXISTS max_check_size BIGINT,
  ADD COLUMN IF NOT EXISTS email         TEXT,
  ADD COLUMN IF NOT EXISTS phone         TEXT,
  ADD COLUMN IF NOT EXISTS logo_url      TEXT;

-- ─── firm_records: classification columns ──────────────────────────────────
-- Store as TEXT with CHECK constraints for fast filtering + flexibility.

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS stage_classification      TEXT,
  ADD COLUMN IF NOT EXISTS structure_classification  TEXT,
  ADD COLUMN IF NOT EXISTS theme_classification      TEXT,
  ADD COLUMN IF NOT EXISTS sector_classification     TEXT,
  ADD COLUMN IF NOT EXISTS impact_orientation        TEXT;

-- Soft enums via CHECK (nullable allowed)
DO $$ BEGIN
  ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_stage_cls_chk;
  ALTER TABLE public.firm_records ADD CONSTRAINT firm_records_stage_cls_chk
    CHECK (stage_classification IS NULL OR stage_classification IN ('multi_stage','early_stage','growth','buyout'));

  ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_structure_cls_chk;
  ALTER TABLE public.firm_records ADD CONSTRAINT firm_records_structure_cls_chk
    CHECK (structure_classification IS NULL OR structure_classification IN ('partnership','solo_gp','syndicate','cvc','family_office','private_equity'));

  ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_theme_cls_chk;
  ALTER TABLE public.firm_records ADD CONSTRAINT firm_records_theme_cls_chk
    CHECK (theme_classification IS NULL OR theme_classification IN ('generalist','theme_driven','multi_theme'));

  ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_sector_cls_chk;
  ALTER TABLE public.firm_records ADD CONSTRAINT firm_records_sector_cls_chk
    CHECK (sector_classification IS NULL OR sector_classification IN ('generalist','sector_focused','multi_sector'));

  ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_impact_chk;
  ALTER TABLE public.firm_records ADD CONSTRAINT firm_records_impact_chk
    CHECK (impact_orientation IS NULL OR impact_orientation IN ('primary','integrated','considered','none'));
END $$;

-- ─── firm_records: behavior / stage columns ─────────────────────────────────

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS stage_focus              TEXT[],
  ADD COLUMN IF NOT EXISTS stage_min                TEXT,
  ADD COLUMN IF NOT EXISTS stage_max                TEXT,
  ADD COLUMN IF NOT EXISTS lead_behavior            TEXT,  -- lead | co-lead | follow-on | flexible
  ADD COLUMN IF NOT EXISTS is_actively_deploying    BOOLEAN,
  ADD COLUMN IF NOT EXISTS geo_focus                TEXT[],
  ADD COLUMN IF NOT EXISTS manual_review_status     TEXT,  -- 'ok' | 'needs_review' | 'reviewed'
  ADD COLUMN IF NOT EXISTS source_last_verified_at  TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_lead_chk;
  ALTER TABLE public.firm_records ADD CONSTRAINT firm_records_lead_chk
    CHECK (lead_behavior IS NULL OR lead_behavior IN ('lead','co_lead','follow_on','flexible'));

  ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_review_chk;
  ALTER TABLE public.firm_records ADD CONSTRAINT firm_records_review_chk
    CHECK (manual_review_status IS NULL OR manual_review_status IN ('ok','needs_review','reviewed'));
END $$;

-- ─── Provenance: firm_field_sources ─────────────────────────────────────────
-- One row per (firm_id, field_name, source_name) pair.
-- Conflicting values from different sources are preserved — merge logic
-- reads them to decide which to propagate into firm_records.

CREATE TABLE IF NOT EXISTS public.firm_field_sources (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id               UUID NOT NULL REFERENCES public.firm_records(id) ON DELETE CASCADE,
  field_name            TEXT NOT NULL,
  source_name           TEXT NOT NULL,          -- 'website' | 'crunchbase' | 'cbinsights' | ...
  source_url            TEXT,
  source_record_id      TEXT,                   -- external ID if available (e.g. CBI org id)
  extracted_value_json  JSONB NOT NULL,         -- actual value, wrapped (e.g. {"value": "New York, NY"})
  confidence_score      NUMERIC(4,3) NOT NULL DEFAULT 0.5,  -- 0.000 – 1.000
  extracted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (firm_id, field_name, source_name)
);

CREATE INDEX IF NOT EXISTS idx_firm_field_sources_firm       ON public.firm_field_sources(firm_id);
CREATE INDEX IF NOT EXISTS idx_firm_field_sources_source     ON public.firm_field_sources(source_name);
CREATE INDEX IF NOT EXISTS idx_firm_field_sources_field      ON public.firm_field_sources(field_name);
CREATE INDEX IF NOT EXISTS idx_firm_field_sources_extracted  ON public.firm_field_sources(extracted_at DESC);

-- ─── Multi-select helper tables ─────────────────────────────────────────────
-- Many-to-many firm↔tag via junction tables. Tags are unique by (namespace, value).

CREATE TABLE IF NOT EXISTS public.firm_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace   TEXT NOT NULL,        -- 'theme' | 'sector' | 'stage_initial' | 'stage_followon' | 'geo'
  value       TEXT NOT NULL,
  slug        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (namespace, value)
);

CREATE INDEX IF NOT EXISTS idx_firm_tags_ns_value ON public.firm_tags(namespace, value);

CREATE TABLE IF NOT EXISTS public.firm_tag_links (
  firm_id    UUID NOT NULL REFERENCES public.firm_records(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES public.firm_tags(id) ON DELETE CASCADE,
  namespace  TEXT NOT NULL,
  source     TEXT,                    -- which adapter attached this tag
  confidence NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (firm_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_firm_tag_links_ns ON public.firm_tag_links(firm_id, namespace);

-- ─── Structured logging (optional but useful for debugging) ─────────────────

CREATE TABLE IF NOT EXISTS public.backfill_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  source         TEXT,                    -- 'all' or specific adapter name
  firm_id        UUID REFERENCES public.firm_records(id) ON DELETE SET NULL,
  firm_name      TEXT,
  status         TEXT,                    -- 'ok' | 'failed' | 'partial' | 'skipped'
  error_message  TEXT,
  fields_written TEXT[],
  duration_ms    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_backfill_runs_firm ON public.backfill_runs(firm_id);
CREATE INDEX IF NOT EXISTS idx_backfill_runs_started ON public.backfill_runs(started_at DESC);

-- ─── RLS (read-only for anon/authenticated, write via service role only) ────

ALTER TABLE public.firm_field_sources  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_tags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_tag_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backfill_runs       ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "firm_field_sources_read" ON public.firm_field_sources FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "firm_tags_read" ON public.firm_tags FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "firm_tag_links_read" ON public.firm_tag_links FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_firm_field_sources_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_firm_field_sources_updated_at ON public.firm_field_sources;
CREATE TRIGGER trg_firm_field_sources_updated_at
  BEFORE UPDATE ON public.firm_field_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_firm_field_sources_updated_at();

COMMENT ON TABLE public.firm_field_sources IS
  'Field-level provenance — every scraped value is stored here with source, URL, confidence, and timestamp. Merge logic in src/backfill reads this to pick the winning value per field.';

COMMENT ON TABLE public.firm_tags IS
  'Shared tag registry for themes, sectors, stages, geographies. Referenced by firm_tag_links via namespace.';

COMMENT ON TABLE public.backfill_runs IS
  'Structured log of every per-firm per-source backfill attempt. Used for debugging + rate limit cooldown decisions.';
