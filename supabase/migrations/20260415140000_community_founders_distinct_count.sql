-- Exact count of distinct people in the public founder directory (roles → people).
-- Used by Community / Network views so UI totals match Postgres, not client-side merges.

CREATE OR REPLACE FUNCTION public.community_founders_distinct_count()
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(DISTINCT r."personId")::bigint
  FROM public.roles r
  WHERE r."isCurrent" = true
    AND r."roleType" IN ('founder', 'cofounder', 'ceo')
    AND r."personId" IS NOT NULL;
$$;

COMMENT ON FUNCTION public.community_founders_distinct_count() IS
  'Row count for Network → Founders: distinct current founder/CEO roles.';

GRANT EXECUTE ON FUNCTION public.community_founders_distinct_count() TO anon;
GRANT EXECUTE ON FUNCTION public.community_founders_distinct_count() TO authenticated;
