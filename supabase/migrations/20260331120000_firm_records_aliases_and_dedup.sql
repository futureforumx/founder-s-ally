-- =============================================================================
-- Migration: firm_records aliases + a16z deduplication
--
-- 1. Add `aliases` text[] column for searchable nicknames / alternate names
-- 2. Merge the duplicate a16z / Andreessen Horowitz records
-- 3. Seed well-known firm aliases so search works by nickname
-- 4. Refresh investor_directory_safe view to expose aliases
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add aliases column
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.firm_records.aliases IS
  'Searchable nicknames and alternate names for this firm (e.g. ["a16z"] for Andreessen Horowitz).';

CREATE INDEX IF NOT EXISTS idx_firm_records_aliases
  ON public.firm_records USING GIN (aliases);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Merge duplicate a16z / Andreessen Horowitz records
--
--    Strategy: identify both rows, pick the "winner" (higher match_score or
--    more recently enriched), merge the best data from both, then soft-delete
--    the loser.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_winner_id   uuid;
  v_loser_id    uuid;
  v_winner_name text;
BEGIN
  -- Find the two a16z / Andreessen Horowitz rows (case-insensitive)
  -- Pick the one with the higher match_score (or most recently enriched) as winner
  SELECT id, firm_name
    INTO v_winner_id, v_winner_name
    FROM public.firm_records
   WHERE deleted_at IS NULL
     AND (
           LOWER(firm_name) LIKE '%andreessen%'
        OR LOWER(firm_name) LIKE '%a16z%'
     )
   ORDER BY
     COALESCE(match_score, 0) DESC,
     COALESCE(last_enriched_at, '1970-01-01') DESC,
     created_at DESC
   LIMIT 1;

  -- Only proceed if we found at least one matching record
  IF v_winner_id IS NULL THEN
    RAISE NOTICE 'No a16z / Andreessen Horowitz record found – skipping merge.';
    RETURN;
  END IF;

  -- Find the other row (if any)
  SELECT id INTO v_loser_id
    FROM public.firm_records
   WHERE deleted_at IS NULL
     AND id <> v_winner_id
     AND (
           LOWER(firm_name) LIKE '%andreessen%'
        OR LOWER(firm_name) LIKE '%a16z%'
     )
   LIMIT 1;

  IF v_loser_id IS NULL THEN
    -- Only one record exists – just ensure aliases are set, no merge needed
    RAISE NOTICE 'Only one a16z record found (id=%), setting aliases.', v_winner_id;
  ELSE
    RAISE NOTICE 'Merging % into winner id=%', v_loser_id, v_winner_id;

    -- Merge best data from loser → winner (COALESCE keeps winner's value when set)
    UPDATE public.firm_records
    SET
      -- Canonical name: use the longer / more formal name
      firm_name = CASE
        WHEN LENGTH(firm_name) >= LENGTH((SELECT firm_name FROM public.firm_records WHERE id = v_loser_id))
          THEN firm_name
        ELSE (SELECT firm_name FROM public.firm_records WHERE id = v_loser_id)
      END,
      -- Prefer winner's values, fall back to loser's when winner is NULL/empty
      legal_name        = COALESCE(legal_name,        (SELECT legal_name        FROM public.firm_records WHERE id = v_loser_id)),
      description       = COALESCE(description,       (SELECT description       FROM public.firm_records WHERE id = v_loser_id)),
      elevator_pitch    = COALESCE(elevator_pitch,    (SELECT elevator_pitch    FROM public.firm_records WHERE id = v_loser_id)),
      logo_url          = COALESCE(logo_url,          (SELECT logo_url          FROM public.firm_records WHERE id = v_loser_id)),
      website_url       = COALESCE(website_url,       (SELECT website_url       FROM public.firm_records WHERE id = v_loser_id)),
      linkedin_url      = COALESCE(linkedin_url,      (SELECT linkedin_url      FROM public.firm_records WHERE id = v_loser_id)),
      x_url             = COALESCE(x_url,             (SELECT x_url             FROM public.firm_records WHERE id = v_loser_id)),
      crunchbase_url    = COALESCE(crunchbase_url,    (SELECT crunchbase_url    FROM public.firm_records WHERE id = v_loser_id)),
      angellist_url     = COALESCE(angellist_url,     (SELECT angellist_url     FROM public.firm_records WHERE id = v_loser_id)),
      hq_city           = COALESCE(hq_city,           (SELECT hq_city           FROM public.firm_records WHERE id = v_loser_id)),
      hq_state          = COALESCE(hq_state,          (SELECT hq_state          FROM public.firm_records WHERE id = v_loser_id)),
      hq_country        = COALESCE(hq_country,        (SELECT hq_country        FROM public.firm_records WHERE id = v_loser_id)),
      location          = COALESCE(location,          (SELECT location          FROM public.firm_records WHERE id = v_loser_id)),
      founded_year      = COALESCE(founded_year,      (SELECT founded_year      FROM public.firm_records WHERE id = v_loser_id)),
      -- AUM: take the higher value (more complete data)
      aum               = CASE
        WHEN aum IS NOT NULL AND (SELECT aum FROM public.firm_records WHERE id = v_loser_id) IS NULL
          THEN aum
        WHEN aum IS NULL
          THEN (SELECT aum FROM public.firm_records WHERE id = v_loser_id)
        -- Both non-null: keep the winner's (higher match score wins)
        ELSE aum
      END,
      -- Headcount: take higher value
      headcount         = CASE
        WHEN headcount IS NULL
          THEN (SELECT headcount FROM public.firm_records WHERE id = v_loser_id)
        ELSE headcount
      END,
      total_headcount   = GREATEST(
        total_headcount,
        (SELECT total_headcount FROM public.firm_records WHERE id = v_loser_id)
      ),
      -- Scores: take best
      match_score       = GREATEST(match_score,        (SELECT match_score        FROM public.firm_records WHERE id = v_loser_id)),
      reputation_score  = GREATEST(reputation_score,   (SELECT reputation_score   FROM public.firm_records WHERE id = v_loser_id)),
      responsiveness_score = GREATEST(responsiveness_score, (SELECT responsiveness_score FROM public.firm_records WHERE id = v_loser_id)),
      value_add_score   = GREATEST(value_add_score,    (SELECT value_add_score    FROM public.firm_records WHERE id = v_loser_id)),
      network_strength  = GREATEST(network_strength,   (SELECT network_strength   FROM public.firm_records WHERE id = v_loser_id)),
      founder_reputation_score = GREATEST(founder_reputation_score, (SELECT founder_reputation_score FROM public.firm_records WHERE id = v_loser_id)),
      -- Thesis verticals: union both arrays
      thesis_verticals  = ARRAY(
        SELECT DISTINCT unnest(
          COALESCE(thesis_verticals, '{}') ||
          COALESCE((SELECT thesis_verticals FROM public.firm_records WHERE id = v_loser_id), '{}')
        )
      ),
      -- Partner names: union both arrays
      partner_names     = ARRAY(
        SELECT DISTINCT unnest(
          COALESCE(partner_names, '{}') ||
          COALESCE((SELECT partner_names FROM public.firm_records WHERE id = v_loser_id), '{}')
        )
      ),
      last_enriched_at  = GREATEST(last_enriched_at, (SELECT last_enriched_at FROM public.firm_records WHERE id = v_loser_id))
    WHERE id = v_winner_id;

    -- Re-point any related rows (investor_partners / firm_investors) to the winner
    UPDATE public.investor_partners
      SET firm_id = v_winner_id
    WHERE firm_id = v_loser_id;

    -- Also handle the renamed table (firm_investors) if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'firm_investors'
    ) THEN
      EXECUTE format(
        'UPDATE public.firm_investors SET firm_id = %L WHERE firm_id = %L',
        v_winner_id, v_loser_id
      );
    END IF;

    -- Soft-delete the loser
    UPDATE public.firm_records
      SET deleted_at = NOW()
    WHERE id = v_loser_id;

    RAISE NOTICE 'Merged % into % (winner: %)', v_loser_id, v_winner_id, v_winner_name;
  END IF;

  -- ── Set canonical name to the formal version and add aliases ──────────────
  UPDATE public.firm_records
  SET
    -- Ensure canonical name is the full formal name
    firm_name  = 'Andreessen Horowitz',
    legal_name = COALESCE(legal_name, 'Andreessen Horowitz LLC'),
    aliases    = ARRAY['a16z', 'Andreessen Horowitz', 'a16z crypto', 'AH']
  WHERE id = v_winner_id;

END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Seed aliases for other well-known firms where the short name / nickname
--    differs significantly from the canonical firm_name
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.firm_records
SET aliases = aliases || ARRAY['Sequoia', 'Sequoia Capital', 'SCV']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%sequoia%')
  AND NOT (aliases @> ARRAY['Sequoia']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['YC', 'Y Combinator', 'YCombinator']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%y combinator%')
  AND NOT (aliases @> ARRAY['YC']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['Kleiner', 'KPCB', 'Kleiner Perkins Caufield Byers']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%kleiner%')
  AND NOT (aliases @> ARRAY['KPCB']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['Benchmark', 'BCV']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%benchmark%')
  AND NOT (aliases @> ARRAY['BCV']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['IVP', 'Institutional Venture Partners']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%institutional venture%')
  AND NOT (aliases @> ARRAY['IVP']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['NEA', 'New Enterprise Associates']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%new enterprise%')
  AND NOT (aliases @> ARRAY['NEA']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['GV', 'Google Ventures']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%gv%' OR LOWER(firm_name) LIKE '%google ventures%')
  AND NOT (aliases @> ARRAY['GV']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['a16z crypto', 'Crypto Fund']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%a16z crypto%')
  AND NOT (aliases @> ARRAY['a16z crypto']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['Accel', 'Accel Partners']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%accel%')
  AND NOT (aliases @> ARRAY['Accel']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['First Round', 'First Round Capital', 'FRC']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%first round%')
  AND NOT (aliases @> ARRAY['FRC']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['Founders Fund', 'FF']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%founders fund%')
  AND NOT (aliases @> ARRAY['FF']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['Lightspeed', 'LSVP', 'Lightspeed Venture Partners']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%lightspeed%')
  AND NOT (aliases @> ARRAY['LSVP']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['General Catalyst', 'GC']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%general catalyst%')
  AND NOT (aliases @> ARRAY['GC']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['Bessemer', 'BVP', 'Bessemer Venture Partners']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%bessemer%')
  AND NOT (aliases @> ARRAY['BVP']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['Tiger', 'TGM', 'Tiger Global']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%tiger global%')
  AND NOT (aliases @> ARRAY['Tiger Global']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['Index', 'Index Ventures']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%index ventures%')
  AND NOT (aliases @> ARRAY['Index']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['USV', 'Union Square Ventures']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%union square%')
  AND NOT (aliases @> ARRAY['USV']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['Greylock', 'GLP', 'Greylock Partners']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%greylock%')
  AND NOT (aliases @> ARRAY['GLP']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['Social Capital', 'Social+Capital']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%social capital%')
  AND NOT (aliases @> ARRAY['Social Capital']);

UPDATE public.firm_records
SET aliases = aliases || ARRAY['SoftBank', 'SVF', 'SoftBank Vision Fund']
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%softbank%')
  AND NOT (aliases @> ARRAY['SVF']);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Refresh investor_directory_safe view to expose aliases
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
  stage_min,
  stage_max,
  geo_focus,
  lead_partner,
  thesis_verticals,
  strategy_classifications,
  preferred_stage,
  min_check_size,
  max_check_size,
  recent_deals,
  lead_or_follow,
  ca_sb54_compliant,
  market_sentiment,
  sentiment_detail,
  location,
  hq_city,
  hq_state,
  hq_region,
  hq_country,
  hq_zip_code,
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
  firm_type,
  founded_year,
  status,
  verification_status,
  data_confidence_score,
  total_headcount,
  total_investors,
  total_partners,
  general_partner_count,
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
