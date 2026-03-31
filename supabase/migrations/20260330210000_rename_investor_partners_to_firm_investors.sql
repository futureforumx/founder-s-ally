-- =============================================================================
-- Migration: Rename investor_partners → firm_investors
-- + Clean up placeholder names
-- + Remove orphaned records
-- + Add constraints
-- =============================================================================

-- --------------------------------------------------------
-- 1. Clean up orphaned partners (firm_id points to deleted/missing firm)
-- --------------------------------------------------------
UPDATE public.investor_partners
SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND firm_id NOT IN (
    SELECT id FROM public.firm_records WHERE deleted_at IS NULL
  );

-- --------------------------------------------------------
-- 2. Deduplicate partners within the same firm
--    Keep the most complete record per (firm_id, LOWER(full_name))
-- --------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    firm_id,
    full_name,
    ROW_NUMBER() OVER (
      PARTITION BY firm_id, LOWER(TRIM(full_name))
      ORDER BY
        (CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END
         + CASE WHEN linkedin_url IS NOT NULL THEN 1 ELSE 0 END
         + CASE WHEN bio IS NOT NULL THEN 1 ELSE 0 END
         + CASE WHEN avatar_url IS NOT NULL THEN 1 ELSE 0 END
        ) DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST
    ) AS rn
  FROM public.investor_partners
  WHERE deleted_at IS NULL
)
UPDATE public.investor_partners
SET deleted_at = NOW()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- --------------------------------------------------------
-- 3. Flag placeholder names (don't delete — mark for review)
--    These were auto-generated during import when no real name existed
-- --------------------------------------------------------
-- Add a needs_review flag column
ALTER TABLE public.investor_partners
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;

UPDATE public.investor_partners
SET needs_review = true
WHERE deleted_at IS NULL
  AND (
    first_name IN ('Investment', 'N/A', 'Unknown', '')
    OR last_name IN ('Team', 'N/A', 'Unknown', '')
    OR full_name ~ '^\s*$'
    OR full_name ILIKE 'investment team'
    OR full_name ILIKE 'unknown%'
    OR full_name ILIKE 'n/a'
  );

-- --------------------------------------------------------
-- 4. Add social profile columns that might be missing
-- --------------------------------------------------------
ALTER TABLE public.investor_partners
  ADD COLUMN IF NOT EXISTS youtube_url    text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS medium_url     text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS substack_url   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tiktok_url     text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS facebook_url   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS instagram_url  text DEFAULT NULL;

-- --------------------------------------------------------
-- 5. RENAME the table
-- --------------------------------------------------------
ALTER TABLE public.investor_partners RENAME TO firm_investors;

-- Rename existing indexes
ALTER INDEX IF EXISTS idx_investor_partners_prisma_person_id RENAME TO idx_firm_investors_prisma_person_id;
ALTER INDEX IF EXISTS idx_investor_partners_email RENAME TO idx_firm_investors_email;
ALTER INDEX IF EXISTS idx_investor_partners_match_score RENAME TO idx_firm_investors_match_score;

-- New indexes
CREATE INDEX IF NOT EXISTS idx_firm_investors_firm_id
  ON public.firm_investors (firm_id);

CREATE INDEX IF NOT EXISTS idx_firm_investors_needs_review
  ON public.firm_investors (needs_review)
  WHERE needs_review = true;

-- Unique constraint: one person per firm per name (for non-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_firm_investors_unique_per_firm
  ON public.firm_investors (firm_id, LOWER(TRIM(full_name)))
  WHERE deleted_at IS NULL;

-- --------------------------------------------------------
-- 6. CHECK constraints on scores
-- --------------------------------------------------------
DO $$
BEGIN
  -- Clamp scores first
  UPDATE public.firm_investors SET
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

  ALTER TABLE public.firm_investors
    ADD CONSTRAINT chk_fi_match_score CHECK (match_score BETWEEN 0 AND 100),
    ADD CONSTRAINT chk_fi_reputation_score CHECK (reputation_score BETWEEN 0 AND 100),
    ADD CONSTRAINT chk_fi_responsiveness_score CHECK (responsiveness_score BETWEEN 0 AND 100),
    ADD CONSTRAINT chk_fi_value_add_score CHECK (value_add_score BETWEEN 0 AND 100),
    ADD CONSTRAINT chk_fi_network_strength CHECK (network_strength BETWEEN 0 AND 100);
END $$;

-- Check size range
UPDATE public.firm_investors
SET check_size_min = check_size_max, check_size_max = check_size_min
WHERE check_size_min > check_size_max;

ALTER TABLE public.firm_investors
  ADD CONSTRAINT chk_fi_check_size_range CHECK (check_size_min <= check_size_max);

-- --------------------------------------------------------
-- 7. Foreign key to firm_records (verify / create)
-- --------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'investor_partners_firm_id_fkey'
      AND table_name = 'firm_investors'
  ) THEN
    ALTER TABLE public.firm_investors
      ADD CONSTRAINT firm_investors_firm_id_fkey
      FOREIGN KEY (firm_id) REFERENCES public.firm_records(id);
  END IF;
END $$;

-- --------------------------------------------------------
-- 8. updated_at trigger
-- --------------------------------------------------------
DROP TRIGGER IF EXISTS trg_firm_investors_updated_at ON public.firm_investors;
CREATE TRIGGER trg_firm_investors_updated_at
  BEFORE UPDATE ON public.firm_investors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------
-- 9. RLS policies
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read investor_partners" ON public.firm_investors;
DROP POLICY IF EXISTS "Authenticated users can insert investor_partners" ON public.firm_investors;
DROP POLICY IF EXISTS "Authenticated users can update investor_partners" ON public.firm_investors;

ALTER TABLE public.firm_investors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read firm_investors"
  ON public.firm_investors
  FOR SELECT
  USING (deleted_at IS NULL);

CREATE POLICY "Authenticated users can insert firm_investors"
  ON public.firm_investors
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update firm_investors"
  ON public.firm_investors
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- 10. Update firm_records.partner_names + total_partners to stay in sync
-- --------------------------------------------------------
UPDATE public.firm_records fr
SET
  partner_names = sub.names,
  total_partners = sub.cnt,
  total_investors = sub.cnt
FROM (
  SELECT
    firm_id,
    ARRAY_AGG(full_name ORDER BY created_at) AS names,
    COUNT(*) AS cnt
  FROM public.firm_investors
  WHERE deleted_at IS NULL AND needs_review = false
  GROUP BY firm_id
) sub
WHERE fr.id = sub.firm_id AND fr.deleted_at IS NULL;
