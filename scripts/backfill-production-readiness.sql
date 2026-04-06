-- =============================================================================
-- BACKFILL: production-readiness scoring & flags
-- DATE:      2026-04-04
-- PURPOSE:   One-time backfill to compute completeness_score, enrichment_status,
--            ready_for_live, and needs_review for all core entity tables.
-- SAFETY:    Only writes to new metadata columns added by migration
--            20260404230000_production_readiness_control_fields.
--            Does NOT touch any user-facing data fields.
--            Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. FIRM_RECORDS — Completeness scoring
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE firm_records SET
  completeness_score = (
    -- Core identity (40 points)
    (CASE WHEN firm_name IS NOT NULL AND firm_name != '' THEN 10 ELSE 0 END) +
    (CASE WHEN slug IS NOT NULL AND slug != '' THEN 5 ELSE 0 END) +
    (CASE WHEN description IS NOT NULL AND description != '' THEN 15 ELSE 0 END) +
    (CASE WHEN logo_url IS NOT NULL AND logo_url != '' THEN 5 ELSE 0 END) +
    (CASE WHEN website_url IS NOT NULL AND website_url != '' THEN 5 ELSE 0 END) +
    -- Classification (30 points)
    (CASE WHEN stage_focus IS NOT NULL AND array_length(stage_focus, 1) > 0 THEN 10 ELSE 0 END) +
    (CASE WHEN thesis_verticals IS NOT NULL AND array_length(thesis_verticals, 1) > 0 THEN 10 ELSE 0 END) +
    (CASE WHEN entity_type IS NOT NULL THEN 5 ELSE 0 END) +
    (CASE WHEN firm_type IS NOT NULL AND firm_type != '' THEN 5 ELSE 0 END) +
    -- Location (10 points)
    (CASE WHEN hq_city IS NOT NULL AND hq_city != '' THEN 5 ELSE 0 END) +
    (CASE WHEN hq_country IS NOT NULL AND hq_country != '' THEN 5 ELSE 0 END) +
    -- Connectivity (10 points)
    (CASE WHEN linkedin_url IS NOT NULL AND linkedin_url != '' THEN 5 ELSE 0 END) +
    (CASE WHEN (crunchbase_url IS NOT NULL AND crunchbase_url != '') OR (signal_nfx_url IS NOT NULL AND signal_nfx_url != '') THEN 5 ELSE 0 END) +
    -- Financial (10 points)
    (CASE WHEN min_check_size > 0 OR max_check_size > 0 THEN 5 ELSE 0 END) +
    (CASE WHEN aum IS NOT NULL AND aum != '' THEN 5 ELSE 0 END)
  ),
  source_count = (
    (CASE WHEN crunchbase_url IS NOT NULL AND crunchbase_url != '' THEN 1 ELSE 0 END) +
    (CASE WHEN signal_nfx_url IS NOT NULL AND signal_nfx_url != '' THEN 1 ELSE 0 END) +
    (CASE WHEN vcsheet_url IS NOT NULL AND vcsheet_url != '' THEN 1 ELSE 0 END) +
    (CASE WHEN angellist_url IS NOT NULL AND angellist_url != '' THEN 1 ELSE 0 END) +
    (CASE WHEN openvc_url IS NOT NULL AND openvc_url != '' THEN 1 ELSE 0 END) +
    (CASE WHEN trustfinta_url IS NOT NULL AND trustfinta_url != '' THEN 1 ELSE 0 END) +
    (CASE WHEN cb_insights_url IS NOT NULL AND cb_insights_url != '' THEN 1 ELSE 0 END) +
    (CASE WHEN linkedin_url IS NOT NULL AND linkedin_url != '' THEN 1 ELSE 0 END)
  ),
  enrichment_status = CASE
    WHEN last_enriched_at IS NOT NULL AND description IS NOT NULL AND description != ''
         AND website_url IS NOT NULL AND website_url != '' THEN 'complete'
    WHEN last_enriched_at IS NOT NULL THEN 'partial'
    ELSE 'pending'
  END
WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. FIRM_RECORDS — ready_for_live
-- Minimum viable: name + slug + (description OR elevator_pitch) +
--                 at least one of (stage_focus, thesis_verticals)
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE firm_records SET ready_for_live = true
WHERE deleted_at IS NULL
  AND firm_name IS NOT NULL AND firm_name != ''
  AND slug IS NOT NULL AND slug != ''
  AND (
    (description IS NOT NULL AND description != '')
    OR (elevator_pitch IS NOT NULL AND elevator_pitch != '')
  )
  AND (
    (stage_focus IS NOT NULL AND array_length(stage_focus, 1) > 0)
    OR (thesis_verticals IS NOT NULL AND array_length(thesis_verticals, 1) > 0)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. FIRM_RECORDS — needs_review (data quality flags)
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE firm_records SET needs_review = true
WHERE deleted_at IS NULL
  AND needs_review = false
  AND description IS NOT NULL
  AND (
    description LIKE '%<div%' OR description LIKE '%<script%'
    OR description LIKE '%<svg%' OR description LIKE '%</div>%'
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. FIRM_INVESTORS — Completeness scoring
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE firm_investors SET
  completeness_score = (
    -- Core identity (40 points)
    (CASE WHEN full_name IS NOT NULL AND full_name != '' THEN 10 ELSE 0 END) +
    (CASE WHEN first_name IS NOT NULL AND first_name != '' AND last_name IS NOT NULL AND last_name != '' THEN 5 ELSE 0 END) +
    (CASE WHEN title IS NOT NULL AND title != '' THEN 10 ELSE 0 END) +
    (CASE WHEN bio IS NOT NULL AND bio != '' AND length(bio) > 20 THEN 10 ELSE 0 END) +
    (CASE WHEN avatar_url IS NOT NULL AND avatar_url != '' THEN 5 ELSE 0 END) +
    -- Classification (25 points)
    (CASE WHEN stage_focus IS NOT NULL AND array_length(stage_focus, 1) > 0 THEN 10 ELSE 0 END) +
    (CASE WHEN sector_focus IS NOT NULL AND array_length(sector_focus, 1) > 0 THEN 10 ELSE 0 END) +
    (CASE WHEN personal_thesis_tags IS NOT NULL AND array_length(personal_thesis_tags, 1) > 0 THEN 5 ELSE 0 END) +
    -- Connectivity (20 points)
    (CASE WHEN linkedin_url IS NOT NULL AND linkedin_url != '' THEN 10 ELSE 0 END) +
    (CASE WHEN email IS NOT NULL AND email != '' THEN 5 ELSE 0 END) +
    (CASE WHEN website_url IS NOT NULL AND website_url != '' THEN 5 ELSE 0 END) +
    -- Location (10 points)
    (CASE WHEN city IS NOT NULL AND city != '' THEN 5 ELSE 0 END) +
    (CASE WHEN country IS NOT NULL AND country != '' THEN 5 ELSE 0 END) +
    -- Background (5 points)
    (CASE WHEN background_summary IS NOT NULL AND background_summary != '' THEN 5 ELSE 0 END)
  ),
  enrichment_status = CASE
    WHEN bio IS NOT NULL AND bio != '' AND linkedin_url IS NOT NULL AND linkedin_url != '' THEN 'complete'
    WHEN bio IS NOT NULL AND bio != '' THEN 'partial'
    WHEN avatar_url IS NOT NULL AND avatar_url != '' THEN 'partial'
    ELSE 'pending'
  END
WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. FIRM_INVESTORS — ready_for_live
-- Minimum viable: full_name + firm_id + title + avatar_url
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE firm_investors SET ready_for_live = true
WHERE deleted_at IS NULL
  AND full_name IS NOT NULL AND full_name != ''
  AND firm_id IS NOT NULL
  AND title IS NOT NULL AND title != ''
  AND avatar_url IS NOT NULL AND avatar_url != '';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. FIRM_INVESTORS — needs_review (data quality flags)
-- ═══════════════════════════════════════════════════════════════════════════

-- HTML/SVG fragments in bio
UPDATE firm_investors SET needs_review = true
WHERE deleted_at IS NULL
  AND needs_review = false
  AND bio IS NOT NULL
  AND (
    bio LIKE '%<div%' OR bio LIKE '%<svg%' OR bio LIKE '%<path%'
    OR bio LIKE '%class="%' OR bio LIKE '%</div>%'
  );

-- Non-location data in city/country fields
UPDATE firm_investors SET needs_review = true
WHERE deleted_at IS NULL
  AND needs_review = false
  AND (
    (city IS NOT NULL AND city IN ('AdSense', 'Chief Product Officer', 'Investment', 'N/A', ''))
    OR (country IS NOT NULL AND country IN ('Google', 'Adobe', 'N/A', ''))
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. PEOPLE — Completeness + ready_for_live
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE people SET
  completeness_score = (
    (CASE WHEN "canonicalName" IS NOT NULL AND "canonicalName" != '' THEN 15 ELSE 0 END) +
    (CASE WHEN "firstName" IS NOT NULL AND "firstName" != '' THEN 5 ELSE 0 END) +
    (CASE WHEN "lastName" IS NOT NULL AND "lastName" != '' THEN 5 ELSE 0 END) +
    (CASE WHEN bio IS NOT NULL AND bio != '' THEN 15 ELSE 0 END) +
    (CASE WHEN "linkedinUrl" IS NOT NULL AND "linkedinUrl" != '' THEN 15 ELSE 0 END) +
    (CASE WHEN "avatarUrl" IS NOT NULL AND "avatarUrl" != '' THEN 5 ELSE 0 END) +
    (CASE WHEN email IS NOT NULL AND email != '' THEN 10 ELSE 0 END) +
    (CASE WHEN city IS NOT NULL AND city != '' THEN 5 ELSE 0 END) +
    (CASE WHEN country IS NOT NULL AND country != '' THEN 5 ELSE 0 END) +
    (CASE WHEN expertise IS NOT NULL AND array_length(expertise, 1) > 0 THEN 10 ELSE 0 END) +
    (CASE WHEN "sourceIds" IS NOT NULL AND array_length("sourceIds", 1) > 0 THEN 10 ELSE 0 END)
  ),
  enrichment_status = CASE
    WHEN bio IS NOT NULL AND bio != '' AND "linkedinUrl" IS NOT NULL THEN 'complete'
    WHEN bio IS NOT NULL AND bio != '' THEN 'partial'
    WHEN "avatarUrl" IS NOT NULL THEN 'partial'
    ELSE 'pending'
  END;

UPDATE people SET ready_for_live = true
WHERE "canonicalName" IS NOT NULL AND "canonicalName" != ''
  AND id IN (SELECT "personId" FROM roles WHERE "isCurrent" = true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. ORGANIZATIONS — Completeness + ready_for_live
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE organizations SET
  completeness_score = (
    (CASE WHEN "canonicalName" IS NOT NULL AND "canonicalName" != '' THEN 15 ELSE 0 END) +
    (CASE WHEN description IS NOT NULL AND description != '' THEN 20 ELSE 0 END) +
    (CASE WHEN website IS NOT NULL AND website != '' THEN 10 ELSE 0 END) +
    (CASE WHEN "logoUrl" IS NOT NULL AND "logoUrl" != '' THEN 5 ELSE 0 END) +
    (CASE WHEN industry IS NOT NULL AND industry != '' THEN 10 ELSE 0 END) +
    (CASE WHEN city IS NOT NULL AND city != '' THEN 5 ELSE 0 END) +
    (CASE WHEN country IS NOT NULL AND country != '' THEN 5 ELSE 0 END) +
    (CASE WHEN "foundedYear" IS NOT NULL THEN 5 ELSE 0 END) +
    (CASE WHEN "employeeCount" IS NOT NULL THEN 5 ELSE 0 END) +
    (CASE WHEN domain IS NOT NULL AND domain != '' THEN 10 ELSE 0 END) +
    (CASE WHEN tags IS NOT NULL AND array_length(tags, 1) > 0 THEN 10 ELSE 0 END)
  ),
  enrichment_status = CASE
    WHEN description IS NOT NULL AND description != '' AND website IS NOT NULL THEN 'complete'
    WHEN description IS NOT NULL AND description != '' THEN 'partial'
    WHEN "logoUrl" IS NOT NULL THEN 'partial'
    ELSE 'pending'
  END;

UPDATE organizations SET ready_for_live = true
WHERE "canonicalName" IS NOT NULL AND "canonicalName" != ''
  AND description IS NOT NULL AND description != '';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY (run after backfill to confirm results)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT 'firm_records' AS entity, COUNT(*) total,
--   COUNT(*) FILTER (WHERE ready_for_live) AS live,
--   COUNT(*) FILTER (WHERE needs_review) AS review,
--   ROUND(AVG(completeness_score),1) AS avg_score
-- FROM firm_records WHERE deleted_at IS NULL
-- UNION ALL
-- SELECT 'firm_investors', COUNT(*),
--   COUNT(*) FILTER (WHERE ready_for_live),
--   COUNT(*) FILTER (WHERE needs_review),
--   ROUND(AVG(completeness_score),1)
-- FROM firm_investors WHERE deleted_at IS NULL
-- UNION ALL
-- SELECT 'people', COUNT(*),
--   COUNT(*) FILTER (WHERE ready_for_live), 0,
--   ROUND(AVG(completeness_score),1)
-- FROM people
-- UNION ALL
-- SELECT 'organizations', COUNT(*),
--   COUNT(*) FILTER (WHERE ready_for_live), 0,
--   ROUND(AVG(completeness_score),1)
-- FROM organizations;
