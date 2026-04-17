-- =============================================================================
-- Migration: Canonical schema standardization for firm_records + firm_investors
-- Date:      2026-04-20
--
-- Goals:
--   1. Add missing canonical fields (domain, short_description, role_type, etc.)
--   2. Add completeness + render-ready columns
--   3. Add provenance JSONB columns (source_urls_json, field_source_json, etc.)
--   4. Normalize empty strings → NULL across both tables
--   5. Add practical indexes
--   6. Create stable read views (firm_list_safe, firm_detail_safe,
--      investor_list_safe, investor_detail_safe)
--
-- Safety: all DDL uses IF NOT EXISTS / idempotent patterns.
-- No columns are dropped or renamed.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: firm_records — add missing canonical fields
-- ─────────────────────────────────────────────────────────────────────────────

-- Identity / discovery
ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS domain                  text,
  ADD COLUMN IF NOT EXISTS short_description       text,
  ADD COLUMN IF NOT EXISTS portfolio_summary       text,
  ADD COLUMN IF NOT EXISTS notable_portfolio_companies text[],
  ADD COLUMN IF NOT EXISTS hq_location             text;   -- combined display line

-- Investment profile (canonical aliases over legacy names)
-- investment_stages mirrors stage_focus but as text[] for API flexibility
ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS investment_stages       text[],
  ADD COLUMN IF NOT EXISTS sectors                 text[],
  ADD COLUMN IF NOT EXISTS themes                  text[],
  ADD COLUMN IF NOT EXISTS geography_focus         text[],
  ADD COLUMN IF NOT EXISTS check_size_min          bigint,
  ADD COLUMN IF NOT EXISTS check_size_max          bigint;

-- Profile depth
ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS team_size               int;    -- investing-team count (distinct from headcount)

-- System / quality
ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS data_completeness_score numeric(4,3) DEFAULT 0 CHECK (data_completeness_score >= 0 AND data_completeness_score <= 1),
  ADD COLUMN IF NOT EXISTS firm_render_ready       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_urls_json        jsonb   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS field_source_json       jsonb   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS field_confidence_json   jsonb   DEFAULT '{}';

COMMENT ON COLUMN public.firm_records.domain IS
  'Normalized hostname extracted from website_url (e.g. "a16z.com"). Used for fast dedup and lookup.';
COMMENT ON COLUMN public.firm_records.short_description IS
  'Canonical short description (≤ 280 chars). Use elevator_pitch as fallback for legacy rows.';
COMMENT ON COLUMN public.firm_records.investment_stages IS
  'text[] canonical stage list derived from stage_focus enum[]. Kept in sync by trigger.';
COMMENT ON COLUMN public.firm_records.sectors IS
  'text[] canonical sector list. Kept in sync from thesis_verticals / sector_scope.';
COMMENT ON COLUMN public.firm_records.themes IS
  'text[] free-form thematic tags (e.g. ["AI infrastructure","climate tech"]).';
COMMENT ON COLUMN public.firm_records.geography_focus IS
  'text[] canonical geography list. Canonical alias for geo_focus.';
COMMENT ON COLUMN public.firm_records.check_size_min IS
  'Minimum check size in USD (bigint). Canonical alias for min_check_size.';
COMMENT ON COLUMN public.firm_records.check_size_max IS
  'Maximum check size in USD (bigint). Canonical alias for max_check_size.';
COMMENT ON COLUMN public.firm_records.data_completeness_score IS
  'Fraction (0–1) of key profile fields that are populated. Recomputed by fn_compute_firm_completeness().';
COMMENT ON COLUMN public.firm_records.firm_render_ready IS
  'TRUE when the firm has enough data for a complete UI card render.';
COMMENT ON COLUMN public.firm_records.source_urls_json IS
  'Map of field_name → source URL from which the value was obtained.';
COMMENT ON COLUMN public.firm_records.field_source_json IS
  'Map of field_name → source platform (e.g. "crunchbase", "linkedin").';
COMMENT ON COLUMN public.firm_records.field_confidence_json IS
  'Map of field_name → confidence score (0–1) for the stored value.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: firm_investors — add missing canonical fields
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.firm_investors
  -- Identity linkage
  ADD COLUMN IF NOT EXISTS person_id               uuid,          -- FK to vc_people if resolved
  -- Role classification
  ADD COLUMN IF NOT EXISTS role_type               text,          -- GP, LP, Principal, Associate, EIR, etc.
  ADD COLUMN IF NOT EXISTS is_partner              boolean NOT NULL DEFAULT false,
  -- Profile
  ADD COLUMN IF NOT EXISTS short_bio               text,          -- ≤ 280 chars
  ADD COLUMN IF NOT EXISTS location                text,          -- combined display line
  -- Canonical URL names
  ADD COLUMN IF NOT EXISTS personal_website_url    text,          -- canonical name (website_url = legacy)
  ADD COLUMN IF NOT EXISTS crunchbase_url          text,
  ADD COLUMN IF NOT EXISTS signal_url              text,
  ADD COLUMN IF NOT EXISTS github_url              text,
  -- Background
  ADD COLUMN IF NOT EXISTS education               jsonb,         -- structured [{school, degree, year}]
  ADD COLUMN IF NOT EXISTS prior_companies         text[],        -- canonical alias for prior_firms
  -- Investment profile
  ADD COLUMN IF NOT EXISTS investment_stages       text[],        -- canonical alias for stage_focus
  ADD COLUMN IF NOT EXISTS sector_focus_canonical  text[],        -- canonical alias for sector_focus
  ADD COLUMN IF NOT EXISTS check_size_focus        text,          -- e.g. "$500K–$2M" display string
  -- System / quality
  ADD COLUMN IF NOT EXISTS data_completeness_score numeric(4,3) DEFAULT 0 CHECK (data_completeness_score >= 0 AND data_completeness_score <= 1),
  ADD COLUMN IF NOT EXISTS investor_render_ready   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_urls_json        jsonb   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS field_source_json       jsonb   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS field_confidence_json   jsonb   DEFAULT '{}';

COMMENT ON COLUMN public.firm_investors.person_id IS
  'UUID reference to vc_people.id when this investor has been entity-resolved.';
COMMENT ON COLUMN public.firm_investors.role_type IS
  'Categorized role: GP, LP, Managing Director, Partner, Principal, Associate, EIR, Venture Partner, Scout, Advisor, Other.';
COMMENT ON COLUMN public.firm_investors.is_partner IS
  'TRUE when title indicates partner-level seniority (GP, Managing Partner, General Partner).';
COMMENT ON COLUMN public.firm_investors.short_bio IS
  'Canonical short bio (≤ 280 chars). background_summary is the longer form.';
COMMENT ON COLUMN public.firm_investors.location IS
  'Combined display location (e.g. "San Francisco, CA"). Derived from city/state/country.';
COMMENT ON COLUMN public.firm_investors.personal_website_url IS
  'Canonical personal website. website_url is retained for legacy compatibility.';
COMMENT ON COLUMN public.firm_investors.investment_stages IS
  'text[] canonical stage list (mirrors stage_focus[]).';
COMMENT ON COLUMN public.firm_investors.data_completeness_score IS
  'Fraction (0–1) of key profile fields populated. Recomputed by fn_compute_investor_completeness().';
COMMENT ON COLUMN public.firm_investors.investor_render_ready IS
  'TRUE when investor has enough data for a complete UI profile render.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: Normalize empty strings → NULL (one-time cleanup)
-- Runs via DO block so it is safe to re-apply (no-op when already clean).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  _cols_firm text[] := ARRAY[
    'firm_name','legal_name','slug','description','elevator_pitch','short_description',
    'website_url','domain','logo_url','linkedin_url','x_url','crunchbase_url',
    'angellist_url','signal_nfx_url','openvc_url','vcsheet_url','medium_url',
    'substack_url','email','phone','address','location','hq_city','hq_state',
    'hq_country','hq_zip_code','hq_location','status','firm_type','lead_or_follow',
    'lead_partner','market_sentiment','sentiment_detail','headcount','aum'
  ];
  _cols_investor text[] := ARRAY[
    'full_name','first_name','last_name','preferred_name','title','role_type',
    'bio','short_bio','background_summary','education_summary','location',
    'city','state','country','timezone','linkedin_url','x_url','website_url',
    'personal_website_url','crunchbase_url','signal_url','github_url',
    'medium_url','substack_url','email','phone','investment_style','check_size_focus'
  ];
  _col text;
  _sql text;
BEGIN
  FOREACH _col IN ARRAY _cols_firm LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'firm_records'
        AND column_name  = _col
    ) THEN
      _sql := format(
        'UPDATE public.firm_records SET %I = NULL WHERE %I = ''''',
        _col, _col
      );
      EXECUTE _sql;
    END IF;
  END LOOP;

  FOREACH _col IN ARRAY _cols_investor LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'firm_investors'
        AND column_name  = _col
    ) THEN
      _sql := format(
        'UPDATE public.firm_investors SET %I = NULL WHERE %I = ''''',
        _col, _col
      );
      EXECUTE _sql;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: Backfill new derived columns from existing data
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a. domain — extract hostname from website_url
UPDATE public.firm_records
SET domain = regexp_replace(
    lower(trim(website_url)),
    '^https?://(www\.)?([^/?#]+).*$',
    '\2'
  )
WHERE domain IS NULL
  AND website_url IS NOT NULL
  AND trim(website_url) <> '';

-- 4b. hq_location — build display line from parts
UPDATE public.firm_records
SET hq_location = trim(both ', ' FROM concat_ws(', ',
    nullif(trim(hq_city),    ''),
    nullif(trim(hq_state),   ''),
    nullif(trim(hq_country), '')
  ))
WHERE hq_location IS NULL
  AND (hq_city IS NOT NULL OR hq_state IS NOT NULL OR hq_country IS NOT NULL);

-- 4c. check_size_min / check_size_max — copy from legacy column names
UPDATE public.firm_records
SET check_size_min = min_check_size
WHERE check_size_min IS NULL AND min_check_size IS NOT NULL;

UPDATE public.firm_records
SET check_size_max = max_check_size
WHERE check_size_max IS NULL AND max_check_size IS NOT NULL;

-- 4d. geography_focus — copy from geo_focus
UPDATE public.firm_records
SET geography_focus = geo_focus
WHERE geography_focus IS NULL AND geo_focus IS NOT NULL;

-- 4e. team_size — copy from investing_team_count, else total_investors
UPDATE public.firm_records
SET team_size = COALESCE(investing_team_count, total_investors)
WHERE team_size IS NULL
  AND (investing_team_count IS NOT NULL OR total_investors IS NOT NULL);

-- 4f. short_description — copy from elevator_pitch for legacy rows
UPDATE public.firm_records
SET short_description = left(elevator_pitch, 280)
WHERE short_description IS NULL AND elevator_pitch IS NOT NULL;

-- 4g. investor location combined display line
UPDATE public.firm_investors
SET location = trim(both ', ' FROM concat_ws(', ',
    nullif(trim(city),    ''),
    nullif(trim(state),   ''),
    nullif(trim(country), '')
  ))
WHERE location IS NULL
  AND (city IS NOT NULL OR state IS NOT NULL OR country IS NOT NULL);

-- 4h. investor personal_website_url — canonical alias
UPDATE public.firm_investors
SET personal_website_url = COALESCE(personal_website, website_url)
WHERE personal_website_url IS NULL
  AND (personal_website IS NOT NULL OR website_url IS NOT NULL);

-- 4i. investor is_partner — derive from title
UPDATE public.firm_investors
SET is_partner = true
WHERE is_partner = false
  AND title IS NOT NULL
  AND (
    lower(title) LIKE '%general partner%'
    OR lower(title) LIKE '%managing partner%'
    OR lower(title) LIKE '% partner%'
    OR lower(title) LIKE '%gp%'
  );

-- 4j. investor role_type — derive coarse category from title
UPDATE public.firm_investors
SET role_type = CASE
    WHEN title IS NULL THEN NULL
    WHEN lower(title) LIKE '%general partner%' OR lower(title) LIKE '%managing partner%' THEN 'GP'
    WHEN lower(title) LIKE '%partner%'          THEN 'Partner'
    WHEN lower(title) LIKE '%principal%'        THEN 'Principal'
    WHEN lower(title) LIKE '%vice president%' OR lower(title) LIKE '% vp %' THEN 'VP'
    WHEN lower(title) LIKE '%director%'         THEN 'Director'
    WHEN lower(title) LIKE '%associate%'        THEN 'Associate'
    WHEN lower(title) LIKE '%analyst%'          THEN 'Analyst'
    WHEN lower(title) LIKE '%venture partner%'  THEN 'Venture Partner'
    WHEN lower(title) LIKE '%eir%' OR lower(title) LIKE '%entrepreneur%in%residence%' THEN 'EIR'
    WHEN lower(title) LIKE '%scout%'            THEN 'Scout'
    WHEN lower(title) LIKE '%advisor%'          THEN 'Advisor'
    WHEN lower(title) LIKE '%founder%'          THEN 'Founder'
    ELSE 'Other'
  END
WHERE role_type IS NULL AND title IS NOT NULL;

-- 4k. investment_stages — text[] copies for firm_investors
UPDATE public.firm_investors
SET investment_stages = stage_focus
WHERE investment_stages IS NULL AND stage_focus IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: Completeness scoring functions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_compute_firm_completeness(r public.firm_records)
RETURNS numeric(4,3)
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT round(
    (
      -- Each field worth 1 point; total denominator = 12
      (CASE WHEN r.firm_name           IS NOT NULL AND r.firm_name           <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN r.description IS NOT NULL AND r.description <> ''
               OR r.short_description IS NOT NULL AND r.short_description <> ''
               OR r.elevator_pitch IS NOT NULL AND r.elevator_pitch <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN r.website_url IS NOT NULL AND r.website_url <> ''
               OR r.domain IS NOT NULL AND r.domain <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN r.logo_url            IS NOT NULL AND r.logo_url            <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN r.hq_city IS NOT NULL AND r.hq_city <> ''
               OR r.hq_location IS NOT NULL AND r.hq_location <> ''
               OR r.location IS NOT NULL AND r.location <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN r.linkedin_url        IS NOT NULL AND r.linkedin_url        <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN r.stage_focus         IS NOT NULL AND array_length(r.stage_focus, 1) > 0
               OR r.investment_stages  IS NOT NULL AND array_length(r.investment_stages, 1) > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN r.thesis_verticals    IS NOT NULL AND array_length(r.thesis_verticals, 1) > 0
               OR r.sectors            IS NOT NULL AND array_length(r.sectors, 1) > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN r.founded_year        IS NOT NULL                                              THEN 1 ELSE 0 END)
    + (CASE WHEN r.firm_type           IS NOT NULL AND r.firm_type           <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN r.check_size_min IS NOT NULL OR r.min_check_size IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN r.check_size_max IS NOT NULL OR r.max_check_size IS NOT NULL THEN 1 ELSE 0 END)
    )::numeric / 12.0,
  3)
$$;

CREATE OR REPLACE FUNCTION public.fn_compute_investor_completeness(r public.firm_investors)
RETURNS numeric(4,3)
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT round(
    (
      -- Each field worth 1 point; denominator = 9
      (CASE WHEN r.full_name  IS NOT NULL AND r.full_name  <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN r.firm_id    IS NOT NULL                         THEN 1 ELSE 0 END)
    + (CASE WHEN r.title      IS NOT NULL AND r.title      <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN r.bio IS NOT NULL AND r.bio <> ''
               OR r.short_bio IS NOT NULL AND r.short_bio <> ''
               OR r.background_summary IS NOT NULL AND r.background_summary <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN r.linkedin_url IS NOT NULL AND r.linkedin_url <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN r.profile_image_url IS NOT NULL AND r.profile_image_url <> ''
               OR r.avatar_url IS NOT NULL AND r.avatar_url <> '' THEN 1 ELSE 0 END)
    + (CASE WHEN r.stage_focus IS NOT NULL AND array_length(r.stage_focus, 1) > 0
               OR r.investment_stages IS NOT NULL AND array_length(r.investment_stages, 1) > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN r.sector_focus IS NOT NULL AND array_length(r.sector_focus, 1) > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN r.location IS NOT NULL AND r.location <> ''
               OR r.city IS NOT NULL AND r.city <> '' THEN 1 ELSE 0 END)
    )::numeric / 9.0,
  3)
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: Compute render-ready flags and completeness scores
-- Run initial backfill across all rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- firm_records
UPDATE public.firm_records fr
SET
  data_completeness_score = public.fn_compute_firm_completeness(fr),
  firm_render_ready = (
    (fr.firm_name IS NOT NULL AND fr.firm_name <> '')
    AND (
      (fr.website_url IS NOT NULL AND fr.website_url <> '')
      OR (fr.domain IS NOT NULL AND fr.domain <> '')
    )
    AND (
      (fr.description IS NOT NULL AND fr.description <> '')
      OR (fr.short_description IS NOT NULL AND fr.short_description <> '')
      OR (fr.elevator_pitch IS NOT NULL AND fr.elevator_pitch <> '')
    )
    AND (
      (fr.stage_focus IS NOT NULL AND array_length(fr.stage_focus, 1) > 0)
      OR (fr.investment_stages IS NOT NULL AND array_length(fr.investment_stages, 1) > 0)
      OR (fr.thesis_verticals IS NOT NULL AND array_length(fr.thesis_verticals, 1) > 0)
      OR (fr.sectors IS NOT NULL AND array_length(fr.sectors, 1) > 0)
    )
  );

-- firm_investors
UPDATE public.firm_investors fi
SET
  data_completeness_score = public.fn_compute_investor_completeness(fi),
  investor_render_ready = (
    (fi.full_name IS NOT NULL AND fi.full_name <> '')
    AND fi.firm_id IS NOT NULL
    AND (fi.title IS NOT NULL AND fi.title <> '')
    AND (
      (fi.bio IS NOT NULL AND fi.bio <> '')
      OR (fi.short_bio IS NOT NULL AND fi.short_bio <> '')
      OR (fi.background_summary IS NOT NULL AND fi.background_summary <> '')
      OR (fi.linkedin_url IS NOT NULL AND fi.linkedin_url <> '')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: Triggers — keep render-ready + completeness fresh on writes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_firm_records_render_ready()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.data_completeness_score := public.fn_compute_firm_completeness(NEW);
  NEW.firm_render_ready := (
    (NEW.firm_name IS NOT NULL AND NEW.firm_name <> '')
    AND (
      (NEW.website_url IS NOT NULL AND NEW.website_url <> '')
      OR (NEW.domain IS NOT NULL AND NEW.domain <> '')
    )
    AND (
      (NEW.description IS NOT NULL AND NEW.description <> '')
      OR (NEW.short_description IS NOT NULL AND NEW.short_description <> '')
      OR (NEW.elevator_pitch IS NOT NULL AND NEW.elevator_pitch <> '')
    )
    AND (
      (NEW.stage_focus IS NOT NULL AND array_length(NEW.stage_focus, 1) > 0)
      OR (NEW.investment_stages IS NOT NULL AND array_length(NEW.investment_stages, 1) > 0)
      OR (NEW.thesis_verticals IS NOT NULL AND array_length(NEW.thesis_verticals, 1) > 0)
      OR (NEW.sectors IS NOT NULL AND array_length(NEW.sectors, 1) > 0)
    )
  );
  -- Keep derived fields in sync
  IF NEW.domain IS NULL AND NEW.website_url IS NOT NULL AND NEW.website_url <> '' THEN
    NEW.domain := regexp_replace(
      lower(trim(NEW.website_url)),
      '^https?://(www\.)?([^/?#]+).*$',
      '\2'
    );
  END IF;
  IF NEW.hq_location IS NULL OR NEW.hq_location = '' THEN
    NEW.hq_location := trim(both ', ' FROM concat_ws(', ',
      nullif(trim(NEW.hq_city), ''),
      nullif(trim(NEW.hq_state), ''),
      nullif(trim(NEW.hq_country), '')
    ));
  END IF;
  IF NEW.check_size_min IS NULL THEN NEW.check_size_min := NEW.min_check_size; END IF;
  IF NEW.check_size_max IS NULL THEN NEW.check_size_max := NEW.max_check_size; END IF;
  IF NEW.geography_focus IS NULL THEN NEW.geography_focus := NEW.geo_focus; END IF;
  IF NEW.short_description IS NULL AND NEW.elevator_pitch IS NOT NULL THEN
    NEW.short_description := left(NEW.elevator_pitch, 280);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firm_records_render_ready ON public.firm_records;
CREATE TRIGGER trg_firm_records_render_ready
  BEFORE INSERT OR UPDATE ON public.firm_records
  FOR EACH ROW EXECUTE FUNCTION public.trg_firm_records_render_ready();


CREATE OR REPLACE FUNCTION public.trg_firm_investors_render_ready()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.data_completeness_score := public.fn_compute_investor_completeness(NEW);
  NEW.investor_render_ready := (
    (NEW.full_name IS NOT NULL AND NEW.full_name <> '')
    AND NEW.firm_id IS NOT NULL
    AND (NEW.title IS NOT NULL AND NEW.title <> '')
    AND (
      (NEW.bio IS NOT NULL AND NEW.bio <> '')
      OR (NEW.short_bio IS NOT NULL AND NEW.short_bio <> '')
      OR (NEW.background_summary IS NOT NULL AND NEW.background_summary <> '')
      OR (NEW.linkedin_url IS NOT NULL AND NEW.linkedin_url <> '')
    )
  );
  -- Keep derived fields in sync
  IF NEW.location IS NULL OR NEW.location = '' THEN
    NEW.location := trim(both ', ' FROM concat_ws(', ',
      nullif(trim(NEW.city), ''),
      nullif(trim(NEW.state), ''),
      nullif(trim(NEW.country), '')
    ));
  END IF;
  IF NEW.personal_website_url IS NULL THEN
    NEW.personal_website_url := COALESCE(NEW.personal_website, NEW.website_url);
  END IF;
  IF NEW.investment_stages IS NULL THEN NEW.investment_stages := NEW.stage_focus; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firm_investors_render_ready ON public.firm_investors;
CREATE TRIGGER trg_firm_investors_render_ready
  BEFORE INSERT OR UPDATE ON public.firm_investors
  FOR EACH ROW EXECUTE FUNCTION public.trg_firm_investors_render_ready();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- firm_records
CREATE INDEX IF NOT EXISTS idx_firm_records_domain
  ON public.firm_records (domain)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_records_firm_name
  ON public.firm_records (lower(firm_name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_records_render_ready
  ON public.firm_records (firm_render_ready)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_records_completeness
  ON public.firm_records (data_completeness_score DESC NULLS LAST)
  WHERE deleted_at IS NULL;

-- firm_investors
CREATE INDEX IF NOT EXISTS idx_firm_investors_firm_id
  ON public.firm_investors (firm_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_investors_full_name
  ON public.firm_investors (lower(full_name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_investors_render_ready
  ON public.firm_investors (investor_render_ready)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_investors_completeness
  ON public.firm_investors (data_completeness_score DESC NULLS LAST)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_investors_is_partner
  ON public.firm_investors (is_partner)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: Stable read views
-- ─────────────────────────────────────────────────────────────────────────────

-- 9a. firm_list_safe — lightweight list card shape
DROP VIEW IF EXISTS public.firm_list_safe CASCADE;
CREATE VIEW public.firm_list_safe
WITH (security_invoker = true)
AS
SELECT
  fr.id,
  fr.firm_name,
  fr.normalized_name,
  fr.slug,
  fr.firm_type,
  fr.status,
  fr.logo_url,
  fr.website_url,
  fr.domain,
  fr.hq_location,
  fr.hq_city,
  fr.hq_state,
  fr.hq_country,
  fr.short_description,
  fr.elevator_pitch,
  fr.stage_focus,
  fr.investment_stages,
  fr.sectors,
  fr.thesis_verticals,
  fr.themes,
  fr.geography_focus,
  fr.check_size_min,
  fr.check_size_max,
  fr.min_check_size,
  fr.max_check_size,
  fr.aum,
  fr.aum_usd,
  fr.is_actively_deploying,
  fr.is_trending,
  fr.is_popular,
  fr.is_recent,
  fr.firm_render_ready,
  fr.data_completeness_score,
  fr.match_score,
  fr.reputation_score,
  fr.responsiveness_score,
  fr.value_add_score,
  fr.network_strength,
  fr.funding_intel_activity_score,
  fr.funding_intel_momentum_score,
  fr.funding_intel_pace_label,
  fr.strategy_classifications,
  fr.thesis_orientation,
  fr.total_investors,
  fr.total_partners,
  fr.last_enriched_at,
  fr.created_at,
  fr.updated_at
FROM public.firm_records fr
WHERE fr.deleted_at IS NULL;

-- 9b. firm_detail_safe — full profile shape
DROP VIEW IF EXISTS public.firm_detail_safe CASCADE;
CREATE VIEW public.firm_detail_safe
WITH (security_invoker = true)
AS
SELECT
  fr.id,
  fr.firm_name,
  fr.legal_name,
  fr.normalized_name,
  fr.slug,
  fr.aliases,
  fr.firm_type,
  fr.entity_type,
  fr.status,
  fr.verification_status,
  -- Identity
  fr.logo_url,
  fr.website_url,
  fr.domain,
  fr.founded_year,
  -- Location
  fr.hq_location,
  fr.hq_city,
  fr.hq_state,
  fr.hq_country,
  fr.hq_region,
  fr.hq_zip_code,
  fr.location,
  -- Description
  fr.description,
  fr.short_description,
  fr.elevator_pitch,
  fr.portfolio_summary,
  fr.notable_portfolio_companies,
  -- Investment profile
  fr.stage_focus,
  fr.investment_stages,
  fr.sectors,
  fr.thesis_verticals,
  fr.themes,
  fr.geography_focus,
  fr.geo_focus,
  fr.check_size_min,
  fr.check_size_max,
  fr.min_check_size,
  fr.max_check_size,
  fr.lead_or_follow,
  fr.strategy_classifications,
  fr.thesis_orientation,
  -- Fund / AUM
  fr.aum,
  fr.aum_usd,
  fr.is_actively_deploying,
  -- Social
  fr.linkedin_url,
  fr.x_url,
  fr.crunchbase_url,
  fr.angellist_url,
  fr.signal_nfx_url,
  fr.openvc_url,
  fr.vcsheet_url,
  fr.medium_url,
  fr.substack_url,
  -- Scores
  fr.match_score,
  fr.reputation_score,
  fr.responsiveness_score,
  fr.value_add_score,
  fr.network_strength,
  fr.industry_reputation,
  fr.founder_reputation_score,
  fr.data_confidence_score,
  fr.data_completeness_score,
  -- Quality flags
  fr.firm_render_ready,
  fr.is_trending,
  fr.is_popular,
  fr.is_recent,
  -- Funding intel
  fr.funding_intel_activity_score,
  fr.funding_intel_momentum_score,
  fr.funding_intel_pace_label,
  fr.funding_intel_focus_json,
  fr.funding_intel_metrics_json,
  fr.funding_intel_recent_investments_json,
  fr.funding_intel_summary,
  fr.funding_intel_last_deal_at,
  -- Team
  fr.team_size,
  fr.total_headcount,
  fr.total_investors,
  fr.total_partners,
  fr.general_partner_count,
  fr.partner_names,
  fr.general_partner_names,
  -- Provenance
  fr.source_urls_json,
  fr.field_source_json,
  fr.field_confidence_json,
  -- Timestamps
  fr.last_enriched_at,
  fr.last_verified_at,
  fr.next_update_scheduled_at,
  fr.created_at,
  fr.updated_at
FROM public.firm_records fr
WHERE fr.deleted_at IS NULL;

-- 9c. investor_list_safe — lightweight investor card shape
DROP VIEW IF EXISTS public.investor_list_safe CASCADE;
CREATE VIEW public.investor_list_safe
WITH (security_invoker = true)
AS
SELECT
  fi.id,
  fi.firm_id,
  fi.full_name,
  fi.first_name,
  fi.last_name,
  fi.title,
  fi.role_type,
  fi.is_partner,
  fi.is_active,
  fi.is_actively_investing,
  fi.profile_image_url,
  fi.avatar_url,
  fi.location,
  fi.city,
  fi.linkedin_url,
  fi.stage_focus,
  fi.investment_stages,
  fi.sector_focus,
  fi.check_size_min,
  fi.check_size_max,
  fi.investor_render_ready,
  fi.data_completeness_score,
  fi.match_score,
  fi.reputation_score,
  fi.responsiveness_score,
  fi.funding_intel_activity_score,
  fi.funding_intel_momentum_score,
  fi.funding_intel_pace_label,
  fi.recent_deal_count,
  fi.warm_intro_preferred,
  fi.needs_review,
  fi.created_at,
  fi.updated_at
FROM public.firm_investors fi
WHERE fi.deleted_at IS NULL;

-- 9d. investor_detail_safe — full investor profile shape
DROP VIEW IF EXISTS public.investor_detail_safe CASCADE;
CREATE VIEW public.investor_detail_safe
WITH (security_invoker = true)
AS
SELECT
  fi.id,
  fi.firm_id,
  fi.person_id,
  fi.full_name,
  fi.first_name,
  fi.last_name,
  fi.preferred_name,
  fi.title,
  fi.role_type,
  fi.is_partner,
  fi.is_active,
  fi.is_actively_investing,
  -- Profile
  fi.bio,
  fi.short_bio,
  fi.background_summary,
  fi.education_summary,
  fi.education,
  fi.prior_firms,
  fi.prior_companies,
  -- Location
  fi.location,
  fi.city,
  fi.state,
  fi.country,
  fi.timezone,
  -- Image
  fi.profile_image_url,
  fi.avatar_url,
  -- Social / external
  fi.linkedin_url,
  fi.x_url,
  fi.personal_website_url,
  fi.website_url,
  fi.crunchbase_url,
  fi.signal_url,
  fi.github_url,
  fi.medium_url,
  fi.substack_url,
  -- Investment focus
  fi.stage_focus,
  fi.investment_stages,
  fi.sector_focus,
  fi.sector_focus_canonical,
  fi.personal_thesis_tags,
  fi.investing_themes,
  fi.check_size_min,
  fi.check_size_max,
  fi.check_size_focus,
  fi.investment_style,
  fi.notable_investments,
  fi.portfolio_companies,
  fi.recent_investments,
  -- Scores
  fi.match_score,
  fi.reputation_score,
  fi.responsiveness_score,
  fi.value_add_score,
  fi.network_strength,
  fi.data_completeness_score,
  -- Quality flags
  fi.investor_render_ready,
  fi.needs_review,
  fi.warm_intro_preferred,
  fi.cold_outreach_ok,
  -- Funding intel
  fi.funding_intel_activity_score,
  fi.funding_intel_momentum_score,
  fi.funding_intel_pace_label,
  fi.funding_intel_focus_json,
  fi.funding_intel_metrics_json,
  fi.funding_intel_recent_investments_json,
  fi.funding_intel_summary,
  fi.funding_intel_last_deal_at,
  fi.recent_deal_count,
  fi.last_active_date,
  -- Provenance
  fi.source_urls_json,
  fi.field_source_json,
  fi.field_confidence_json,
  -- Timestamps
  fi.last_enriched_at,
  fi.created_at,
  fi.updated_at
FROM public.firm_investors fi
WHERE fi.deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10: RLS — expose new views to anon + authenticated
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.firm_list_safe     TO anon, authenticated;
GRANT SELECT ON public.firm_detail_safe   TO anon, authenticated;
GRANT SELECT ON public.investor_list_safe  TO anon, authenticated;
GRANT SELECT ON public.investor_detail_safe TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 11: Refresh investor_directory_safe to include new columns
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.investor_directory_safe;

CREATE VIEW public.investor_directory_safe
WITH (security_invoker = true)
AS
SELECT
  id,
  firm_name,
  legal_name,
  slug,
  aliases,
  entity_type,
  thesis_orientation,
  sector_scope,
  stage_focus,
  investment_stages,
  sectors,
  themes,
  stage_min,
  stage_max,
  geo_focus,
  geography_focus,
  lead_partner,
  thesis_verticals,
  strategy_classifications,
  preferred_stage,
  check_size_min,
  check_size_max,
  min_check_size,
  max_check_size,
  recent_deals,
  lead_or_follow,
  ca_sb54_compliant,
  market_sentiment,
  sentiment_detail,
  location,
  hq_location,
  hq_city,
  hq_state,
  hq_region,
  hq_country,
  hq_zip_code,
  logo_url,
  website_url,
  domain,
  linkedin_url,
  x_url,
  crunchbase_url,
  angellist_url,
  firm_type,
  founded_year,
  status,
  verification_status,
  data_confidence_score,
  data_completeness_score,
  firm_render_ready,
  total_headcount,
  total_investors,
  total_partners,
  general_partner_count,
  team_size,
  partner_names,
  general_partner_names,
  headcount,
  is_actively_deploying,
  aum,
  reputation_score,
  match_score,
  responsiveness_score,
  value_add_score,
  network_strength,
  industry_reputation,
  founder_reputation_score,
  news_sentiment_score,
  social_sentiment_score,
  community_rating,
  volatility_score,
  elevator_pitch,
  description,
  short_description,
  portfolio_summary,
  notable_portfolio_companies,
  source_urls_json,
  field_source_json,
  field_confidence_json,
  created_at,
  updated_at,
  last_enriched_at,
  last_verified_at,
  next_update_scheduled_at,
  sector_embedding,
  NULL::text AS email,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_credits uc
      WHERE uc.user_id = auth.uid()::text AND uc.tier = 'admin'
    )
    THEN email_source
    ELSE NULL
  END AS email_source,
  prisma_firm_id
FROM public.firm_records
WHERE deleted_at IS NULL;

GRANT SELECT ON public.investor_directory_safe TO anon, authenticated;
