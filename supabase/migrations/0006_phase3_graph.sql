-- =============================================================================
-- MIGRATION: 0006_phase3_graph
-- PURPOSE:   Graph / relationship layer on top of Phase 1 + Phase 2.
--
--   New tables:
--     interactions              — one row per email / meeting / CRM touch
--     interaction_participants  — per-interaction participant rows
--     relationship_edges        — canonical (person_a, person_b) pair per context
--     relationship_contexts     — directional signal counts + strength per edge
--
--   Phase 2 back-link patches:
--     message_participants   += person_id uuid, is_self boolean
--     crm_contacts           += person_id uuid
--     crm_companies          += organization_id uuid
--
-- DEPENDS ON:
--   0001_phase1_identity_workspace_contexts.sql
--   0002_phase2_connectors_ingestion_staging.sql
--   0003_phase2_patches.sql
--   0004_phase2_idempotency_and_webhook_hardening.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Patch Phase 2 tables with person / org back-links
-- ---------------------------------------------------------------------------
ALTER TABLE public.message_participants
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id),
  ADD COLUMN IF NOT EXISTS is_self   boolean NOT NULL DEFAULT false;

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id);

ALTER TABLE public.crm_companies
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_message_participants_person_id
  ON public.message_participants (person_id) WHERE person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_person_id
  ON public.crm_contacts (person_id) WHERE person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_companies_organization_id
  ON public.crm_companies (organization_id) WHERE organization_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- interactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.interactions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  source_record_id uuid        REFERENCES public.connector_source_records(id) ON DELETE SET NULL,
  kind             text        NOT NULL,
  external_id      text,
  title            text,
  body_text        text,
  occurred_at      timestamptz,
  duration_seconds integer,
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interactions_kind_check
    CHECK (kind IN ('email', 'meeting', 'crm_touch'))
);

-- Idempotency: one interaction per (context, kind, external_id)
CREATE UNIQUE INDEX IF NOT EXISTS interactions_owner_kind_external
  ON public.interactions (owner_context_id, kind, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interactions_owner_occurred
  ON public.interactions (owner_context_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_interactions_source_record
  ON public.interactions (source_record_id)
  WHERE source_record_id IS NOT NULL;

CREATE TRIGGER interactions_touch_updated_at
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interactions_select"
  ON public.interactions FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "interactions_insert"
  ON public.interactions FOR INSERT TO authenticated
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "interactions_update"
  ON public.interactions FOR UPDATE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "interactions_delete"
  ON public.interactions FOR DELETE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- ---------------------------------------------------------------------------
-- interaction_participants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.interaction_participants (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id   uuid        NOT NULL REFERENCES public.interactions(id) ON DELETE CASCADE,
  owner_context_id uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  person_id        uuid        REFERENCES public.people(id),
  email            text,
  display_name     text,
  role             text        NOT NULL,  -- 'from'|'to'|'cc'|'bcc'|'attendee'|'organizer'
  is_self          boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- One row per (interaction, email, role)
CREATE UNIQUE INDEX IF NOT EXISTS interaction_participants_unique
  ON public.interaction_participants (interaction_id, email, role)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interaction_participants_person
  ON public.interaction_participants (person_id)
  WHERE person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interaction_participants_owner
  ON public.interaction_participants (owner_context_id);

CREATE INDEX IF NOT EXISTS idx_interaction_participants_interaction
  ON public.interaction_participants (interaction_id);

-- RLS
ALTER TABLE public.interaction_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interaction_participants_select"
  ON public.interaction_participants FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "interaction_participants_insert"
  ON public.interaction_participants FOR INSERT TO authenticated
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "interaction_participants_update"
  ON public.interaction_participants FOR UPDATE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "interaction_participants_delete"
  ON public.interaction_participants FOR DELETE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- ---------------------------------------------------------------------------
-- relationship_edges
-- One row per canonical (owner_context, person_a, person_b) pair where
-- person_a_id::text < person_b_id::text (enforced by CHECK constraint).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.relationship_edges (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id     uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  person_a_id          uuid        NOT NULL REFERENCES public.people(id),
  person_b_id          uuid        NOT NULL REFERENCES public.people(id),
  strength             integer     NOT NULL DEFAULT 0,
  email_count          integer     NOT NULL DEFAULT 0,
  meeting_count        integer     NOT NULL DEFAULT 0,
  crm_touch_count      integer     NOT NULL DEFAULT 0,
  last_interaction_at  timestamptz,
  first_interaction_at timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relationship_edges_canonical_order
    CHECK (person_a_id::text < person_b_id::text)
);

CREATE UNIQUE INDEX IF NOT EXISTS relationship_edges_unique
  ON public.relationship_edges (owner_context_id, person_a_id, person_b_id);

CREATE INDEX IF NOT EXISTS idx_relationship_edges_owner_strength
  ON public.relationship_edges (owner_context_id, strength DESC);

CREATE INDEX IF NOT EXISTS idx_relationship_edges_person_a
  ON public.relationship_edges (person_a_id);

CREATE INDEX IF NOT EXISTS idx_relationship_edges_person_b
  ON public.relationship_edges (person_b_id);

CREATE TRIGGER relationship_edges_touch_updated_at
  BEFORE UPDATE ON public.relationship_edges
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.relationship_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "relationship_edges_select"
  ON public.relationship_edges FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "relationship_edges_insert"
  ON public.relationship_edges FOR INSERT TO authenticated
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "relationship_edges_update"
  ON public.relationship_edges FOR UPDATE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "relationship_edges_delete"
  ON public.relationship_edges FOR DELETE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- ---------------------------------------------------------------------------
-- relationship_contexts
-- Per-edge directional signal counts from the perspective of one owner_context.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.relationship_contexts (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  edge_id                     uuid        NOT NULL REFERENCES public.relationship_edges(id) ON DELETE CASCADE,
  owner_context_id            uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  email_sent_count            integer     NOT NULL DEFAULT 0,
  email_received_count        integer     NOT NULL DEFAULT 0,
  meeting_as_organizer_count  integer     NOT NULL DEFAULT 0,
  meeting_as_attendee_count   integer     NOT NULL DEFAULT 0,
  crm_touch_count             integer     NOT NULL DEFAULT 0,
  last_linkedin_connection_at timestamptz,
  raw_strength_components     jsonb       NOT NULL DEFAULT '{}',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS relationship_contexts_unique
  ON public.relationship_contexts (edge_id, owner_context_id);

CREATE INDEX IF NOT EXISTS idx_relationship_contexts_owner
  ON public.relationship_contexts (owner_context_id);

CREATE INDEX IF NOT EXISTS idx_relationship_contexts_edge
  ON public.relationship_contexts (edge_id);

CREATE TRIGGER relationship_contexts_touch_updated_at
  BEFORE UPDATE ON public.relationship_contexts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.relationship_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "relationship_contexts_select"
  ON public.relationship_contexts FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "relationship_contexts_insert"
  ON public.relationship_contexts FOR INSERT TO authenticated
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "relationship_contexts_update"
  ON public.relationship_contexts FOR UPDATE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "relationship_contexts_delete"
  ON public.relationship_contexts FOR DELETE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));
