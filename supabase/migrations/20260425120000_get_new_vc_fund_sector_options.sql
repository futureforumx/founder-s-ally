-- Distinct sector_focus tags for the Fresh Capital sector dropdown, sourced from the same
-- vc_funds + firm_records cohort as get_new_vc_funds (date window + optional stage), without
-- applying a sector filter so the list reflects the database, not only the current page slice.

CREATE OR REPLACE FUNCTION public.get_new_vc_fund_sector_options(
  p_days integer DEFAULT 150,
  p_stage text[] DEFAULT NULL,
  p_limit integer DEFAULT 120
)
RETURNS TABLE (sector text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.sector
  FROM (
    SELECT
      btrim(u.tag) AS sector,
      count(*)::bigint AS cnt
    FROM public.vc_funds vf
    INNER JOIN public.firm_records fr
      ON fr.id = vf.firm_record_id
    CROSS JOIN LATERAL unnest(COALESCE(vf.sector_focus, ARRAY[]::text[]])) AS u(tag)
    WHERE vf.deleted_at IS NULL
      AND (
        COALESCE(vf.announced_date, vf.close_date, (vf.created_at AT TIME ZONE 'UTC')::date)
        >= CURRENT_DATE - GREATEST(COALESCE(p_days, 90), 1)
      )
      AND (p_stage IS NULL OR vf.stage_focus && p_stage)
      AND length(btrim(u.tag)) > 0
    GROUP BY btrim(u.tag)
  ) x
  ORDER BY x.cnt DESC NULLS LAST, x.sector ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 300);
$$;

COMMENT ON FUNCTION public.get_new_vc_fund_sector_options(integer, text[], integer) IS
  'Public-safe distinct sector_focus values for funds in the same recency window as get_new_vc_funds; optional stage overlap filter.';

GRANT EXECUTE ON FUNCTION public.get_new_vc_fund_sector_options(integer, text[], integer) TO anon, authenticated, service_role;
