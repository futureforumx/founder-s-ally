-- =============================================================================
-- MIGRATION: 0001_phase1_identity_workspace_contexts
-- PURPOSE:   Core identity + workspace layer for Vekta.
--            Creates the authenticated-user record, workspace, membership,
--            owner-context, and identity-link tables.
--
-- EXISTING TABLES (Prisma-managed, DO NOT recreate):
--   public.people       — canonical person directory
--   public.organizations — canonical org directory
--   public.roles        — person ↔ org role links
--
-- NEW TABLES:
--   public.users                — one row per Clerk / auth user
--   public.workspaces           — team collaboration spaces
--   public.workspace_memberships — workspace ↔ user membership
--   public.owner_contexts       — scoped data ownership (workspace OR user)
--   public.identity_links       — links an owner_context to a canonical person
--
-- AUTH NOTE:
--   This project uses Clerk third-party auth. User IDs are TEXT (e.g. user_2abc…).
--   RLS policies use (auth.jwt()->>'sub') instead of auth.uid().
--   The handle_new_user() trigger targets auth.users for deployments that also
--   run Supabase Auth; it is safe to leave installed when using Clerk because
--   auth.users will simply remain empty.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Shared trigger function: touch updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. users — one row per authenticated user (Clerk user_id as TEXT primary key)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id            text        PRIMARY KEY,          -- Clerk user_id (auth.jwt()->>'sub')
  email         text        NOT NULL,
  display_name  text,
  avatar_url    text,
  raw_user_meta jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

CREATE TRIGGER users_touch_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own"
  ON public.users FOR SELECT TO authenticated
  USING (id = (auth.jwt()->>'sub'));

CREATE POLICY "users_insert_own"
  ON public.users FOR INSERT TO authenticated
  WITH CHECK (id = (auth.jwt()->>'sub'));

CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE TO authenticated
  USING (id = (auth.jwt()->>'sub'));

-- ---------------------------------------------------------------------------
-- 2. workspaces
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspaces (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL,
  owner_id    text        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON public.workspaces (owner_id);

CREATE TRIGGER workspaces_touch_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspaces_select_member"
  ON public.workspaces FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = (auth.jwt()->>'sub')
    )
  );

CREATE POLICY "workspaces_insert_own"
  ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "workspaces_update_owner"
  ON public.workspaces FOR UPDATE TO authenticated
  USING (owner_id = (auth.jwt()->>'sub'));

CREATE POLICY "workspaces_delete_owner"
  ON public.workspaces FOR DELETE TO authenticated
  USING (owner_id = (auth.jwt()->>'sub'));

-- ---------------------------------------------------------------------------
-- 3. workspace_memberships
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_memberships (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      text        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role         text        NOT NULL DEFAULT 'member',   -- 'owner' | 'admin' | 'member'
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_memberships_unique UNIQUE (workspace_id, user_id),
  CONSTRAINT workspace_memberships_role_check
    CHECK (role IN ('owner', 'admin', 'member'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user_id
  ON public.workspace_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace_id
  ON public.workspace_memberships (workspace_id);

-- RLS
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_memberships_select_member"
  ON public.workspace_memberships FOR SELECT TO authenticated
  USING (user_id = (auth.jwt()->>'sub')
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships wm2
      WHERE wm2.workspace_id = workspace_memberships.workspace_id
        AND wm2.user_id = (auth.jwt()->>'sub')
    )
  );

CREATE POLICY "workspace_memberships_insert_admin"
  ON public.workspace_memberships FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = (auth.jwt()->>'sub')
        AND wm.role IN ('owner', 'admin')
    )
    OR user_id = (auth.jwt()->>'sub')   -- allow self-join when invited
  );

CREATE POLICY "workspace_memberships_delete_admin_or_self"
  ON public.workspace_memberships FOR DELETE TO authenticated
  USING (
    user_id = (auth.jwt()->>'sub')
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = workspace_memberships.workspace_id
        AND wm.user_id = (auth.jwt()->>'sub')
        AND wm.role IN ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. owner_contexts — each row scopes data to either a workspace or a user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.owner_contexts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      text        REFERENCES public.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_context_scope_xor CHECK (
    (workspace_id IS NOT NULL AND user_id IS NULL)
    OR (workspace_id IS NULL AND user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_owner_contexts_workspace_id
  ON public.owner_contexts (workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_owner_contexts_user_id
  ON public.owner_contexts (user_id) WHERE user_id IS NOT NULL;

-- RLS
ALTER TABLE public.owner_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_contexts_select"
  ON public.owner_contexts FOR SELECT TO authenticated
  USING (
    user_id = (auth.jwt()->>'sub')
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = owner_contexts.workspace_id
        AND wm.user_id = (auth.jwt()->>'sub')
    )
  );

CREATE POLICY "owner_contexts_insert"
  ON public.owner_contexts FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (auth.jwt()->>'sub')
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = (auth.jwt()->>'sub')
        AND wm.role IN ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 5. identity_links — ties an owner_context to a canonical people record
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.identity_links (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  person_id        text        NOT NULL,  -- FK to public.people(id) (TEXT, Prisma-managed)
  confidence       float       NOT NULL DEFAULT 1.0
                                CHECK (confidence >= 0.0 AND confidence <= 1.0),
  source           text,                  -- 'manual' | 'gmail' | 'calendar' | 'import' | …
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_links_unique UNIQUE (owner_context_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_links_owner_context_id
  ON public.identity_links (owner_context_id);
CREATE INDEX IF NOT EXISTS idx_identity_links_person_id
  ON public.identity_links (person_id);

-- RLS
ALTER TABLE public.identity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "identity_links_select"
  ON public.identity_links FOR SELECT TO authenticated
  USING (
    owner_context_id IN (SELECT public.my_owner_context_ids())
  );

CREATE POLICY "identity_links_insert"
  ON public.identity_links FOR INSERT TO authenticated
  WITH CHECK (
    owner_context_id IN (SELECT public.my_owner_context_ids())
  );

CREATE POLICY "identity_links_delete"
  ON public.identity_links FOR DELETE TO authenticated
  USING (
    owner_context_id IN (SELECT public.my_owner_context_ids())
  );

-- ---------------------------------------------------------------------------
-- 6. Functions
-- ---------------------------------------------------------------------------

-- 6a. my_owner_context_ids() — all context IDs visible to the current user
CREATE OR REPLACE FUNCTION public.my_owner_context_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.owner_contexts
  WHERE user_id = (auth.jwt()->>'sub')
  UNION
  SELECT oc.id FROM public.owner_contexts oc
  JOIN public.workspace_memberships wm
    ON wm.workspace_id = oc.workspace_id
  WHERE wm.user_id = (auth.jwt()->>'sub');
$$;

-- 6b. handle_new_user() — syncs auth.users row into public.users
--     NOTE: With Clerk auth this trigger fires only if Supabase Auth is also
--     configured. The empty-string guard (new.email <> '') is added in 0003.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, raw_user_meta)
  VALUES (
    new.id::text,
    COALESCE(new.email, ''),
    COALESCE(new.raw_user_meta_data, '{}')::jsonb
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 6c. create_workspace() — creates a workspace, seeds owner membership + context
CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name text,
  p_slug text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    text   := (auth.jwt()->>'sub');
  v_ws_id      uuid;
  v_context_id uuid;
BEGIN
  -- insert workspace
  INSERT INTO public.workspaces (name, slug, owner_id)
  VALUES (p_name, p_slug, v_user_id)
  RETURNING id INTO v_ws_id;

  -- owner membership
  INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
  VALUES (v_ws_id, v_user_id, 'owner');

  -- workspace-scoped owner context
  INSERT INTO public.owner_contexts (workspace_id)
  VALUES (v_ws_id)
  RETURNING id INTO v_context_id;

  RETURN v_ws_id;
END;
$$;

-- 6d. reject_identity() — records a rejection so the candidate is not re-surfaced
CREATE OR REPLACE FUNCTION public.reject_identity(
  p_owner_context_id uuid,
  p_person_id        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller has access to this context
  IF p_owner_context_id NOT IN (SELECT public.my_owner_context_ids()) THEN
    RAISE EXCEPTION 'access denied to owner_context %', p_owner_context_id;
  END IF;

  INSERT INTO public.identity_rejections (owner_context_id, person_id, rejected_by)
  VALUES (p_owner_context_id, p_person_id, (auth.jwt()->>'sub'))
  ON CONFLICT (owner_context_id, person_id) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Trigger: on_auth_user_created (fires on Supabase auth.users inserts)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
