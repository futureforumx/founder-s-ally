-- Harden Network directory reads for anon: ensure RLS is actually enforced, grants exist,
-- and organizations are readable when they have a description (bulk data often has ready_for_live=false).

ALTER TABLE IF EXISTS public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organizations ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.roles TO anon, authenticated;
GRANT SELECT ON TABLE public.people TO anon, authenticated;
GRANT SELECT ON TABLE public.organizations TO anon, authenticated;

DROP POLICY IF EXISTS "public_select_live_directory_organizations" ON public.organizations;
CREATE POLICY "public_select_live_directory_organizations" ON public.organizations
  FOR SELECT
  TO anon, authenticated
  USING (description IS NOT NULL);
