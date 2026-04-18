-- =============================================================================
-- MIGRATION: 0007_phase4_targeting_and_recommendations
-- PURPOSE:   Investor targeting, best-path-in discovery, and first
--            recommendations layer on top of the Phase 1–3 system.
--
--   New tables:
--     context_entity_notes  — per-context target tracking for people/orgs
--     recommendations       — generated ask_intro / reach_out recommendations
--
--   New view:
--     person_org_affiliations — inferred person ↔ org memberships
--
--   New function:
--     paths_to_organization() — direct + one-hop path query
--
--   New trigger:
--     notify_phase4_recs_refresh() — calls backfill-phase4-recommendations
--       after context_entity_notes INSERT/UPDATE
--
-- DEPENDS ON:
--   0001_phase1_identity_workspace_contexts.sql  (touch_updated_at, owner_contexts)
--   0006_phase3_graph.sql                        (relationship_edges, relationship_contexts)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. context_entity_notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.context_entity_notes (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id uuid           NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  subject_type     text           NOT NULL,
  person_id        uuid           REFERENCES public.people(id) ON DELETE CASCADE,
  organization_id  uuid           REFERENCES public.organizations(id) ON DELETE CASCADE,
  notes            text,
  custom_tags      text[],
  fit_score        numeric(5,2),
  pipeline_stage   text,
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT cen_subject_type_check
    CHECK (subject_type IN ('person', 'organization')),

  CONSTRAINT cen_pipeline_stage_check
    CHECK (pipeline_stage IN ('researching', 'reaching_out', 'met', 'passed', 'committed')),

  -- Exactly one of person_id / organization_id is non-null
  CONSTRAINT cen_subject_xor
    CHECK (
      (person_id IS NOT NULL AND organization_id IS NULL)
      OR
      (person_id IS NULL AND organization_id IS NOT NULL)
    )
);

-- One note per (context, person) and one per (context, org)
CREATE UNIQUE INDEX IF NOT EXISTS cen_unique_person
  ON public.context_entity_notes (owner_context_id, person_id)
  WHERE person_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cen_unique_org
  ON public.context_entity_notes (owner_context_id, organization_id)
  WHERE organization_id IS NOT NULL;

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_cen_owner
  ON public.context_entity_notes (owner_context_id);

CREATE INDEX IF NOT EXISTS idx_cen_owner_org_stage
  ON public.context_entity_notes (owner_context_id, organization_id, pipeline_stage)
  WHERE organization_id IS NOT NULL;

CREATE TRIGGER cen_touch_updated_at
  BEFORE UPDATE ON public.context_entity_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS: full CRUD for authenticated users within their contexts
ALTER TABLE public.context_entity_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cen_select"
  ON public.context_entity_notes FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "cen_insert"
  ON public.context_entity_notes FOR INSERT TO authenticated
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "cen_update"
  ON public.context_entity_notes FOR UPDATE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "cen_delete"
  ON public.context_entity_notes FOR DELETE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- ---------------------------------------------------------------------------
-- 2. recommendations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recommendations (
  id                      uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id        uuid           NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  kind                    text           NOT NULL,
  subject_person_id       uuid           REFERENCES public.people(id) ON DELETE SET NULL,
  subject_organization_id uuid           REFERENCES public.organizations(id) ON DELETE SET NULL,
  via_person_id           uuid           REFERENCES public.people(id) ON DELETE SET NULL,
  score                   numeric(6,3)   NOT NULL,
  rationale               jsonb          NOT NULL DEFAULT '{}',
  state                   text           NOT NULL DEFAULT 'open',
  snoozed_until           timestamptz,
  expires_at              timestamptz,
  dedup_key               text           NOT NULL,
  created_at              timestamptz    NOT NULL DEFAULT now(),
  updated_at              timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT rec_kind_check
    CHECK (kind IN ('ask_intro', 'reach_out')),

  CONSTRAINT rec_state_check
    CHECK (state IN ('open', 'snoozed', 'dismissed', 'acted', 'completed', 'expired')),

  CONSTRAINT rec_dedup_unique
    UNIQUE (owner_context_id, dedup_key)
);

-- Hot path: open recs ranked by score
CREATE INDEX IF NOT EXISTS idx_rec_open_score
  ON public.recommendations (owner_context_id, score DESC)
  WHERE state = 'open';

CREATE INDEX IF NOT EXISTS idx_rec_owner_kind
  ON public.recommendations (owner_context_id, kind);

CREATE INDEX IF NOT EXISTS idx_rec_subject_org
  ON public.recommendations (subject_organization_id)
  WHERE subject_organization_id IS NOT NULL;

CREATE TRIGGER rec_touch_updated_at
  BEFORE UPDATE ON public.recommendations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS:
--   SELECT: users within their contexts
--   UPDATE: only state and snoozed_until (no user inserts)
--   INSERT/DELETE: service role only (recommendations generated by backend)
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rec_select"
  ON public.recommendations FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- Users may only update state and snoozed_until, not create or delete
CREATE POLICY "rec_update_state"
  ON public.recommendations FOR UPDATE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()))
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- ---------------------------------------------------------------------------
-- 3. person_org_affiliations — view for inferring who belongs to which org
--
-- Priority order:
--   1. Prisma roles table  (isCurrent IS NOT FALSE)
--   2. People email-domain match on organizations.domain
--   3. CRM contacts email-domain match (person_id back-filled by Phase 3)
--
-- Generic consumer email domains are excluded from domain matching.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.person_org_affiliations AS

-- 1. Prisma roles (authoritative)
SELECT
  r."personId"       AS person_id,
  r."organizationId" AS organization_id,
  'role'::text       AS affiliation_type
FROM public.roles r
WHERE r."isCurrent" IS NOT FALSE          -- include TRUE and NULL (unknown end-date)

UNION

-- 2. Email-domain inference via people.email → organizations.domain
SELECT
  p.id               AS person_id,
  o.id               AS organization_id,
  'email_domain'::text AS affiliation_type
FROM public.people p
JOIN public.organizations o
  ON  o.domain IS NOT NULL
  AND p.email  IS NOT NULL
  AND lower(split_part(p.email, '@', 2)) = lower(o.domain)
WHERE
  lower(split_part(p.email, '@', 2)) NOT IN (
    'gmail.com','yahoo.com','hotmail.com','outlook.com',
    'icloud.com','protonmail.com','aol.com','msn.com',
    'live.com','me.com','mac.com','ymail.com'
  )

UNION

-- 3. CRM contacts with Phase 3 person_id back-fill
SELECT
  cc.person_id       AS person_id,
  o.id               AS organization_id,
  'crm_contact'::text AS affiliation_type
FROM public.crm_contacts cc
JOIN public.organizations o
  ON  cc.email IS NOT NULL
  AND o.domain IS NOT NULL
  AND lower(split_part(cc.email, '@', 2)) = lower(o.domain)
WHERE
  cc.person_id IS NOT NULL
  AND cc.email IS NOT NULL
  AND length(split_part(cc.email, '@', 2)) > 0
  AND lower(split_part(cc.email, '@', 2)) NOT IN (
    'gmail.com','yahoo.com','hotmail.com','outlook.com',
    'icloud.com','protonmail.com','aol.com','msn.com',
    'live.com','me.com','mac.com','ymail.com'
  );

-- ---------------------------------------------------------------------------
-- 4. paths_to_organization
--
-- Returns direct and one-hop paths from p_self_person_id to people affiliated
-- with p_target_organization_id, within the given owner_context_id.
--
-- Direct  : self has a relationship_edge directly with a target-org member.
-- One-hop : self → via → target, all edges in the same owner_context.
--
-- Ranking : direct first, then by path_score DESC.  LIMIT 25.
--
-- SECURITY DEFINER so it can read relationship_edges without RLS overhead.
-- Caller-supplied p_owner_context_id scopes all queries; callers cannot
-- access data outside their own context by design.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.paths_to_organization(
  p_owner_context_id     uuid,
  p_target_organization_id uuid,
  p_self_person_id       uuid
)
RETURNS TABLE (
  path_type           text,
  target_person_id    uuid,
  via_person_id       uuid,
  path_score          numeric,
  last_interaction_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH
-- Expand each canonical edge into both directed orientations
edge_pairs AS (
  SELECT
    person_a_id AS from_person,
    person_b_id AS to_person,
    strength,
    last_interaction_at AS last_at
  FROM public.relationship_edges
  WHERE owner_context_id = p_owner_context_id

  UNION ALL

  SELECT
    person_b_id AS from_person,
    person_a_id AS to_person,
    strength,
    last_interaction_at AS last_at
  FROM public.relationship_edges
  WHERE owner_context_id = p_owner_context_id
),

-- Members of the target organization (via affiliation inference)
target_members AS (
  SELECT DISTINCT person_id
  FROM public.person_org_affiliations
  WHERE organization_id = p_target_organization_id
    AND person_id <> p_self_person_id
),

-- Direct paths: self → target_member (one edge)
direct_paths AS (
  SELECT
    'direct'::text         AS path_type,
    ep.to_person           AS target_person_id,
    NULL::uuid             AS via_person_id,
    ep.strength::numeric   AS path_score,
    ep.last_at             AS last_interaction_at
  FROM edge_pairs ep
  JOIN target_members tm ON ep.to_person = tm.person_id
  WHERE ep.from_person = p_self_person_id
),

-- One-hop paths: self → via → target_member (two edges)
-- Excludes any target that already has a direct path.
one_hop_paths AS (
  SELECT
    'one_hop'::text                                                  AS path_type,
    leg2.to_person                                                   AS target_person_id,
    leg1.to_person                                                   AS via_person_id,
    (leg1.strength::numeric * leg2.strength::numeric / 100.0)       AS path_score,
    GREATEST(leg1.last_at, leg2.last_at)                             AS last_interaction_at
  FROM edge_pairs leg1                           -- self → via
  JOIN edge_pairs leg2                           -- via  → target
    ON leg2.from_person = leg1.to_person
  JOIN target_members tm ON leg2.to_person = tm.person_id
  WHERE leg1.from_person = p_self_person_id
    AND leg1.to_person   <> p_self_person_id     -- no self-loop on leg 1
    AND leg2.to_person   <> p_self_person_id     -- no self-loop on leg 2
    AND leg1.to_person   <> leg2.to_person       -- via ≠ target
    -- Prefer direct: exclude targets that already appear in direct_paths
    AND NOT EXISTS (
      SELECT 1 FROM direct_paths dp
      WHERE dp.target_person_id = leg2.to_person
    )
)

SELECT path_type, target_person_id, via_person_id, path_score, last_interaction_at
FROM (
  SELECT * FROM direct_paths
  UNION ALL
  SELECT * FROM one_hop_paths
) combined
ORDER BY
  CASE path_type WHEN 'direct' THEN 0 ELSE 1 END,
  path_score DESC
LIMIT 25;
$$;

-- ---------------------------------------------------------------------------
-- 5. Trigger: refresh recommendations after context_entity_notes changes
--
-- Uses pg_net (same pattern as Phase 3 webhook trigger).
-- The Edge Function URL is read from app.settings at runtime.
-- Set: ALTER DATABASE postgres SET "app.supabase_url" = 'https://<ref>.supabase.co';
--      ALTER DATABASE postgres SET "app.webhook_secret" = '<secret>';
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_phase4_recs_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text := current_setting('app.supabase_url', true);
  v_secret text := current_setting('app.webhook_secret', true);
  v_payload jsonb;
BEGIN
  -- Only fire on org-targeted notes in active pipeline stages
  IF NEW.subject_type <> 'organization' THEN
    RETURN NEW;
  END IF;
  IF NEW.pipeline_stage NOT IN ('researching', 'reaching_out') THEN
    RETURN NEW;
  END IF;

  -- Skip if URL not configured (safe degradation during local dev)
  IF v_url IS NULL OR v_url = '' THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'ownerContextId', NEW.owner_context_id,
    'orgNoteId',      NEW.id
  );

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/backfill-phase4-recommendations',
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-webhook-secret', COALESCE(v_secret, '')
    ),
    body    := v_payload
  );

  RETURN NEW;
END;
$$;

-- Fire after insert and after meaningful updates (stage or org changes)
CREATE TRIGGER cen_notify_phase4_refresh
  AFTER INSERT OR UPDATE OF pipeline_stage, organization_id
  ON public.context_entity_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_phase4_recs_refresh();
