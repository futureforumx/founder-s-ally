-- =============================================================================
-- Migration: Rename investor_database → firm_records
-- + New enums: entity_type, thesis_orientation, stage_focus
-- + New fields: region, zip_code, sector_scope, stage_min, stage_max
-- + Deduplication of firm records
-- + Schema constraints
-- =============================================================================

-- --------------------------------------------------------
-- 0. Create ENUM types (idempotent: may already exist on remote)
-- --------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.entity_type AS ENUM (
    'Institutional',
    'Micro',
    'Solo GP',
    'Angel',
    'Corporate (CVC)',
    'Family Office',
    'Accelerator / Studio',
    'Syndicate',
    'Fund of Funds'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.thesis_orientation AS ENUM (
    'Generalist',
    'Sector-Focused',
    'Thesis-Driven',
    'Founder-First',
    'Geographic',
    'Operator-led'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.stage_focus_enum AS ENUM (
    'Friends and Family',
    'Pre-Seed',
    'Seed',
    'Series A',
    'Series B+',
    'Growth'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.sector_scope_enum AS ENUM (
    'Generalist',
    'Specialized'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.us_region AS ENUM (
    'West',
    'East',
    'South',
    'Midwest',
    'Southwest',
    'Southeast',
    'Northeast',
    'Northwest',
    'International'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------
-- 1. Deduplicate investor_database BEFORE rename
--    Keep the most recently enriched / most complete record
-- --------------------------------------------------------

-- Mark duplicates for soft-delete (keep the "best" row per LOWER(firm_name))
WITH ranked AS (
  SELECT
    id,
    firm_name,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(firm_name))
      ORDER BY
        last_enriched_at DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST
    ) AS rn
  FROM public.investor_database
  WHERE deleted_at IS NULL
)
UPDATE public.investor_database
SET deleted_at = NOW()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Re-point orphaned investor_partners to the surviving firm record
WITH survivors AS (
  SELECT
    id AS survivor_id,
    LOWER(TRIM(firm_name)) AS norm_name
  FROM public.investor_database
  WHERE deleted_at IS NULL
),
dead AS (
  SELECT
    id AS dead_id,
    LOWER(TRIM(firm_name)) AS norm_name
  FROM public.investor_database
  WHERE deleted_at IS NOT NULL
)
UPDATE public.investor_partners ip
SET firm_id = s.survivor_id
FROM dead d
JOIN survivors s ON s.norm_name = d.norm_name
WHERE ip.firm_id = d.dead_id;

-- --------------------------------------------------------
-- 2. Add new columns BEFORE rename (easier with existing name)
-- --------------------------------------------------------

-- Typed entity_type column (will migrate from text firm_type)
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS entity_type public.entity_type DEFAULT NULL;

-- Thesis orientation
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS thesis_orientation public.thesis_orientation DEFAULT NULL;

-- Sector scope (generalist vs specialized)
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS sector_scope public.sector_scope_enum DEFAULT NULL;

-- Stage focus as typed enum array
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS stage_focus public.stage_focus_enum[] DEFAULT '{}';

-- Stage range (min/max)
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS stage_min public.stage_focus_enum DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stage_max public.stage_focus_enum DEFAULT NULL;

-- Geographic region
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS hq_region public.us_region DEFAULT NULL;

-- Zip code
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS hq_zip_code text DEFAULT NULL;

-- Geo focus (text array for target geographies)
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS geo_focus text[] DEFAULT '{}';

-- --------------------------------------------------------
-- 3. Migrate existing text firm_type → typed entity_type
-- --------------------------------------------------------
UPDATE public.investor_database SET entity_type =
  CASE LOWER(TRIM(COALESCE(firm_type, '')))
    WHEN 'vc'              THEN 'Institutional'::public.entity_type
    WHEN 'institutional'   THEN 'Institutional'::public.entity_type
    WHEN 'micro_fund'      THEN 'Micro'::public.entity_type
    WHEN 'micro'           THEN 'Micro'::public.entity_type
    WHEN 'solo gp'         THEN 'Solo GP'::public.entity_type
    WHEN 'angel'           THEN 'Angel'::public.entity_type
    WHEN 'angel_network'   THEN 'Angel'::public.entity_type
    WHEN 'cvc'             THEN 'Corporate (CVC)'::public.entity_type
    WHEN 'corporate (cvc)' THEN 'Corporate (CVC)'::public.entity_type
    WHEN 'family_office'   THEN 'Family Office'::public.entity_type
    WHEN 'family office'   THEN 'Family Office'::public.entity_type
    WHEN 'accelerator'     THEN 'Accelerator / Studio'::public.entity_type
    WHEN 'pe'              THEN 'Institutional'::public.entity_type
    WHEN 'syndicate'       THEN 'Syndicate'::public.entity_type
    WHEN 'fund of funds'   THEN 'Fund of Funds'::public.entity_type
    ELSE NULL
  END
WHERE deleted_at IS NULL;

-- --------------------------------------------------------
-- 4. Migrate preferred_stage text → stage_focus enum array + range
-- --------------------------------------------------------
UPDATE public.investor_database SET stage_focus =
  ARRAY(
    SELECT unnest::public.stage_focus_enum FROM (
      SELECT unnest(
        CASE
          WHEN LOWER(preferred_stage) LIKE '%friends%'    THEN ARRAY['Friends and Family']
          WHEN LOWER(preferred_stage) LIKE '%pre-seed%'   THEN ARRAY['Pre-Seed']
          WHEN LOWER(preferred_stage) LIKE '%pre_seed%'   THEN ARRAY['Pre-Seed']
          WHEN LOWER(preferred_stage) LIKE '%seed%'       THEN ARRAY['Seed']
          WHEN LOWER(preferred_stage) LIKE '%series a%'   THEN ARRAY['Series A']
          WHEN LOWER(preferred_stage) LIKE '%series b%'   THEN ARRAY['Series B+']
          WHEN LOWER(preferred_stage) LIKE '%growth%'     THEN ARRAY['Growth']
          ELSE ARRAY[]::text[]
        END
      )
    ) sub
  )
WHERE deleted_at IS NULL AND preferred_stage IS NOT NULL;

-- Set stage_min and stage_max from stage_focus array
-- Uses the ordinal position of the enum to determine min/max
UPDATE public.investor_database SET
  stage_min = (
    SELECT MIN(val) FROM unnest(stage_focus) AS val
  ),
  stage_max = (
    SELECT MAX(val) FROM unnest(stage_focus) AS val
  )
WHERE deleted_at IS NULL AND array_length(stage_focus, 1) > 0;

-- --------------------------------------------------------
-- 5. Derive sector_scope from thesis_verticals
-- --------------------------------------------------------
UPDATE public.investor_database SET sector_scope =
  CASE
    WHEN thesis_verticals IS NULL OR thesis_verticals = '{}' THEN NULL
    WHEN array_length(thesis_verticals, 1) >= 5 THEN 'Generalist'::public.sector_scope_enum
    ELSE 'Specialized'::public.sector_scope_enum
  END
WHERE deleted_at IS NULL;

-- --------------------------------------------------------
-- 6. Derive hq_region from hq_state
-- --------------------------------------------------------
UPDATE public.investor_database SET hq_region =
  CASE
    WHEN hq_state IN ('WA', 'OR', 'CA', 'NV', 'HI', 'AK', 'ID', 'MT', 'WY', 'CO', 'UT')
      THEN 'West'::public.us_region
    WHEN hq_state IN ('NY', 'NJ', 'CT', 'MA', 'RI', 'NH', 'VT', 'ME', 'PA', 'DE', 'MD', 'DC')
      THEN 'East'::public.us_region
    WHEN hq_state IN ('TX', 'OK', 'AR', 'LA', 'MS', 'AL', 'TN', 'KY', 'WV', 'VA', 'NC', 'SC', 'GA', 'FL')
      THEN 'South'::public.us_region
    WHEN hq_state IN ('OH', 'MI', 'IN', 'IL', 'WI', 'MN', 'IA', 'MO', 'ND', 'SD', 'NE', 'KS')
      THEN 'Midwest'::public.us_region
    WHEN hq_country IS NOT NULL AND hq_country != 'US' AND hq_country != 'USA'
      THEN 'International'::public.us_region
    ELSE NULL
  END
WHERE deleted_at IS NULL;

-- --------------------------------------------------------
-- 7. RENAME the table
-- --------------------------------------------------------
ALTER TABLE public.investor_database RENAME TO firm_records;

-- Rename indexes to match new table name
ALTER INDEX IF EXISTS idx_investor_database_prisma_firm_id RENAME TO idx_firm_records_prisma_firm_id;
ALTER INDEX IF EXISTS idx_investor_database_hq RENAME TO idx_firm_records_hq;
ALTER INDEX IF EXISTS idx_investor_database_match_score RENAME TO idx_firm_records_match_score;
ALTER INDEX IF EXISTS idx_investor_database_deleted_at RENAME TO idx_firm_records_deleted_at;

-- New indexes for new columns
CREATE INDEX IF NOT EXISTS idx_firm_records_entity_type
  ON public.firm_records (entity_type);

CREATE INDEX IF NOT EXISTS idx_firm_records_thesis_orientation
  ON public.firm_records (thesis_orientation);

CREATE INDEX IF NOT EXISTS idx_firm_records_stage_focus
  ON public.firm_records USING GIN (stage_focus);

CREATE INDEX IF NOT EXISTS idx_firm_records_hq_region
  ON public.firm_records (hq_region);

CREATE INDEX IF NOT EXISTS idx_firm_records_hq_zip_code
  ON public.firm_records (hq_zip_code);

-- Case-insensitive unique on firm_name for non-deleted records
CREATE UNIQUE INDEX IF NOT EXISTS idx_firm_records_unique_firm_name
  ON public.firm_records (LOWER(TRIM(firm_name)))
  WHERE deleted_at IS NULL;

-- --------------------------------------------------------
-- 8. Update foreign key on investor_partners
--    (FK automatically follows table rename, but let's verify the constraint)
-- --------------------------------------------------------

-- Ensure investor_partners.firm_id references the renamed table
-- The FK constraint follows the rename automatically in Postgres,
-- but let's add it if it doesn't exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'investor_partners_firm_id_fkey'
      AND table_name = 'investor_partners'
  ) THEN
    ALTER TABLE public.investor_partners
      ADD CONSTRAINT investor_partners_firm_id_fkey
      FOREIGN KEY (firm_id) REFERENCES public.firm_records(id);
  END IF;
END $$;

-- --------------------------------------------------------
-- 9. Clamp scores and fix data BEFORE adding constraints
-- --------------------------------------------------------

-- Clamp scores to 0-100 range
UPDATE public.firm_records SET
  match_score = LEAST(GREATEST(match_score, 0), 100),
  reputation_score = LEAST(GREATEST(reputation_score, 0), 100),
  responsiveness_score = LEAST(GREATEST(responsiveness_score, 0), 100),
  value_add_score = LEAST(GREATEST(value_add_score, 0), 100),
  network_strength = LEAST(GREATEST(network_strength, 0), 100)
WHERE match_score IS NOT NULL
   OR reputation_score IS NOT NULL
   OR responsiveness_score IS NOT NULL
   OR value_add_score IS NOT NULL
   OR network_strength IS NOT NULL;

-- Fix inverted check sizes
UPDATE public.firm_records
SET min_check_size = max_check_size, max_check_size = min_check_size
WHERE min_check_size > max_check_size;

-- Now add CHECK constraints (data is already clean)
ALTER TABLE public.firm_records
  ADD CONSTRAINT chk_fr_match_score CHECK (match_score BETWEEN 0 AND 100),
  ADD CONSTRAINT chk_fr_reputation_score CHECK (reputation_score BETWEEN 0 AND 100),
  ADD CONSTRAINT chk_fr_responsiveness_score CHECK (responsiveness_score BETWEEN 0 AND 100),
  ADD CONSTRAINT chk_fr_value_add_score CHECK (value_add_score BETWEEN 0 AND 100),
  ADD CONSTRAINT chk_fr_network_strength CHECK (network_strength BETWEEN 0 AND 100);

ALTER TABLE public.firm_records
  ADD CONSTRAINT chk_fr_check_size_range CHECK (min_check_size <= max_check_size);

-- Founded year range
ALTER TABLE public.firm_records
  ADD CONSTRAINT chk_fr_founded_year CHECK (founded_year BETWEEN 1900 AND 2026);

-- --------------------------------------------------------
-- 10. updated_at trigger
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_firm_records_updated_at ON public.firm_records;
CREATE TRIGGER trg_firm_records_updated_at
  BEFORE UPDATE ON public.firm_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------
-- 11. Refresh investor_directory_safe view → reference firm_records
-- --------------------------------------------------------
DROP VIEW IF EXISTS public.investor_directory_safe;

CREATE VIEW public.investor_directory_safe
WITH (security_invoker = true)
AS
SELECT
  -- core identity
  id,
  firm_name,
  legal_name,
  slug,
  -- new typed fields
  entity_type,
  thesis_orientation,
  sector_scope,
  stage_focus,
  stage_min,
  stage_max,
  geo_focus,
  -- legacy fields (kept for backward compat)
  lead_partner,
  thesis_verticals,
  preferred_stage,
  min_check_size,
  max_check_size,
  recent_deals,
  lead_or_follow,
  ca_sb54_compliant,
  market_sentiment,
  sentiment_detail,
  -- location
  location,
  hq_city,
  hq_state,
  hq_region,
  hq_country,
  hq_zip_code,
  -- social & web
  logo_url,
  website_url,
  linkedin_url,
  x_url,
  youtube_url,
  medium_url,
  substack_url,
  tiktok_url,
  facebook_url,
  instagram_url,
  crunchbase_url,
  angellist_url,
  -- firm metadata
  firm_type,
  founded_year,
  status,
  verification_status,
  data_confidence_score,
  -- team
  total_headcount,
  total_investors,
  total_partners,
  general_partner_count,
  partner_names,
  general_partner_names,
  headcount,
  -- deployment signals
  is_actively_deploying,
  aum,
  -- scores
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
  -- description / thesis
  elevator_pitch,
  description,
  -- timestamps
  created_at,
  updated_at,
  last_enriched_at,
  last_verified_at,
  next_update_scheduled_at,
  -- vector
  sector_embedding,
  -- hidden by default (credit-gated)
  NULL::text AS email,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_credits uc
      WHERE uc.user_id = auth.uid()::text AND uc.tier = 'admin'
    )
    THEN email_source
    ELSE NULL
  END AS email_source,
  -- Prisma link
  prisma_firm_id
FROM public.firm_records
WHERE deleted_at IS NULL;

-- --------------------------------------------------------
-- 12. Update RLS policies (they reference the old table name)
--     Postgres automatically updates RLS when table is renamed,
--     but let's recreate them to be safe and use the new name.
-- --------------------------------------------------------

-- Drop existing policies on firm_records (renamed from investor_database)
DROP POLICY IF EXISTS "Anyone can read investors" ON public.firm_records;
DROP POLICY IF EXISTS "Authenticated users can insert" ON public.firm_records;
DROP POLICY IF EXISTS "Authenticated users can update" ON public.firm_records;

-- Re-enable RLS
ALTER TABLE public.firm_records ENABLE ROW LEVEL SECURITY;

-- Public read (anon + authenticated)
CREATE POLICY "Anyone can read firm_records"
  ON public.firm_records
  FOR SELECT
  USING (deleted_at IS NULL);

-- Authenticated write
CREATE POLICY "Authenticated users can insert firm_records"
  ON public.firm_records
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update firm_records"
  ON public.firm_records
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- 13. Sync partner_names array with actual investor_partners rows
-- --------------------------------------------------------
UPDATE public.firm_records fr
SET
  partner_names = sub.names,
  total_partners = sub.cnt
FROM (
  SELECT
    firm_id,
    ARRAY_AGG(full_name ORDER BY created_at) AS names,
    COUNT(*) AS cnt
  FROM public.investor_partners
  WHERE deleted_at IS NULL
  GROUP BY firm_id
) sub
WHERE fr.id = sub.firm_id AND fr.deleted_at IS NULL;

-- --------------------------------------------------------
-- 14. Backfill missing country to 'US' for US state codes
-- --------------------------------------------------------
UPDATE public.firm_records
SET hq_country = 'US'
WHERE hq_country IS NULL
  AND hq_state ~ '^[A-Z]{2}$'
  AND deleted_at IS NULL;
