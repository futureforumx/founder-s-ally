-- =============================================================================
-- MIGRATION: 20260424100000_connector_pipeline_connector_manage_rls
-- PURPOSE:   Align connector pipeline INSERT/UPDATE RLS with owner-only
--            connector management (same rule as connected_accounts mutations).
--            Reuses public.my_connector_manageable_owner_context_ids().
--            SELECT policies unchanged; sync_runs UPDATE/DELETE still absent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. connector_source_records — owner-only INSERT/UPDATE; SELECT unchanged
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "connector_source_records_insert" ON public.connector_source_records;
DROP POLICY IF EXISTS "connector_source_records_update" ON public.connector_source_records;

CREATE POLICY "connector_source_records_insert"
  ON public.connector_source_records FOR INSERT TO authenticated
  WITH CHECK (
    owner_context_id IN (SELECT public.my_connector_manageable_owner_context_ids())
  );

CREATE POLICY "connector_source_records_update"
  ON public.connector_source_records FOR UPDATE TO authenticated
  USING (
    owner_context_id IN (SELECT public.my_connector_manageable_owner_context_ids())
  )
  WITH CHECK (
    owner_context_id IN (SELECT public.my_connector_manageable_owner_context_ids())
  );

-- ---------------------------------------------------------------------------
-- 2. sync_runs — owner-only INSERT; SELECT unchanged
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sync_runs_insert" ON public.sync_runs;

CREATE POLICY "sync_runs_insert"
  ON public.sync_runs FOR INSERT TO authenticated
  WITH CHECK (
    connected_account_id IN (
      SELECT id
      FROM public.connected_accounts
      WHERE owner_context_id IN (SELECT public.my_connector_manageable_owner_context_ids())
    )
  );
