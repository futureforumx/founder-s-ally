-- =============================================================================
-- VC DATABASE AUDIT — field completeness for firm_records + firm_investors
-- Run via: psql "$DATABASE_URL" -f scripts/audit-vc-database.sql
-- =============================================================================

-- ── 1. Record counts ─────────────────────────────────────────────────────────

SELECT '=== RECORD COUNTS ===' AS section;

SELECT
  'firm_records (total)'     AS entity, COUNT(*) AS rows FROM public.firm_records
UNION ALL
SELECT 'firm_records (active)',         COUNT(*) FROM public.firm_records WHERE deleted_at IS NULL
UNION ALL
SELECT 'firm_records (ready_for_live)', COUNT(*) FROM public.firm_records WHERE deleted_at IS NULL AND ready_for_live = true
UNION ALL
SELECT 'firm_investors (total)',        COUNT(*) FROM public.firm_investors
UNION ALL
SELECT 'firm_investors (active)',       COUNT(*) FROM public.firm_investors WHERE deleted_at IS NULL
UNION ALL
SELECT 'firm_investors (ready_for_live)', COUNT(*) FROM public.firm_investors WHERE deleted_at IS NULL AND ready_for_live = true;

-- ── 2. firm_records — field completeness ──────────────────────────────────────

SELECT '=== FIRM_RECORDS FIELD COMPLETENESS ===' AS section;

WITH base AS (
  SELECT * FROM public.firm_records WHERE deleted_at IS NULL
),
total AS (SELECT COUNT(*) AS n FROM base)
SELECT
  field,
  filled,
  (SELECT n FROM total) AS total,
  ROUND(filled::numeric / NULLIF((SELECT n FROM total), 0) * 100, 1) AS pct_filled,
  (SELECT n FROM total) - filled AS missing
FROM (
  SELECT 'description'          AS field, COUNT(*) FILTER (WHERE description IS NOT NULL AND description != '') AS filled FROM base UNION ALL
  SELECT 'elevator_pitch',      COUNT(*) FILTER (WHERE elevator_pitch IS NOT NULL AND elevator_pitch != '') FROM base UNION ALL
  SELECT 'tagline',             COUNT(*) FILTER (WHERE tagline IS NOT NULL AND tagline != '') FROM base UNION ALL
  SELECT 'slug',                COUNT(*) FILTER (WHERE slug IS NOT NULL AND slug != '') FROM base UNION ALL
  SELECT 'logo_url',            COUNT(*) FILTER (WHERE logo_url IS NOT NULL AND logo_url != '') FROM base UNION ALL
  SELECT 'firm_type',           COUNT(*) FILTER (WHERE firm_type IS NOT NULL AND firm_type != '') FROM base UNION ALL
  SELECT 'entity_type',         COUNT(*) FILTER (WHERE entity_type IS NOT NULL) FROM base UNION ALL
  SELECT 'thesis_verticals',    COUNT(*) FILTER (WHERE thesis_verticals IS NOT NULL AND array_length(thesis_verticals, 1) > 0) FROM base UNION ALL
  SELECT 'stage_focus',         COUNT(*) FILTER (WHERE stage_focus IS NOT NULL AND array_length(stage_focus, 1) > 0) FROM base UNION ALL
  SELECT 'stage_min',           COUNT(*) FILTER (WHERE stage_min IS NOT NULL) FROM base UNION ALL
  SELECT 'stage_max',           COUNT(*) FILTER (WHERE stage_max IS NOT NULL) FROM base UNION ALL
  SELECT 'sector_scope',        COUNT(*) FILTER (WHERE sector_scope IS NOT NULL) FROM base UNION ALL
  SELECT 'thesis_orientation',  COUNT(*) FILTER (WHERE thesis_orientation IS NOT NULL) FROM base UNION ALL
  SELECT 'geo_focus',           COUNT(*) FILTER (WHERE geo_focus IS NOT NULL AND array_length(geo_focus, 1) > 0) FROM base UNION ALL
  SELECT 'is_actively_deploying', COUNT(*) FILTER (WHERE is_actively_deploying IS NOT NULL) FROM base UNION ALL
  SELECT 'website_url',         COUNT(*) FILTER (WHERE website_url IS NOT NULL AND website_url != '') FROM base UNION ALL
  SELECT 'email',               COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '') FROM base UNION ALL
  SELECT 'phone',               COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone != '') FROM base UNION ALL
  SELECT 'linkedin_url',        COUNT(*) FILTER (WHERE linkedin_url IS NOT NULL AND linkedin_url != '') FROM base UNION ALL
  SELECT 'x_url',               COUNT(*) FILTER (WHERE x_url IS NOT NULL AND x_url != '') FROM base UNION ALL
  SELECT 'crunchbase_url',      COUNT(*) FILTER (WHERE crunchbase_url IS NOT NULL AND crunchbase_url != '') FROM base UNION ALL
  SELECT 'signal_nfx_url',      COUNT(*) FILTER (WHERE signal_nfx_url IS NOT NULL AND signal_nfx_url != '') FROM base UNION ALL
  SELECT 'cb_insights_url',     COUNT(*) FILTER (WHERE cb_insights_url IS NOT NULL AND cb_insights_url != '') FROM base UNION ALL
  SELECT 'vcsheet_url',         COUNT(*) FILTER (WHERE vcsheet_url IS NOT NULL AND vcsheet_url != '') FROM base UNION ALL
  SELECT 'angellist_url',       COUNT(*) FILTER (WHERE angellist_url IS NOT NULL AND angellist_url != '') FROM base UNION ALL
  SELECT 'pitchbook_url',       COUNT(*) FILTER (WHERE pitchbook_url IS NOT NULL AND pitchbook_url != '') FROM base UNION ALL
  SELECT 'tracxn_url',          COUNT(*) FILTER (WHERE tracxn_url IS NOT NULL AND tracxn_url != '') FROM base UNION ALL
  SELECT 'hq_city',             COUNT(*) FILTER (WHERE hq_city IS NOT NULL AND hq_city != '') FROM base UNION ALL
  SELECT 'hq_state',            COUNT(*) FILTER (WHERE hq_state IS NOT NULL AND hq_state != '') FROM base UNION ALL
  SELECT 'hq_country',          COUNT(*) FILTER (WHERE hq_country IS NOT NULL AND hq_country != '') FROM base UNION ALL
  SELECT 'hq_region',           COUNT(*) FILTER (WHERE hq_region IS NOT NULL) FROM base UNION ALL
  SELECT 'aum (text)',          COUNT(*) FILTER (WHERE aum IS NOT NULL AND aum != '') FROM base UNION ALL
  SELECT 'min_check_size',      COUNT(*) FILTER (WHERE min_check_size IS NOT NULL AND min_check_size > 0) FROM base UNION ALL
  SELECT 'max_check_size',      COUNT(*) FILTER (WHERE max_check_size IS NOT NULL AND max_check_size > 0) FROM base UNION ALL
  SELECT 'founded_year',        COUNT(*) FILTER (WHERE founded_year IS NOT NULL AND founded_year > 0) FROM base UNION ALL
  SELECT 'total_headcount',     COUNT(*) FILTER (WHERE total_headcount IS NOT NULL) FROM base UNION ALL
  SELECT 'total_investors',     COUNT(*) FILTER (WHERE total_investors IS NOT NULL) FROM base UNION ALL
  SELECT 'total_partners',      COUNT(*) FILTER (WHERE total_partners IS NOT NULL) FROM base UNION ALL
  SELECT 'partner_names',       COUNT(*) FILTER (WHERE partner_names IS NOT NULL AND array_length(partner_names, 1) > 0) FROM base UNION ALL
  SELECT 'reputation_score',    COUNT(*) FILTER (WHERE reputation_score IS NOT NULL) FROM base UNION ALL
  SELECT 'match_score',         COUNT(*) FILTER (WHERE match_score IS NOT NULL) FROM base UNION ALL
  SELECT 'completeness_score',  COUNT(*) FILTER (WHERE completeness_score IS NOT NULL AND completeness_score > 0) FROM base UNION ALL
  SELECT 'last_enriched_at',    COUNT(*) FILTER (WHERE last_enriched_at IS NOT NULL) FROM base UNION ALL
  SELECT 'source_count (>0)',   COUNT(*) FILTER (WHERE source_count IS NOT NULL AND source_count > 0) FROM base
) sub
ORDER BY pct_filled DESC;

-- ── 3. firm_records — enrichment_status breakdown ─────────────────────────────

SELECT '=== FIRM_RECORDS ENRICHMENT STATUS ===' AS section;

SELECT
  COALESCE(enrichment_status, 'NULL') AS enrichment_status,
  COUNT(*) AS count,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM public.firm_records
WHERE deleted_at IS NULL
GROUP BY enrichment_status
ORDER BY count DESC;

-- ── 4. firm_records — completeness_score distribution ────────────────────────

SELECT '=== FIRM_RECORDS COMPLETENESS SCORE BANDS ===' AS section;

SELECT
  CASE
    WHEN completeness_score = 0           THEN '0 (not scored)'
    WHEN completeness_score BETWEEN 1 AND 20  THEN '1–20 (very low)'
    WHEN completeness_score BETWEEN 21 AND 40 THEN '21–40 (low)'
    WHEN completeness_score BETWEEN 41 AND 60 THEN '41–60 (medium)'
    WHEN completeness_score BETWEEN 61 AND 80 THEN '61–80 (good)'
    WHEN completeness_score BETWEEN 81 AND 100 THEN '81–100 (excellent)'
    ELSE 'other'
  END AS score_band,
  COUNT(*) AS firms,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM public.firm_records
WHERE deleted_at IS NULL
GROUP BY score_band
ORDER BY MIN(completeness_score);

-- ── 5. firm_investors — field completeness ────────────────────────────────────

SELECT '=== FIRM_INVESTORS FIELD COMPLETENESS ===' AS section;

WITH base AS (
  SELECT * FROM public.firm_investors WHERE deleted_at IS NULL
),
total AS (SELECT COUNT(*) AS n FROM base)
SELECT
  field,
  filled,
  (SELECT n FROM total) AS total,
  ROUND(filled::numeric / NULLIF((SELECT n FROM total), 0) * 100, 1) AS pct_filled,
  (SELECT n FROM total) - filled AS missing
FROM (
  SELECT 'first_name'           AS field, COUNT(*) FILTER (WHERE first_name IS NOT NULL AND first_name != '') AS filled FROM base UNION ALL
  SELECT 'last_name',           COUNT(*) FILTER (WHERE last_name IS NOT NULL AND last_name != '') FROM base UNION ALL
  SELECT 'full_name',           COUNT(*) FILTER (WHERE full_name IS NOT NULL AND full_name != '') FROM base UNION ALL
  SELECT 'title',               COUNT(*) FILTER (WHERE title IS NOT NULL AND title != '') FROM base UNION ALL
  SELECT 'bio',                 COUNT(*) FILTER (WHERE bio IS NOT NULL AND bio != '') FROM base UNION ALL
  SELECT 'avatar_url',          COUNT(*) FILTER (WHERE avatar_url IS NOT NULL AND avatar_url != '') FROM base UNION ALL
  SELECT 'slug',                COUNT(*) FILTER (WHERE slug IS NOT NULL AND slug != '') FROM base UNION ALL
  SELECT 'email',               COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '') FROM base UNION ALL
  SELECT 'phone',               COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone != '') FROM base UNION ALL
  SELECT 'linkedin_url',        COUNT(*) FILTER (WHERE linkedin_url IS NOT NULL AND linkedin_url != '') FROM base UNION ALL
  SELECT 'x_url',               COUNT(*) FILTER (WHERE x_url IS NOT NULL AND x_url != '') FROM base UNION ALL
  SELECT 'city',                COUNT(*) FILTER (WHERE city IS NOT NULL AND city != '') FROM base UNION ALL
  SELECT 'state',               COUNT(*) FILTER (WHERE state IS NOT NULL AND state != '') FROM base UNION ALL
  SELECT 'country',             COUNT(*) FILTER (WHERE country IS NOT NULL AND country != '') FROM base UNION ALL
  SELECT 'sector_focus',        COUNT(*) FILTER (WHERE sector_focus IS NOT NULL AND array_length(sector_focus, 1) > 0) FROM base UNION ALL
  SELECT 'stage_focus',         COUNT(*) FILTER (WHERE stage_focus IS NOT NULL AND array_length(stage_focus, 1) > 0) FROM base UNION ALL
  SELECT 'personal_thesis_tags', COUNT(*) FILTER (WHERE personal_thesis_tags IS NOT NULL AND array_length(personal_thesis_tags, 1) > 0) FROM base UNION ALL
  SELECT 'investment_style',    COUNT(*) FILTER (WHERE investment_style IS NOT NULL AND investment_style != '') FROM base UNION ALL
  SELECT 'education_summary',   COUNT(*) FILTER (WHERE education_summary IS NOT NULL AND education_summary != '') FROM base UNION ALL
  SELECT 'background_summary',  COUNT(*) FILTER (WHERE background_summary IS NOT NULL AND background_summary != '') FROM base UNION ALL
  SELECT 'is_actively_investing', COUNT(*) FILTER (WHERE is_actively_investing IS NOT NULL) FROM base UNION ALL
  SELECT 'last_active_date',    COUNT(*) FILTER (WHERE last_active_date IS NOT NULL) FROM base UNION ALL
  SELECT 'recent_deal_count',   COUNT(*) FILTER (WHERE recent_deal_count IS NOT NULL) FROM base UNION ALL
  SELECT 'match_score',         COUNT(*) FILTER (WHERE match_score IS NOT NULL) FROM base UNION ALL
  SELECT 'reputation_score',    COUNT(*) FILTER (WHERE reputation_score IS NOT NULL) FROM base UNION ALL
  SELECT 'completeness_score',  COUNT(*) FILTER (WHERE completeness_score IS NOT NULL AND completeness_score > 0) FROM base UNION ALL
  SELECT 'last_enriched_at',    COUNT(*) FILTER (WHERE last_enriched_at IS NOT NULL) FROM base UNION ALL
  SELECT 'source_count (>0)',   COUNT(*) FILTER (WHERE source_count IS NOT NULL AND source_count > 0) FROM base
) sub
ORDER BY pct_filled DESC;

-- ── 6. firm_investors — enrichment_status breakdown ──────────────────────────

SELECT '=== FIRM_INVESTORS ENRICHMENT STATUS ===' AS section;

SELECT
  COALESCE(enrichment_status, 'NULL') AS enrichment_status,
  COUNT(*) AS count,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM public.firm_investors
WHERE deleted_at IS NULL
GROUP BY enrichment_status
ORDER BY count DESC;

-- ── 7. firm_investors — completeness_score distribution ──────────────────────

SELECT '=== FIRM_INVESTORS COMPLETENESS SCORE BANDS ===' AS section;

SELECT
  CASE
    WHEN completeness_score = 0            THEN '0 (not scored)'
    WHEN completeness_score BETWEEN 1 AND 20  THEN '1–20 (very low)'
    WHEN completeness_score BETWEEN 21 AND 40 THEN '21–40 (low)'
    WHEN completeness_score BETWEEN 41 AND 60 THEN '41–60 (medium)'
    WHEN completeness_score BETWEEN 61 AND 80 THEN '61–80 (good)'
    WHEN completeness_score BETWEEN 81 AND 100 THEN '81–100 (excellent)'
    ELSE 'other'
  END AS score_band,
  COUNT(*) AS investors,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM public.firm_investors
WHERE deleted_at IS NULL
GROUP BY score_band
ORDER BY MIN(completeness_score);

-- ── 8. firm_investors — coverage by firm ─────────────────────────────────────

SELECT '=== FIRMS WITHOUT ANY ACTIVE INVESTORS ===' AS section;

SELECT COUNT(*) AS firms_with_no_investors
FROM public.firm_records fr
WHERE fr.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.firm_investors fi
    WHERE fi.firm_id = fr.id AND fi.deleted_at IS NULL
  );

-- ── 9. Top firms by investor count ───────────────────────────────────────────

SELECT '=== TOP 20 FIRMS BY INVESTOR COUNT ===' AS section;

SELECT
  fr.firm_name,
  COUNT(fi.id) AS investor_count,
  fr.completeness_score,
  fr.ready_for_live
FROM public.firm_records fr
LEFT JOIN public.firm_investors fi ON fi.firm_id = fr.id AND fi.deleted_at IS NULL
WHERE fr.deleted_at IS NULL
GROUP BY fr.id, fr.firm_name, fr.completeness_score, fr.ready_for_live
ORDER BY investor_count DESC
LIMIT 20;
