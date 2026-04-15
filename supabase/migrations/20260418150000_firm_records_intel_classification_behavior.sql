-- =============================================================================
-- MIGRATION: firm_records intel — classification, behavior, sourcing, join tags
-- DATE:      2026-04-18
-- PURPOSE:   Additive enums, firm_records columns, multi-select join tables, and
--            indexes for venture firm intelligence. Idempotent (safe re-run).
-- NOTES:     See header comments for intentional renames vs existing columns/types.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. ENUM types (idempotent; names chosen to avoid collisions with existing types)
--     Existing: public.fund_status_enum = fund vehicle lifecycle on fund_records
--               ('active','closed','forming','winding_down').
--     New:       public.firm_fund_program_status_enum = sponsor-level program
--               state (raising / deploying / …) for firm_records.
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.stage_classification_enum AS ENUM (
    'multi_stage',
    'early_stage',
    'growth',
    'buyout'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.structure_classification_enum AS ENUM (
    'partnership',
    'solo_gp',
    'syndicate',
    'cvc',
    'family_office',
    'private_equity'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.theme_classification_enum AS ENUM (
    'generalist',
    'theme_driven',
    'multi_theme'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.sector_classification_enum AS ENUM (
    'generalist',
    'sector_focused',
    'multi_sector'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.impact_orientation_enum AS ENUM (
    'primary',
    'integrated',
    'considered',
    'none'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.lead_behavior_enum AS ENUM (
    'lead',
    'co_lead',
    'follow',
    'flexible'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.decision_speed_enum AS ENUM (
    'fast',
    'medium',
    'slow'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.decision_model_enum AS ENUM (
    'single_partner',
    'consensus',
    'ic',
    'unclear'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Firm-level investing / fundraising program state (NOT fund_records.fund_status_enum).
DO $$ BEGIN
  CREATE TYPE public.firm_fund_program_status_enum AS ENUM (
    'raising',
    'recently_raised',
    'deploying',
    'harvesting',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.pitch_policy_enum AS ENUM (
    'warm_intro',
    'open_inbound',
    'application_form',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.firm_tag_strength_enum AS ENUM (
    'primary',
    'secondary',
    'opportunistic'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 1. firm_records — new columns (all IF NOT EXISTS; skip renames of legacy cols)
-- -----------------------------------------------------------------------------

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS stage_classification public.stage_classification_enum,
  ADD COLUMN IF NOT EXISTS structure_classification public.structure_classification_enum,
  ADD COLUMN IF NOT EXISTS theme_classification public.theme_classification_enum,
  ADD COLUMN IF NOT EXISTS sector_classification public.sector_classification_enum,
  ADD COLUMN IF NOT EXISTS impact_orientation public.impact_orientation_enum,
  ADD COLUMN IF NOT EXISTS lead_behavior public.lead_behavior_enum,
  ADD COLUMN IF NOT EXISTS decision_speed public.decision_speed_enum,
  ADD COLUMN IF NOT EXISTS decision_model public.decision_model_enum,
  ADD COLUMN IF NOT EXISTS last_investment_date date,
  ADD COLUMN IF NOT EXISTS investments_last_12mo integer,
  ADD COLUMN IF NOT EXISTS leads_last_12mo integer,
  -- See NOTE above: cannot reuse name fund_status (text column exists) or type fund_status_enum.
  ADD COLUMN IF NOT EXISTS fund_program_status public.firm_fund_program_status_enum,
  ADD COLUMN IF NOT EXISTS traction_expectation text,
  ADD COLUMN IF NOT EXISTS works_with_first_time_founders text,
  ADD COLUMN IF NOT EXISTS active_geo_focus text[],
  ADD COLUMN IF NOT EXISTS pitch_policy public.pitch_policy_enum,
  ADD COLUMN IF NOT EXISTS has_open_submission_form boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submission_url text,
  ADD COLUMN IF NOT EXISTS source_primary text,
  ADD COLUMN IF NOT EXISTS source_last_verified_at timestamptz,
  -- firm_records.data_confidence_score already exists (integer). New numeric lane for intel block.
  ADD COLUMN IF NOT EXISTS intel_confidence_score numeric(8,4),
  ADD COLUMN IF NOT EXISTS manual_review_status text,
  ADD COLUMN IF NOT EXISTS domain text;

-- URL expansions (only columns that are not already present under these names)
ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS cbinsights_url text,
  ADD COLUMN IF NOT EXISTS pitchbook_url text,
  ADD COLUMN IF NOT EXISTS startups_gallery_url text,
  ADD COLUMN IF NOT EXISTS wellfound_url text,
  ADD COLUMN IF NOT EXISTS blog_url text;

-- slug, tracxn_url, signal_nfx_url, openvc_url, vcsheet_url, angellist_url,
-- medium_url, substack_url already exist on firm_records — not re-added.

COMMENT ON COLUMN public.firm_records.fund_program_status IS
  'Sponsor-level fund program state (raising/deploying/…). Distinct from fund_records.fund_status_enum and legacy firm_records.fund_status (free text).';

COMMENT ON COLUMN public.firm_records.intel_confidence_score IS
  'Optional confidence score for structured intel fields (scale chosen by product, e.g. 0–1 or 0–100). Legacy overall score remains data_confidence_score (integer).';

COMMENT ON COLUMN public.firm_records.source_last_verified_at IS
  'When primary intel source was last verified for structured classification fields; distinct from last_verified_at if used elsewhere.';

-- Deprecation markers (columns retained; consumers should migrate gradually)
COMMENT ON COLUMN public.firm_records.firm_type IS
  'DEPRECATED for structure: prefer structure_classification (enum). Kept for backward compatibility with imports and APIs.';

COMMENT ON COLUMN public.firm_records.thesis_orientation IS
  'DEPRECATED for high-level theme bucket: prefer theme_classification (enum) plus firm_theme_tags. Kept for legacy UI and migrations.';

COMMENT ON COLUMN public.firm_records.sector_scope IS
  'DEPRECATED for sector bucket: prefer sector_classification (enum) plus firm_sector_tags. Kept for legacy queries.';

-- -----------------------------------------------------------------------------
-- 2. Join tables — multi-select / normalized tags
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.firm_initial_stages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id    uuid NOT NULL REFERENCES public.firm_records (id) ON DELETE CASCADE,
  stage      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firm_initial_stages_stage_nonempty CHECK (length(trim(stage)) > 0)
);

CREATE TABLE IF NOT EXISTS public.firm_follow_on_stages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id    uuid NOT NULL REFERENCES public.firm_records (id) ON DELETE CASCADE,
  stage      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firm_follow_on_stages_stage_nonempty CHECK (length(trim(stage)) > 0)
);

CREATE TABLE IF NOT EXISTS public.firm_theme_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id    uuid NOT NULL REFERENCES public.firm_records (id) ON DELETE CASCADE,
  tag        text NOT NULL,
  strength   public.firm_tag_strength_enum,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firm_theme_tags_tag_nonempty CHECK (length(trim(tag)) > 0)
);

CREATE TABLE IF NOT EXISTS public.firm_sector_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id    uuid NOT NULL REFERENCES public.firm_records (id) ON DELETE CASCADE,
  tag        text NOT NULL,
  strength   public.firm_tag_strength_enum,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firm_sector_tags_tag_nonempty CHECK (length(trim(tag)) > 0)
);

CREATE TABLE IF NOT EXISTS public.firm_value_add (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id    uuid NOT NULL REFERENCES public.firm_records (id) ON DELETE CASCADE,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firm_value_add_value_nonempty CHECK (length(trim(value)) > 0)
);

-- -----------------------------------------------------------------------------
-- 3. Indexes — firm_records classification filters
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_firm_stage_classification
  ON public.firm_records (stage_classification)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_structure
  ON public.firm_records (structure_classification)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_theme
  ON public.firm_records (theme_classification)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_sector
  ON public.firm_records (sector_classification)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_impact
  ON public.firm_records (impact_orientation)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_lead_behavior
  ON public.firm_records (lead_behavior)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_decision_speed
  ON public.firm_records (decision_speed)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_fund_program_status
  ON public.firm_records (fund_program_status)
  WHERE deleted_at IS NULL;

-- Join table lookup indexes
CREATE INDEX IF NOT EXISTS idx_firm_initial_stages_firm_id ON public.firm_initial_stages (firm_id);
CREATE INDEX IF NOT EXISTS idx_firm_follow_on_stages_firm_id ON public.firm_follow_on_stages (firm_id);
CREATE INDEX IF NOT EXISTS idx_firm_theme_tags_firm_id ON public.firm_theme_tags (firm_id);
CREATE INDEX IF NOT EXISTS idx_firm_theme_tags_tag_lower ON public.firm_theme_tags (lower(tag));
CREATE INDEX IF NOT EXISTS idx_firm_sector_tags_firm_id ON public.firm_sector_tags (firm_id);
CREATE INDEX IF NOT EXISTS idx_firm_sector_tags_tag_lower ON public.firm_sector_tags (lower(tag));
CREATE INDEX IF NOT EXISTS idx_firm_value_add_firm_id ON public.firm_value_add (firm_id);

-- Dedup / upsert helpers (partial unique: one row per firm per normalized stage/tag)
CREATE UNIQUE INDEX IF NOT EXISTS firm_initial_stages_firm_stage_key
  ON public.firm_initial_stages (firm_id, lower(trim(stage)));

CREATE UNIQUE INDEX IF NOT EXISTS firm_follow_on_stages_firm_stage_key
  ON public.firm_follow_on_stages (firm_id, lower(trim(stage)));

CREATE UNIQUE INDEX IF NOT EXISTS firm_theme_tags_firm_tag_key
  ON public.firm_theme_tags (firm_id, lower(trim(tag)));

CREATE UNIQUE INDEX IF NOT EXISTS firm_sector_tags_firm_tag_key
  ON public.firm_sector_tags (firm_id, lower(trim(tag)));

CREATE UNIQUE INDEX IF NOT EXISTS firm_value_add_firm_value_key
  ON public.firm_value_add (firm_id, lower(trim(value)));

CREATE INDEX IF NOT EXISTS idx_firm_records_domain
  ON public.firm_records (domain)
  WHERE deleted_at IS NULL AND domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_firm_records_pitch_policy
  ON public.firm_records (pitch_policy)
  WHERE deleted_at IS NULL;

-- GIN for active geo arrays (filtering)
CREATE INDEX IF NOT EXISTS idx_firm_records_active_geo_focus_gin
  ON public.firm_records USING GIN (active_geo_focus)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 4. RLS — read paths aligned with public firm directory
-- -----------------------------------------------------------------------------

ALTER TABLE public.firm_initial_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_follow_on_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_theme_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_sector_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_value_add ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS firm_initial_stages_select_public ON public.firm_initial_stages;
CREATE POLICY firm_initial_stages_select_public
  ON public.firm_initial_stages FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.firm_records fr
      WHERE fr.id = firm_id AND fr.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS firm_follow_on_stages_select_public ON public.firm_follow_on_stages;
CREATE POLICY firm_follow_on_stages_select_public
  ON public.firm_follow_on_stages FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.firm_records fr
      WHERE fr.id = firm_id AND fr.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS firm_theme_tags_select_public ON public.firm_theme_tags;
CREATE POLICY firm_theme_tags_select_public
  ON public.firm_theme_tags FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.firm_records fr
      WHERE fr.id = firm_id AND fr.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS firm_sector_tags_select_public ON public.firm_sector_tags;
CREATE POLICY firm_sector_tags_select_public
  ON public.firm_sector_tags FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.firm_records fr
      WHERE fr.id = firm_id AND fr.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS firm_value_add_select_public ON public.firm_value_add;
CREATE POLICY firm_value_add_select_public
  ON public.firm_value_add FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.firm_records fr
      WHERE fr.id = firm_id AND fr.deleted_at IS NULL
    )
  );

-- Service role / backend writers typically bypass RLS; optional authenticated writes:
DROP POLICY IF EXISTS firm_initial_stages_insert_auth ON public.firm_initial_stages;
CREATE POLICY firm_initial_stages_insert_auth
  ON public.firm_initial_stages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_initial_stages_update_auth ON public.firm_initial_stages;
CREATE POLICY firm_initial_stages_update_auth
  ON public.firm_initial_stages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_initial_stages_delete_auth ON public.firm_initial_stages;
CREATE POLICY firm_initial_stages_delete_auth
  ON public.firm_initial_stages FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_follow_on_stages_insert_auth ON public.firm_follow_on_stages;
CREATE POLICY firm_follow_on_stages_insert_auth
  ON public.firm_follow_on_stages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_follow_on_stages_update_auth ON public.firm_follow_on_stages;
CREATE POLICY firm_follow_on_stages_update_auth
  ON public.firm_follow_on_stages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_follow_on_stages_delete_auth ON public.firm_follow_on_stages;
CREATE POLICY firm_follow_on_stages_delete_auth
  ON public.firm_follow_on_stages FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_theme_tags_insert_auth ON public.firm_theme_tags;
CREATE POLICY firm_theme_tags_insert_auth
  ON public.firm_theme_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_theme_tags_update_auth ON public.firm_theme_tags;
CREATE POLICY firm_theme_tags_update_auth
  ON public.firm_theme_tags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_theme_tags_delete_auth ON public.firm_theme_tags;
CREATE POLICY firm_theme_tags_delete_auth
  ON public.firm_theme_tags FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_sector_tags_insert_auth ON public.firm_sector_tags;
CREATE POLICY firm_sector_tags_insert_auth
  ON public.firm_sector_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_sector_tags_update_auth ON public.firm_sector_tags;
CREATE POLICY firm_sector_tags_update_auth
  ON public.firm_sector_tags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_sector_tags_delete_auth ON public.firm_sector_tags;
CREATE POLICY firm_sector_tags_delete_auth
  ON public.firm_sector_tags FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_value_add_insert_auth ON public.firm_value_add;
CREATE POLICY firm_value_add_insert_auth
  ON public.firm_value_add FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_value_add_update_auth ON public.firm_value_add;
CREATE POLICY firm_value_add_update_auth
  ON public.firm_value_add FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );

DROP POLICY IF EXISTS firm_value_add_delete_auth ON public.firm_value_add;
CREATE POLICY firm_value_add_delete_auth
  ON public.firm_value_add FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.firm_records fr WHERE fr.id = firm_id)
  );
