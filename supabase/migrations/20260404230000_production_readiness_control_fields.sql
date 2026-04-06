-- =============================================================================
-- MIGRATION: production_readiness_control_fields
-- DATE:      2026-04-04
-- PURPOSE:   Add production control fields to core entity tables so the app
--            can distinguish live-ready records from incomplete / dirty data.
-- SAFETY:    All changes are additive (new columns with defaults). No existing
--            columns are altered or dropped. Fully reversible via DROP COLUMN.
-- TABLES:    firm_records, firm_investors, people, organizations, operator_profiles
-- =============================================================================

-- ─── 1. firm_records ────────────────────────────────────────────────────────

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS ready_for_live      boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review        boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enrichment_status   text      NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS completeness_score  integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_count        integer   NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.firm_records.ready_for_live     IS 'True when record meets minimum viable record standard for production display';
COMMENT ON COLUMN public.firm_records.needs_review       IS 'Flagged for manual review (data quality issue detected)';
COMMENT ON COLUMN public.firm_records.enrichment_status  IS 'pending | partial | complete | failed';
COMMENT ON COLUMN public.firm_records.completeness_score IS '0-100 score based on field presence (name, description, website, logo, stage, sector, location)';
COMMENT ON COLUMN public.firm_records.source_count       IS 'Number of distinct external data sources that contributed to this record';

CREATE INDEX IF NOT EXISTS idx_firm_records_ready_for_live
  ON public.firm_records (ready_for_live) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_records_enrichment_status
  ON public.firm_records (enrichment_status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_records_completeness
  ON public.firm_records (completeness_score DESC) WHERE deleted_at IS NULL;

-- ─── 2. firm_investors ──────────────────────────────────────────────────────

ALTER TABLE public.firm_investors
  ADD COLUMN IF NOT EXISTS ready_for_live      boolean        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enrichment_status   text           NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS completeness_score  integer        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_count        integer        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slug                text,
  ADD COLUMN IF NOT EXISTS last_enriched_at    timestamptz;

COMMENT ON COLUMN public.firm_investors.ready_for_live     IS 'True when record meets minimum viable record standard for production display';
COMMENT ON COLUMN public.firm_investors.enrichment_status  IS 'pending | partial | complete | failed';
COMMENT ON COLUMN public.firm_investors.completeness_score IS '0-100 score based on field presence (name, title, bio, linkedin, sector, stage, location)';
COMMENT ON COLUMN public.firm_investors.source_count       IS 'Number of distinct external data sources that contributed to this record';
COMMENT ON COLUMN public.firm_investors.slug               IS 'URL-safe identifier for investor profile pages';
COMMENT ON COLUMN public.firm_investors.last_enriched_at   IS 'Timestamp of last enrichment pass for this investor';

CREATE INDEX IF NOT EXISTS idx_firm_investors_ready_for_live
  ON public.firm_investors (ready_for_live) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_investors_enrichment_status
  ON public.firm_investors (enrichment_status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_investors_completeness
  ON public.firm_investors (completeness_score DESC) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_firm_investors_slug
  ON public.firm_investors (slug) WHERE slug IS NOT NULL AND deleted_at IS NULL;

-- ─── 3. people (founders / operators) ───────────────────────────────────────

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS ready_for_live      boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enrichment_status   text      NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS completeness_score  integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_enriched_at    timestamptz;

COMMENT ON COLUMN public.people.ready_for_live     IS 'True when record meets minimum viable record standard for production display';
COMMENT ON COLUMN public.people.enrichment_status  IS 'pending | partial | complete | failed';
COMMENT ON COLUMN public.people.completeness_score IS '0-100 score based on field presence';
COMMENT ON COLUMN public.people.last_enriched_at   IS 'Timestamp of last enrichment pass';

CREATE INDEX IF NOT EXISTS idx_people_ready_for_live
  ON public.people (ready_for_live);

-- ─── 4. organizations (companies / startups) ────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ready_for_live      boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enrichment_status   text      NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS completeness_score  integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_enriched_at    timestamptz;

COMMENT ON COLUMN public.organizations.ready_for_live     IS 'True when record meets minimum viable record standard for production display';
COMMENT ON COLUMN public.organizations.enrichment_status  IS 'pending | partial | complete | failed';
COMMENT ON COLUMN public.organizations.completeness_score IS '0-100 score based on field presence';
COMMENT ON COLUMN public.organizations.last_enriched_at   IS 'Timestamp of last enrichment pass';

CREATE INDEX IF NOT EXISTS idx_organizations_ready_for_live
  ON public.organizations (ready_for_live);

-- ─── 5. operator_profiles ───────────────────────────────────────────────────

ALTER TABLE public.operator_profiles
  ADD COLUMN IF NOT EXISTS ready_for_live      boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enrichment_status   text      NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS completeness_score  integer   NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.operator_profiles.ready_for_live     IS 'True when record meets minimum viable record standard';
COMMENT ON COLUMN public.operator_profiles.enrichment_status  IS 'pending | partial | complete | failed';
COMMENT ON COLUMN public.operator_profiles.completeness_score IS '0-100 score based on field presence';

CREATE INDEX IF NOT EXISTS idx_operator_profiles_ready_for_live
  ON public.operator_profiles (ready_for_live) WHERE deleted_at IS NULL;
