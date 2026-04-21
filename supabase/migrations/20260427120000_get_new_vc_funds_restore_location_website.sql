-- Restore firm_location + firm_website_url on get_new_vc_funds.
-- Migration 20260426180000_get_new_vc_funds_firm_mark.sql redefined the RPC but
-- accidentally dropped these columns that 20260420114500_get_new_vc_funds_firm_meta.sql
-- had added — the app could no longer render website/location in FirmMetaRow.

DROP FUNCTION IF EXISTS public.get_new_vc_funds(integer, integer, text[], text[], text[], numeric, numeric, text[]);

CREATE OR REPLACE FUNCTION public.get_new_vc_funds(
  p_limit integer DEFAULT 50,
  p_days integer DEFAULT 90,
  p_stage text[] DEFAULT NULL,
  p_sector text[] DEFAULT NULL,
  p_geography text[] DEFAULT NULL,
  p_fund_size_min numeric DEFAULT NULL,
  p_fund_size_max numeric DEFAULT NULL,
  p_firm_type text[] DEFAULT NULL
)
RETURNS TABLE (
  vc_fund_id uuid,
  firm_record_id uuid,
  firm_name text,
  fund_name text,
  fund_type text,
  fund_sequence_number integer,
  vintage_year integer,
  announced_date date,
  close_date date,
  target_size_usd numeric,
  final_size_usd numeric,
  status public.vc_fund_status_enum,
  source_confidence numeric,
  announcement_url text,
  announcement_title text,
  stage_focus text[],
  sector_focus text[],
  geography_focus text[],
  has_fresh_capital boolean,
  fresh_capital_priority_score numeric,
  likely_actively_deploying boolean,
  firm_logo_url text,
  firm_domain text,
  firm_location text,
  firm_website_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lim AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)::integer AS n
  )
  SELECT
    vf.id AS vc_fund_id,
    fr.id AS firm_record_id,
    fr.firm_name,
    vf.name AS fund_name,
    vf.fund_type,
    vf.fund_sequence_number,
    vf.vintage_year,
    vf.announced_date,
    vf.close_date,
    vf.target_size_usd,
    vf.final_size_usd,
    vf.status,
    vf.source_confidence,
    vf.announcement_url,
    vf.announcement_title,
    vf.stage_focus,
    vf.sector_focus,
    vf.geography_focus,
    fr.has_fresh_capital,
    fr.fresh_capital_priority_score,
    COALESCE(
      vf.likely_actively_deploying,
      (
        vf.active_deployment_window_start IS NOT NULL
        AND vf.active_deployment_window_end IS NOT NULL
        AND CURRENT_DATE BETWEEN vf.active_deployment_window_start AND vf.active_deployment_window_end
      )
    ) AS likely_actively_deploying,
    fr.logo_url AS firm_logo_url,
    CASE
      WHEN fr.domain IS NOT NULL AND btrim(fr.domain::text) <> '' THEN btrim(fr.domain::text)
      WHEN fr.website_url ~ '^https?://[^/]+' THEN (regexp_match(fr.website_url, '^https?://([^/]+)'))[1]
      ELSE NULL
    END AS firm_domain,
    COALESCE(
      NULLIF(btrim(fr.location), ''),
      NULLIF(
        concat_ws(
          ', ',
          NULLIF(btrim(fr.hq_city), ''),
          NULLIF(btrim(fr.hq_state), ''),
          NULLIF(btrim(fr.hq_country), '')
        ),
        ''
      )
    ) AS firm_location,
    NULLIF(btrim(fr.website_url), '') AS firm_website_url
  FROM public.vc_funds vf
  JOIN public.firm_records fr
    ON fr.id = vf.firm_record_id
  CROSS JOIN lim
  WHERE vf.deleted_at IS NULL
    AND (
      COALESCE(vf.announced_date, vf.close_date, (vf.created_at AT TIME ZONE 'UTC')::date) >= CURRENT_DATE - GREATEST(COALESCE(p_days, 90), 1)
    )
    AND (p_stage IS NULL OR vf.stage_focus && p_stage)
    AND (p_sector IS NULL OR vf.sector_focus && p_sector)
    AND (p_geography IS NULL OR vf.geography_focus && p_geography)
    AND (p_fund_size_min IS NULL OR COALESCE(vf.final_size_usd, vf.target_size_usd) >= p_fund_size_min)
    AND (p_fund_size_max IS NULL OR COALESCE(vf.final_size_usd, vf.target_size_usd) <= p_fund_size_max)
    AND (p_firm_type IS NULL OR fr.entity_type::text = ANY (p_firm_type))
  ORDER BY
    COALESCE(vf.announced_date, vf.close_date, (vf.created_at AT TIME ZONE 'UTC')::date) DESC NULLS LAST,
    vf.updated_at DESC
  LIMIT (SELECT n FROM lim);
$$;

COMMENT ON FUNCTION public.get_new_vc_funds(integer, integer, text[], text[], text[], numeric, numeric, text[]) IS
  'Public-safe recent VC fund announcements; firm mark + domain + HQ display line + website URL for Fresh Capital.';

GRANT EXECUTE ON FUNCTION public.get_new_vc_funds(integer, integer, text[], text[], text[], numeric, numeric, text[]) TO anon, authenticated, service_role;
