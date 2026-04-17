-- Fix infinite recursion in company_members RLS policies.
--
-- "Members can see co-members" and "Owners can update memberships" both query
-- company_members inside a policy on company_members, causing Postgres to recurse
-- infinitely. The fix is SECURITY DEFINER helper functions that bypass RLS when
-- resolving the current user's memberships.

CREATE OR REPLACE FUNCTION public.get_my_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.company_members WHERE user_id = (auth.jwt()->>'sub');
$$;

CREATE OR REPLACE FUNCTION public.is_company_owner(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = _company_id
      AND user_id = (auth.jwt()->>'sub')
      AND role = 'owner'
  );
$$;

DROP POLICY IF EXISTS "Members can see co-members" ON public.company_members;
DROP POLICY IF EXISTS "Owners can update memberships" ON public.company_members;

CREATE POLICY "Members can see co-members" ON public.company_members
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.get_my_company_ids()));

CREATE POLICY "Owners can update memberships" ON public.company_members
  FOR UPDATE TO authenticated
  USING (public.is_company_owner(company_id));
