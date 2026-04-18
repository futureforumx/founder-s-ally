-- =============================================================================
-- MIGRATION: 20260423200000_connected_accounts_connector_manage_rls
-- PURPOSE:   Align connected_accounts INSERT/UPDATE/DELETE RLS with Vercel
--            owner-only connector management (assertConnectorManagementForUser).
--            SELECT unchanged (still my_owner_context_ids — any member can read).
--            Service role bypasses RLS; no change required for backend flows.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Context IDs for which the JWT user may mutate connector rows
--    (personal: bound user_id; workspace: membership role owner only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_connector_manageable_owner_context_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.owner_contexts
  WHERE user_id = (auth.jwt()->>'sub')
  UNION
  SELECT oc.id
  FROM public.owner_contexts oc
  INNER JOIN public.workspace_memberships wm
    ON wm.workspace_id = oc.workspace_id
  WHERE oc.workspace_id IS NOT NULL
    AND wm.user_id = (auth.jwt()->>'sub')
    AND lower(trim(both from coalesce(wm.role, ''))) = 'owner';
$$;

COMMENT ON FUNCTION public.my_connector_manageable_owner_context_ids() IS
  'Owner contexts where the current JWT user may INSERT/UPDATE/DELETE connected_accounts: personal (user_id=sub) or workspace with owner membership.';

REVOKE ALL ON FUNCTION public.my_connector_manageable_owner_context_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_connector_manageable_owner_context_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_connector_manageable_owner_context_ids() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Replace mutation policies on connected_accounts (SELECT unchanged)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "connected_accounts_insert" ON public.connected_accounts;
DROP POLICY IF EXISTS "connected_accounts_update" ON public.connected_accounts;
DROP POLICY IF EXISTS "connected_accounts_delete" ON public.connected_accounts;

CREATE POLICY "connected_accounts_insert"
  ON public.connected_accounts FOR INSERT TO authenticated
  WITH CHECK (
    owner_context_id IN (SELECT public.my_connector_manageable_owner_context_ids())
  );

CREATE POLICY "connected_accounts_update"
  ON public.connected_accounts FOR UPDATE TO authenticated
  USING (
    owner_context_id IN (SELECT public.my_connector_manageable_owner_context_ids())
  )
  WITH CHECK (
    owner_context_id IN (SELECT public.my_connector_manageable_owner_context_ids())
  );

CREATE POLICY "connected_accounts_delete"
  ON public.connected_accounts FOR DELETE TO authenticated
  USING (
    owner_context_id IN (SELECT public.my_connector_manageable_owner_context_ids())
  );
