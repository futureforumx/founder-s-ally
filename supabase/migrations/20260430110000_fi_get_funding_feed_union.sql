-- =============================================================================
-- MIGRATION: 20260430110000_fi_get_funding_feed_union
-- PURPOSE:   Extend get_recent_funding_feed to UNION results from the new
--            fi_deals_canonical table alongside the existing funding_deals +
--            source_articles path.
--
-- SAFETY:    The new fi_* tables must exist (from 20260430100000).
--            The existing RPC is replaced in-place; same signature, same
--            return columns — no frontend changes needed.
--
-- DEDUPLICATION IN THE RPC:
--   We use a row_number() window function to eliminate cross-table duplicates
--   by (normalized_company_name, round_type_normalized, date_window).
--   The row ranked #1 wins; preference order:
--     1. api-source canonical deals (confidence >= 0.90)
--     2. curated_feed canonical deals
--     3. existing funding_deals (Prisma-managed)
--     4. rumor canonical deals (lowest)
-- =============================================================================

DO $migration$
BEGIN
  -- Only create the union variant if BOTH tables exist.
  IF to_regclass('public.funding_deals') IS NOT NULL
     AND to_regclass('public.fi_deals_canonical') IS NOT NULL
  THEN
    EXECUTE $fn$

CREATE OR REPLACE FUNCTION public.get_recent_funding_feed(p_limit integer DEFAULT 80)
RETURNS TABLE (
  id             text,
  company_name   text,
  website_url    text,
  sector         text,
  round_kind     text,
  amount_label   text,
  announced_at   text,
  lead_investor  text,
  lead_website_url text,
  co_investors   text[],
  source_url     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $body$
  WITH lim AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 80), 1), 200)::integer AS n
  ),

  -- ── Leg A: existing Prisma-managed funding_deals ──────────────────────
  legacy AS (
    SELECT
      fd.id::text                                            AS id,
      fd.company_name::text                                  AS company_name,
      COALESCE(NULLIF(btrim(fd.company_website), ''), '')::text AS website_url,
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
      )::text                                                AS sector,
      COALESCE(
        NULLIF(btrim(fd.round_type_normalized), ''),
        NULLIF(btrim(fd.round_type_raw), ''),
        'Unknown'
      )::text                                                AS round_kind,
      (CASE
        WHEN fd.amount_raw IS NOT NULL AND btrim(fd.amount_raw) <> '' THEN btrim(fd.amount_raw)
        WHEN fd.amount_minor_units IS NOT NULL THEN
          '$' || to_char((fd.amount_minor_units::numeric / 100.0), 'FM999,999,999,990')
        ELSE '—'
      END)::text                                             AS amount_label,
      COALESCE(
        fd.announced_date::text,
        (sa.published_at AT TIME ZONE 'UTC')::date::text,
        (fd.created_at AT TIME ZONE 'UTC')::date::text
      )::text                                                AS announced_at,
      COALESCE(
        NULLIF(
          trim(regexp_replace(
            regexp_replace(coalesce(lead_row.name_raw, ''),
              '\s*\|\s*(TechCrunch|GeekWire|AlleyWatch)\s*', '', 'ig'),
            '\s+', ' ', 'g')),
          ''
        ),
        'Unknown'
      )::text                                                AS lead_investor,
      NULL::text                                             AS lead_website_url,
      COALESCE(part_rows.names, ARRAY[]::text[])             AS co_investors,
      sa.article_url::text                                   AS source_url,
      -- Dedup key
      lower(btrim(fd.company_name_normalized)) || '::' ||
        lower(COALESCE(NULLIF(btrim(fd.round_type_normalized), ''), 'unknown')) || '::' ||
        to_char(
          date_trunc('week',
            COALESCE(fd.announced_date, sa.published_at::date, fd.created_at::date)
          )::date,
          'YYYY-MM-DD'
        )                                                    AS dedup_key,
      -- Priority: prefer legacy over rumor-only fi records
      CASE WHEN fd.duplicate_of_deal_id IS NULL AND NOT COALESCE(fd.needs_review, false) THEN 2 ELSE -1 END AS priority
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

  -- ── Leg B: new fi_deals_canonical ─────────────────────────────────────
  canonical AS (
    SELECT
      fdc.id::text                                           AS id,
      fdc.company_name::text                                 AS company_name,
      COALESCE(NULLIF(btrim(fdc.company_website), ''), '')::text AS website_url,
      COALESCE(
        NULLIF(btrim(fdc.sector_normalized), ''),
        NULLIF(btrim(fdc.sector_raw), ''),
        'Unknown'
      )::text                                                AS sector,
      COALESCE(
        NULLIF(btrim(fdc.round_type_normalized), ''),
        NULLIF(btrim(fdc.round_type_raw), ''),
        'Unknown'
      )::text                                                AS round_kind,
      (CASE
        WHEN fdc.amount_raw IS NOT NULL AND btrim(fdc.amount_raw) <> '' THEN btrim(fdc.amount_raw)
        WHEN fdc.amount_minor_units IS NOT NULL THEN
          '$' || to_char((fdc.amount_minor_units::numeric / 100.0), 'FM999,999,999,990')
        ELSE '—'
      END)::text                                             AS amount_label,
      COALESCE(fdc.announced_date::text, (fdc.created_at AT TIME ZONE 'UTC')::date::text)::text AS announced_at,
      COALESCE(NULLIF(btrim(fdc.lead_investor), ''), 'Unknown')::text  AS lead_investor,
      NULL::text                                             AS lead_website_url,
      COALESCE(fdc.co_investors, ARRAY[]::text[])            AS co_investors,
      COALESCE(fdc.primary_press_url, fdc.primary_source_url)::text AS source_url,
      -- Dedup key matches legacy format
      lower(btrim(fdc.normalized_company_name)) || '::' ||
        lower(COALESCE(NULLIF(btrim(fdc.round_type_normalized), ''), 'unknown')) || '::' ||
        to_char(
          date_trunc('week',
            COALESCE(fdc.announced_date, (fdc.created_at AT TIME ZONE 'UTC')::date)
          )::date,
          'YYYY-MM-DD'
        )                                                    AS dedup_key,
      -- Priority: api > curated_feed > news > rumor
      CASE fdc.source_type
        WHEN 'api'           THEN 4
        WHEN 'curated_feed'  THEN 3
        WHEN 'news'          THEN 3
        WHEN 'rumor'         THEN 1
        ELSE 2
      END                                                    AS priority
    FROM public.fi_deals_canonical fdc
    WHERE fdc.duplicate_of_deal_id IS NULL
      AND fdc.needs_review = false
  ),

  -- ── Union both legs ───────────────────────────────────────────────────
  combined AS (
    SELECT * FROM legacy
    UNION ALL
    SELECT * FROM canonical
  ),

  -- ── Deduplicate: keep highest-priority row per dedup_key ─────────────
  ranked AS (
    SELECT *,
      row_number() OVER (
        PARTITION BY dedup_key
        ORDER BY priority DESC, announced_at DESC NULLS LAST
      ) AS rn
    FROM combined
  )

  SELECT
    id, company_name, website_url, sector, round_kind,
    amount_label, announced_at, lead_investor, lead_website_url,
    co_investors, source_url
  FROM ranked
  CROSS JOIN lim
  WHERE rn = 1
    AND announced_at IS NOT NULL
  ORDER BY announced_at DESC NULLS LAST
  LIMIT (SELECT n FROM lim);
$body$;

    $fn$;

    COMMENT ON FUNCTION public.get_recent_funding_feed(integer) IS
      'Union of legacy funding_deals + new fi_deals_canonical; deduped by (normalized_company, round, week); ordered by announced_at desc.';

    GRANT EXECUTE ON FUNCTION public.get_recent_funding_feed(integer)
      TO anon, authenticated, service_role;

  ELSIF to_regclass('public.funding_deals') IS NOT NULL THEN
    -- fi_deals_canonical doesn't exist yet — keep existing RPC unchanged
    RAISE NOTICE 'fi_deals_canonical not found; get_recent_funding_feed unchanged.';
  ELSE
    RAISE NOTICE 'Neither funding_deals nor fi_deals_canonical found; no RPC changes.';
  END IF;
END
$migration$;
