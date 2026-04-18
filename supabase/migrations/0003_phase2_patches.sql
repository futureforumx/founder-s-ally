-- =============================================================================
-- MIGRATION: 0003_phase2_patches
-- PURPOSE:   Patches on top of Phase 1 + Phase 2 migrations:
--              1. handle_new_user — add empty-string email guard
--              2. mp_parent_context_match — install trigger on message_participants
--
-- DEPENDS ON: 0001_phase1_identity_workspace_contexts.sql
--             0002_phase2_connectors_ingestion_staging.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Patch 1: handle_new_user — empty-string email guard
--   The original definition in 0001 inserts every auth.users row.
--   This patch adds the guard `new.email <> ''` so placeholder / anonymous
--   signups (Supabase inserts rows with empty email during some OAuth flows)
--   do not produce a broken user record.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.email <> '' THEN
    INSERT INTO public.users (id, email, raw_user_meta)
    VALUES (
      new.id::text,
      new.email,
      COALESCE(new.raw_user_meta_data, '{}')::jsonb
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------------
-- Patch 2: mp_parent_context_match trigger on message_participants
--   Installs the trigger that calls enforce_message_participant_parent()
--   (function defined in 0002). Defined here rather than in 0002 so the
--   trigger and its function can be patched independently.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS mp_parent_context_match ON public.message_participants;
CREATE TRIGGER mp_parent_context_match
  BEFORE INSERT OR UPDATE ON public.message_participants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_participant_parent();
