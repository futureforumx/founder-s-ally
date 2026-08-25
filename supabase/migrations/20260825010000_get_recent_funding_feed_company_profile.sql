-- Latest Funding expanded rows need HQ + company description without an organizations lookup.
-- Surface sanitized funding_deals.company_hq / deal_summary (and canonical equivalents).

DO $migration$
BEGIN
  IF to_regclass('public.funding_deals') IS NOT NULL
     AND to_regclass('public.source_articles') IS NOT NULL
     AND to_regclass('public.funding_deal_investors') IS NOT NULL
     AND to_regclass('public.fi_deals_canonical') IS NOT NULL THEN

    DROP FUNCTION IF EXISTS public.get_recent_funding_feed(integer);

    EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.get_recent_funding_feed(p_limit integer DEFAULT 80)
RETURNS TABLE (
  id                  text,
  company_name        text,
  website_url         text,
  company_logo_url    text,
  company_hq          text,
  description         text,
  sector              text,
  round_kind          text,
  amount_label        text,
  announced_at        text,
  lead_investor       text,
  lead_website_url    text,
  co_investors        text[],
  source_url          text,
  source_type         text,
  confirmation_status text,
  confidence_score    numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $body$
  WITH lim AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 80), 1), 200)::integer AS n
  ),

  legacy AS (
    SELECT
      fd.id::text                                                                AS id,
      fd.company_name::text                                                      AS company_name,
      COALESCE(NULLIF(btrim(fd.company_website), ''), '')::text                 AS website_url,
      NULL::text                                                                 AS company_logo_url,
      CASE
        WHEN fd.company_hq IS NULL THEN NULL
        WHEN char_length(btrim(fd.company_hq)) BETWEEN 3 AND 80
          AND position(',' in btrim(fd.company_hq)) > 0
          AND btrim(fd.company_hq) !~* 'raises|http|toggle|subscribe|join for free'
        THEN btrim(fd.company_hq)
        ELSE NULL
      END::text                                                                  AS company_hq,
      CASE
        WHEN fd.deal_summary IS NULL THEN NULL
        WHEN char_length(btrim(fd.deal_summary)) BETWEEN 40 AND 900
          AND btrim(fd.deal_summary) !~* 'join for free|toggle search|flash sale|subscribe sign in|alleywatch|apply to contribute|share on facebook'
          AND btrim(fd.deal_summary) !~* '^[^.!?]{0,90}raises?[[:space:]]+\$'
        THEN left(btrim(fd.deal_summary), 600)
        ELSE NULL
      END::text                                                                  AS description,
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
      'news'::text                                                               AS source_type,
      'confirmed'::text                                                          AS confirmation_status,
      fd.extraction_confidence::numeric                                          AS confidence_score,
      lower(regexp_replace(btrim(coalesce(fd.company_name_normalized, '')), '\s+', ' ', 'g')) || '::' ||
        lower(regexp_replace(
          COALESCE(NULLIF(btrim(fd.round_type_normalized), ''), 'unknown'),
          '\s+', ' ', 'g'
        )) || '::' ||
        to_char(
          date_trunc('week',
            COALESCE(fd.announced_date, sa.published_at::date, fd.created_at::date))::date,
          'YYYY-MM-DD'
        )                                                                        AS dedup_key,
      CASE WHEN fd.duplicate_of_deal_id IS NULL AND NOT COALESCE(fd.needs_review, false)
           THEN 60 ELSE -1 END                                                   AS priority
    FROM public.funding_deals fd
    INNER JOIN public.source_articles sa ON sa.id = fd.source_article_id
    LEFT JOIN LATERAL (
      SELECT fdi.name_raw
      FROM public.funding_deal_investors fdi
      WHERE fdi.funding_deal_id = fd.id AND fdi.role = 'LEAD'::"FundingDealInvestorRole"
      ORDER BY fdi.sort_order ASC, fdi.id ASC
      LIMIT 1
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

  canonical AS (
    SELECT
      fdc.id::text                                                               AS id,
      fdc.company_name::text                                                     AS company_name,
      COALESCE(NULLIF(btrim(fdc.company_website), ''), '')::text                AS website_url,
      NULLIF(btrim(fdc.company_logo_url), '')::text                             AS company_logo_url,
      CASE
        WHEN fdc.company_location IS NULL THEN NULL
        WHEN char_length(btrim(fdc.company_location)) BETWEEN 3 AND 80
          AND position(',' in btrim(fdc.company_location)) > 0
          AND btrim(fdc.company_location) !~* 'raises|http|toggle|subscribe|join for free'
        THEN btrim(fdc.company_location)
        ELSE NULL
      END::text                                                                  AS company_hq,
      CASE
        WHEN fdc.extracted_summary IS NULL THEN NULL
        WHEN char_length(btrim(fdc.extracted_summary)) BETWEEN 40 AND 900
          AND btrim(fdc.extracted_summary) !~* 'join for free|toggle search|flash sale|subscribe sign in|alleywatch|apply to contribute|share on facebook'
          AND btrim(fdc.extracted_summary) !~* '^[^.!?]{0,90}raises?[[:space:]]+\$'
        THEN left(btrim(fdc.extracted_summary), 600)
        ELSE NULL
      END::text                                                                  AS description,
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
      COALESCE(NULLIF(btrim(fdc.source_type::text), ''), 'news')::text          AS source_type,
      CASE WHEN fdc.is_rumor THEN 'rumor' ELSE 'confirmed' END::text            AS confirmation_status,
      fdc.confidence_score::numeric                                              AS confidence_score,
      lower(regexp_replace(btrim(coalesce(fdc.normalized_company_name, '')), '\s+', ' ', 'g')) || '::' ||
        lower(regexp_replace(
          COALESCE(NULLIF(btrim(fdc.round_type_normalized), ''), 'unknown'),
          '\s+', ' ', 'g'
        )) || '::' ||
        to_char(
          date_trunc('week',
            COALESCE(fdc.announced_date, (fdc.created_at AT TIME ZONE 'UTC')::date))::date,
          'YYYY-MM-DD'
        )                                                                        AS dedup_key,
      CASE
        WHEN fdc.is_rumor THEN 45
        WHEN fdc.source_type::text = 'api' THEN 100
        WHEN fdc.source_type::text = 'curated_feed' THEN 95
        WHEN fdc.source_type::text = 'news' THEN 90
        ELSE 85
      END                                                                        AS priority
    FROM public.fi_deals_canonical fdc
    WHERE fdc.duplicate_of_deal_id IS NULL
      AND fdc.needs_review = false
  ),

  combined AS (
    SELECT * FROM legacy
    UNION ALL
    SELECT * FROM canonical
  ),
  ranked AS (
    SELECT *,
      row_number() OVER (
        PARTITION BY dedup_key
        ORDER BY
          priority DESC,
          (NULLIF(btrim(source_url), '') IS NOT NULL)::int DESC,
          COALESCE(confidence_score, 0) DESC,
          announced_at DESC NULLS LAST,
          id DESC
      ) AS rn
    FROM combined
  )

  SELECT
    id, company_name, website_url, company_logo_url, company_hq, description, sector, round_kind, amount_label,
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
      'Union funding_deals + fi_deals_canonical for Fresh Capital Latest Funding; includes company_logo_url, sanitized company_hq, and description.';

    GRANT EXECUTE ON FUNCTION public.get_recent_funding_feed(integer)
      TO anon, authenticated, service_role;
  ELSE
    RAISE NOTICE 'Funding feed tables missing; get_recent_funding_feed was not redefined.';
  END IF;
END
$migration$;
