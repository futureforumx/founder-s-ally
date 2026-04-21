-- =============================================================================
-- MIGRATION: 20260430120000_fi_funding_feed_add_metadata_cols
-- PURPOSE:   Extend get_recent_funding_feed to surface source_type,
--            confirmation_status, and confidence_score from both the legacy
--            funding_deals path and the new fi_deals_canonical path.
--
-- WHY:       The frontend FundingFeedRow component uses confirmationStatus
--            to show the Rumor badge (VC Stack items) and sourceType for the
--            source provenance label. Without these columns, new-pipeline
--            deals always look the same as legacy deals.
--
-- BACKWARD COMPAT:
--   All new columns are text/numeric with COALESCE-safe values.
--   The existing frontend (useRecentFundingFeed) already declares these
--   fields as optional (source_type?, rumor_status?, confidence_score?),
--   so no frontend change needed just to add columns.
--
-- DEPENDS ON: 20260430100000 (fi_deals_canonical), 20260430110000 (union RPC)
-- =============================================================================

DO $migration$
BEGIN
  IF to_regclass('public.funding_deals') IS NOT NULL
     AND to_regclass('public.fi_deals_canonical') IS NOT NULL
  THEN
    EXECUTE $fn$

CREATE OR REPLACE FUNCTION public.get_recent_funding_feed(p_limit integer DEFAULT 80)
RETURNS TABLE (
  id               text,
  company_name     text,
  website_url      text,
  sector           text,
  round_kind       text,
  amount_label     text,
  announced_at     text,
  lead_investor    text,
  lead_website_url text,
  co_investors     text[],
  source_url       text,
  -- ── New metadata columns ────────────────────────────────────────────
  source_type         text,        -- 'news' | 'curated_feed' | 'rumor' | 'api'
  confirmation_status text,        -- 'confirmed' | 'rumor'
  confidence_score    numeric      -- 0.0 – 1.0
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $body$
  WITH lim AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 80), 1), 200)::integer AS n
  ),

  -- ── Leg A: legacy Prisma-managed funding_deals ─────────────────────
  legacy AS (
    SELECT
      fd.id::text                                                                AS id,
      fd.company_name::text                                                      AS company_name,
      COALESCE(NULLIF(btrim(fd.company_website), ''), '')::text                 AS website_url,
      COALESCE(
        CASE
          WHEN lower(coalesce(nullif(btrim(fd.sector_normalized), ''), '')) = 'ai'
            AND lower(coalesce(sa.title, '') || ' ' || coalesce(left(sa.raw_text, 8000), ''))
              ~ 'fintech|financial risk|transaction data|merchant intelligence|payment|embedded finance|lending|risk management'
          THEN 'fintech'
          ELSE NULL
        END,
        NULLIF(btrim(fd.sector_normalized), ''),
        NULLIF(btrim(fd.sector_raw), ''),
        'Unknown'
      )::text                                                                    AS sector,
      COALESCE(
        NULLIF(btrim(fd.round_type_normalized), ''),
        NULLIF(btrim(fd.round_type_raw), ''),
        'Unknown'
      )::text                                                                    AS round_kind,
      (CASE
        WHEN fd.amount_raw IS NOT NULL AND btrim(fd.amount_raw) <> '' THEN btrim(fd.amount_raw)
        WHEN fd.amount_minor_units IS NOT NULL THEN
          '$' || to_char((fd.amount_minor_units::numeric / 100.0), 'FM999,999,999,990')
        ELSE '—'
      END)::text                                                                 AS amount_label,
      COALESCE(
        fd.announced_date::text,
        (sa.published_at AT TIME ZONE 'UTC')::date::text,
        (fd.created_at AT TIME ZONE 'UTC')::date::text
      )::text                                                                    AS announced_at,
      COALESCE(
        NULLIF(
          trim(regexp_replace(
            regexp_replace(coalesce(lead_row.name_raw, ''),
              '\s*\|\s*(TechCrunch|GeekWire|AlleyWatch)\s*', '', 'ig'),
            '\s+', ' ', 'g')),
          ''
        ),
        'Unknown'
      )::text                                                                    AS lead_investor,
      NULL::text                                                                 AS lead_website_url,
      COALESCE(part_rows.names, ARRAY[]::text[])                                AS co_investors,
      sa.article_url::text                                                       AS source_url,
      -- Metadata — legacy deals come from TechCrunch / news sources
      'news'::text                                                               AS source_type,
      'confirmed'::text                                                          AS confirmation_status,
      fd.extraction_confidence::numeric                                          AS confidence_score,
      -- Dedup key
      lower(btrim(fd.company_name_normalized)) || '::' ||
        lower(COALESCE(NULLIF(btrim(fd.round_type_normalized), ''), 'unknown')) || '::' ||
        to_char(
          date_trunc('week',
            COALESCE(fd.announced_date, sa.published_at::date, fd.created_at::date))::date,
          'YYYY-MM-DD'
        )                                                                        AS dedup_key,
      CASE WHEN fd.duplicate_of_deal_id IS NULL AND NOT COALESCE(fd.needs_review, false)
           THEN 2 ELSE -1 END                                                   AS priority
    FROM public.funding_deals fd
    INNER JOIN public.source_articles sa ON sa.id = fd.source_article_id
    LEFT JOIN LATERAL (
      SELECT fdi.name_raw
      FROM public.funding_deal_investors fdi
      WHERE fdi.funding_deal_id = fd.id AND fdi.role = 'LEAD'::"FundingDealInvestorRole"
      ORDER BY fdi.sort_order ASC, fdi.id ASC LIMIT 1
    ) lead_row ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(
        array_agg(
          trim(regexp_replace(
            regexp_replace(fdi.name_raw, '\s*\|\s*(TechCrunch|GeekWire|AlleyWatch)\s*', '', 'ig'),
            '\s+', ' ', 'g'))
          ORDER BY fdi.sort_order ASC, fdi.id ASC
        ),
        ARRAY[]::text[]
      ) AS names
      FROM public.funding_deal_investors fdi
      WHERE fdi.funding_deal_id = fd.id
        AND fdi.role = 'PARTICIPANT'::"FundingDealInvestorRole"
        AND length(trim(fdi.name_raw)) > 0
    ) part_rows ON true
    WHERE fd.duplicate_of_deal_id IS NULL
      AND fd.needs_review IS NOT TRUE
  ),

  -- ── Leg B: new fi_deals_canonical ─────────────────────────────────
  canonical AS (
    SELECT
      fdc.id::text                                                               AS id,
      fdc.company_name::text                                                     AS company_name,
      COALESCE(NULLIF(btrim(fdc.company_website), ''), '')::text                AS website_url,
      COALESCE(
        NULLIF(btrim(fdc.sector_normalized), ''),
        NULLIF(btrim(fdc.sector_raw), ''),
        'Unknown'
      )::text                                                                    AS sector,
      COALESCE(
        NULLIF(btrim(fdc.round_type_normalized), ''),
        NULLIF(btrim(fdc.round_type_raw), ''),
        'Unknown'
      )::text                                                                    AS round_kind,
      (CASE
        WHEN fdc.amount_raw IS NOT NULL AND btrim(fdc.amount_raw) <> '' THEN btrim(fdc.amount_raw)
        WHEN fdc.amount_minor_units IS NOT NULL THEN
          '$' || to_char((fdc.amount_minor_units::numeric / 100.0), 'FM999,999,999,990')
        ELSE '—'
      END)::text                                                                 AS amount_label,
      COALESCE(
        fdc.announced_date::text,
        (fdc.created_at AT TIME ZONE 'UTC')::date::text
      )::text                                                                    AS announced_at,
      COALESCE(NULLIF(btrim(fdc.lead_investor), ''), 'Unknown')::text           AS lead_investor,
      NULL::text                                                                 AS lead_website_url,
      COALESCE(fdc.co_investors, ARRAY[]::text[])                               AS co_investors,
      COALESCE(fdc.primary_press_url, fdc.primary_source_url)::text             AS source_url,
      -- Metadata from new pipeline
      COALESCE(NULLIF(btrim(fdc.source_type::text), ''), 'news')::text         AS source_type,
      CASE WHEN fdc.is_rumor THEN 'rumor' ELSE 'confirmed' END::text            AS confirmation_status,
      fdc.confidence_score::numeric                                              AS confidence_score,
      -- Dedup key
      lower(btrim(fdc.normalized_company_name)) || '::' ||
        lower(COALESCE(NULLIF(btrim(fdc.round_type_normalized), ''), 'unknown')) || '::' ||
        to_char(
          date_trunc('week',
            COALESCE(fdc.announced_date, (fdc.created_at AT TIME ZONE 'UTC')::date))::date,
          'YYYY-MM-DD'
        )                                                                        AS dedup_key,
      CASE fdc.source_type
        WHEN 'api'          THEN 4
        WHEN 'curated_feed' THEN 3
        WHEN 'news'         THEN 3
        WHEN 'rumor'        THEN 1
        ELSE 2
      END                                                                        AS priority
    FROM public.fi_deals_canonical fdc
    WHERE fdc.duplicate_of_deal_id IS NULL
      AND fdc.needs_review = false
  ),

  -- ── Union + dedupe ────────────────────────────────────────────────
  combined AS (
    SELECT * FROM legacy
    UNION ALL
    SELECT * FROM canonical
  ),
  ranked AS (
    SELECT *,
      row_number() OVER (
        PARTITION BY dedup_key
        ORDER BY priority DESC, announced_at DESC NULLS LAST
      ) AS rn
    FROM combined
  )

  SELECT
    id, company_name, website_url, sector, round_kind, amount_label,
    announced_at, lead_investor, lead_website_url, co_investors, source_url,
    source_type, confirmation_status, confidence_score
  FROM ranked
  CROSS JOIN lim
  WHERE rn = 1
    AND announced_at IS NOT NULL
  ORDER BY announced_at DESC NULLS LAST
  LIMIT (SELECT n FROM lim);
$body$;

    $fn$;

    COMMENT ON FUNCTION public.get_recent_funding_feed(integer) IS
      'Union of legacy funding_deals + fi_deals_canonical; adds source_type, confirmation_status, confidence_score for UI badges.';

    GRANT EXECUTE ON FUNCTION public.get_recent_funding_feed(integer)
      TO anon, authenticated, service_role;

  ELSIF to_regclass('public.funding_deals') IS NOT NULL THEN
    RAISE NOTICE 'fi_deals_canonical not found; get_recent_funding_feed not updated.';
  END IF;
END
$migration$;
