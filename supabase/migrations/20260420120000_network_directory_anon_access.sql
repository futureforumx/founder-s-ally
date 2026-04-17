-- Network directory: SQL editor (postgres) shows thousands of founders, but the SPA uses the
-- anon publishable key. Without matching RLS policies (or SECURITY DEFINER), counts and grids stay empty.

-- 1) Founder count RPC — run with definer so anon gets the same number as ad-hoc SQL.
CREATE OR REPLACE FUNCTION public.community_founders_distinct_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT r."personId")::bigint
  FROM public.roles r
  WHERE r."isCurrent" IS TRUE
    AND r."roleType" IN ('founder', 'cofounder', 'ceo')
    AND r."personId" IS NOT NULL;
$$;

COMMENT ON FUNCTION public.community_founders_distinct_count() IS
  'Row count for Network → Founders (SECURITY DEFINER so anon matches postgres counts under RLS).';

REVOKE ALL ON FUNCTION public.community_founders_distinct_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_founders_distinct_count() TO anon;
GRANT EXECUTE ON FUNCTION public.community_founders_distinct_count() TO authenticated;

-- 2) RLS: allow anon + authenticated to read the same slices the Network UI queries.
--    (SPA uses anon; signed-in clients may use authenticated — include both.)
DROP POLICY IF EXISTS "anon_select_directory_roles" ON public.roles;
DROP POLICY IF EXISTS "public_select_directory_roles" ON public.roles;
CREATE POLICY "public_select_directory_roles" ON public.roles
  FOR SELECT
  TO anon, authenticated
  USING (
    "isCurrent" IS TRUE
    AND "roleType" IN ('founder', 'cofounder', 'ceo')
    AND "personId" IS NOT NULL
  );

DROP POLICY IF EXISTS "anon_select_directory_people_for_roles" ON public.people;
DROP POLICY IF EXISTS "public_select_directory_people_for_roles" ON public.people;
CREATE POLICY "public_select_directory_people_for_roles" ON public.people
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.roles r
      WHERE r."personId" = people.id
        AND r."isCurrent" IS TRUE
        AND r."roleType" IN ('founder', 'cofounder', 'ceo')
    )
  );

DROP POLICY IF EXISTS "anon_select_live_directory_organizations" ON public.organizations;
DROP POLICY IF EXISTS "public_select_live_directory_organizations" ON public.organizations;
CREATE POLICY "public_select_live_directory_organizations" ON public.organizations
  FOR SELECT
  TO anon, authenticated
  USING (description IS NOT NULL AND ready_for_live IS TRUE);

DROP POLICY IF EXISTS "anon_select_live_directory_operator_profiles" ON public.operator_profiles;
DROP POLICY IF EXISTS "public_select_live_directory_operator_profiles" ON public.operator_profiles;
CREATE POLICY "public_select_live_directory_operator_profiles" ON public.operator_profiles
  FOR SELECT
  TO anon, authenticated
  USING (
    deleted_at IS NULL
    AND is_available IS TRUE
    AND ready_for_live IS TRUE
  );
