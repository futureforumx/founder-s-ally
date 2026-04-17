-- Public read of ingested funding deals for the in-app Recent funding tab.
-- Requires Prisma migration: prisma/migrations/20260415120000_funding_news_ingestion (same Postgres as Supabase).

CREATE OR REPLACE FUNCTION public.get_recent_funding_feed(p_limit integer DEFAULT 80)
RETURNS TABLE (
  id text,
  company_name text,
  website_url text,
  sector text,
  round_kind text,
  amount_label text,
  announced_at text,
  lead_investor text,
  lead_website_url text,
  co_investors text[],
  source_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lim AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 80), 1), 200)::integer AS n
  )
  SELECT
    fd.id::text,
    fd.company_name::text,
    COALESCE(NULLIF(btrim(fd.company_website), ''), '')::text AS website_url,
    COALESCE(
      NULLIF(btrim(fd.sector_normalized), ''),
      NULLIF(btrim(fd.sector_raw), ''),
      'Unknown'
    )::text AS sector,
    COALESCE(
      NULLIF(btrim(fd.round_type_normalized), ''),
      NULLIF(btrim(fd.round_type_raw), ''),
      'Unknown'
    )::text AS round_kind,
    (
      CASE
        WHEN fd.amount_raw IS NOT NULL AND btrim(fd.amount_raw) <> '' THEN btrim(fd.amount_raw)
        WHEN fd.amount_minor_units IS NOT NULL THEN
          '$' || to_char((fd.amount_minor_units::numeric / 100.0), 'FM999,999,999,990')
        ELSE '—'
      END
    )::text AS amount_label,
    COALESCE(
      fd.announced_date::text,
      (sa.published_at AT TIME ZONE 'UTC')::date::text,
      (fd.created_at AT TIME ZONE 'UTC')::date::text
    )::text AS announced_at,
    COALESCE(lead_row.name_raw, 'Unknown'::text) AS lead_investor,
    NULL::text AS lead_website_url,
    COALESCE(part_rows.names, ARRAY[]::text[]) AS co_investors,
    sa.article_url::text AS source_url
  FROM public.funding_deals fd
  INNER JOIN public.source_articles sa ON sa.id = fd.source_article_id
  LEFT JOIN LATERAL (
    SELECT fdi.name_raw
    FROM public.funding_deal_investors fdi
    WHERE fdi.funding_deal_id = fd.id
      AND fdi.role = 'LEAD'::"FundingDealInvestorRole"
    ORDER BY fdi.sort_order ASC, fdi.id ASC
    LIMIT 1
  ) lead_row ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(fdi.name_raw ORDER BY fdi.sort_order ASC, fdi.id ASC) AS names
    FROM public.funding_deal_investors fdi
    WHERE fdi.funding_deal_id = fd.id
      AND fdi.role = 'PARTICIPANT'::"FundingDealInvestorRole"
  ) part_rows ON true
  CROSS JOIN lim
  WHERE fd.duplicate_of_deal_id IS NULL
    AND fd.needs_review IS NOT TRUE
  ORDER BY
    COALESCE(fd.announced_date, sa.published_at::date, fd.created_at::date) DESC NULLS LAST,
    fd.updated_at DESC
  LIMIT (SELECT n FROM lim);
$$;

COMMENT ON FUNCTION public.get_recent_funding_feed(integer) IS
  'Latest normalized funding_deals for UI; excludes duplicates and needs_review.';

GRANT EXECUTE ON FUNCTION public.get_recent_funding_feed(integer) TO anon, authenticated, service_role;
