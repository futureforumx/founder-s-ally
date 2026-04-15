-- ============================================================
-- Migration: Backfill pipeline schema FIXES
-- Date:      2026-04-15 (follow-up)
-- Purpose:   Remove duplicate columns introduced by the initial
--            backfill_pipeline migration. Align with existing
--            firm_records canonical column names.
-- ============================================================

-- ─── Drop unused duplicate columns introduced by prior migration ────────────
-- If data was already written into these, copy it first. For a greenfield
-- backfill run (data_confidence_score on most firms is still null) there's
-- nothing to copy.

DO $$ BEGIN
  -- Copy any orphan writes to canonical columns first
  UPDATE public.firm_records
  SET cb_insights_url = COALESCE(cb_insights_url, cbinsights_url)
  WHERE cbinsights_url IS NOT NULL AND cb_insights_url IS NULL;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE public.firm_records
  SET last_verified_at = GREATEST(COALESCE(last_verified_at, 'epoch'::timestamptz), COALESCE(source_last_verified_at, 'epoch'::timestamptz))
  WHERE source_last_verified_at IS NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE public.firm_records
  SET lead_or_follow = COALESCE(lead_or_follow, lead_behavior)
  WHERE lead_behavior IS NOT NULL AND lead_or_follow IS NULL;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

ALTER TABLE public.firm_records DROP COLUMN IF EXISTS cbinsights_url;
ALTER TABLE public.firm_records DROP COLUMN IF EXISTS source_last_verified_at;
ALTER TABLE public.firm_records DROP COLUMN IF EXISTS lead_behavior;

-- hq_region already existed as us_region enum. My prior migration's
-- ADD COLUMN IF NOT EXISTS hq_region TEXT was a no-op, nothing to drop.

-- Drop the CHECK constraint that referenced lead_behavior
ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_lead_chk;

-- ─── Upgrade classification columns to ENUMs for stricter enforcement ───────
-- TEXT + CHECK was reliable but adding proper types makes TS + PostgREST happier.

DO $$ BEGIN
  CREATE TYPE public.stage_classification AS ENUM ('multi_stage','early_stage','growth','buyout');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.structure_classification AS ENUM ('partnership','solo_gp','syndicate','cvc','family_office','private_equity');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.theme_classification AS ENUM ('generalist','theme_driven','multi_theme');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sector_classification AS ENUM ('generalist','sector_focused','multi_sector');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.impact_orientation AS ENUM ('primary','integrated','considered','none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Migrate existing text columns to enum types
ALTER TABLE public.firm_records
  ALTER COLUMN stage_classification     TYPE public.stage_classification     USING stage_classification::public.stage_classification,
  ALTER COLUMN structure_classification TYPE public.structure_classification USING structure_classification::public.structure_classification,
  ALTER COLUMN theme_classification     TYPE public.theme_classification     USING theme_classification::public.theme_classification,
  ALTER COLUMN sector_classification    TYPE public.sector_classification    USING sector_classification::public.sector_classification,
  ALTER COLUMN impact_orientation       TYPE public.impact_orientation       USING impact_orientation::public.impact_orientation;

-- Drop now-redundant CHECK constraints (enum enforces validity)
ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_stage_cls_chk;
ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_structure_cls_chk;
ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_theme_cls_chk;
ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_sector_cls_chk;
ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_impact_chk;
ALTER TABLE public.firm_records DROP CONSTRAINT IF EXISTS firm_records_review_chk;

-- ─── Missing indexes for scale ──────────────────────────────────────────────

-- Filtering on classification fields (used by the app for list filters)
CREATE INDEX IF NOT EXISTS idx_firm_records_stage_cls      ON public.firm_records(stage_classification);
CREATE INDEX IF NOT EXISTS idx_firm_records_structure_cls  ON public.firm_records(structure_classification);
CREATE INDEX IF NOT EXISTS idx_firm_records_theme_cls      ON public.firm_records(theme_classification);
CREATE INDEX IF NOT EXISTS idx_firm_records_sector_cls     ON public.firm_records(sector_classification);
CREATE INDEX IF NOT EXISTS idx_firm_records_impact         ON public.firm_records(impact_orientation);
CREATE INDEX IF NOT EXISTS idx_firm_records_review_status  ON public.firm_records(manual_review_status) WHERE manual_review_status = 'needs_review';

-- Provenance composite index (the UNIQUE constraint already gives us one, but
-- explicit for common query patterns)
CREATE INDEX IF NOT EXISTS idx_ffs_firm_field ON public.firm_field_sources(firm_id, field_name);

-- ─── Tag model — allow confidence updates ──────────────────────────────────
-- The original PRIMARY KEY (firm_id, tag_id) blocks re-tagging with updated
-- source/confidence. Switch to a surrogate PK so upserts can refresh values.

DO $$ BEGIN
  ALTER TABLE public.firm_tag_links DROP CONSTRAINT firm_tag_links_pkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

ALTER TABLE public.firm_tag_links
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

UPDATE public.firm_tag_links SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE public.firm_tag_links
  ALTER COLUMN id SET NOT NULL,
  ADD CONSTRAINT firm_tag_links_pkey PRIMARY KEY (id);

-- Logical uniqueness on (firm, tag) — still enforced, but via UNIQUE not PK
DO $$ BEGIN
  ALTER TABLE public.firm_tag_links ADD CONSTRAINT firm_tag_links_firm_tag_uniq UNIQUE (firm_id, tag_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Normalized slug — enforce lowercase + hyphen form so `Fintech`, `FinTech`,
-- `fintech` collapse to one tag
CREATE OR REPLACE FUNCTION public.normalize_tag_value(v TEXT) RETURNS TEXT
  LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(trim(v), '[^a-zA-Z0-9]+', '-', 'g'))
$$;

-- Backfill slug from existing values
UPDATE public.firm_tags SET slug = public.normalize_tag_value(value) WHERE slug IS NULL OR slug = '';

-- Replace UNIQUE(namespace, value) with UNIQUE(namespace, slug) so casing
-- doesn't create duplicates.
DO $$ BEGIN
  ALTER TABLE public.firm_tags DROP CONSTRAINT firm_tags_namespace_value_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.firm_tags ADD CONSTRAINT firm_tags_ns_slug_uniq UNIQUE (namespace, slug);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON CONSTRAINT firm_tag_links_firm_tag_uniq ON public.firm_tag_links IS
  'Logical uniqueness — upsertTags() writes UPSERT(firm_id, tag_id) to refresh source+confidence.';

COMMENT ON FUNCTION public.normalize_tag_value IS
  'Canonicalize a tag value to lowercase + hyphenated form. Used as firm_tags.slug and for casing-insensitive UNIQUE constraint.';
