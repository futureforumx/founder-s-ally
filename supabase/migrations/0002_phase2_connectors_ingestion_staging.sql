-- =============================================================================
-- MIGRATION: 0002_phase2_connectors_ingestion_staging
-- PURPOSE:   Connector + ingestion + staging layer for Vekta.
--            Handles OAuth account connections, sync tracking, and staged
--            records from Gmail, Calendar, and CRM sources.
--
-- DEPENDS ON: 0001_phase1_identity_workspace_contexts.sql
--
-- NOTE — connector_source_records vs source_records:
--   The Prisma-managed table `public.source_records` stores raw provenance for
--   the public directory (yc-companies, founders-list, etc.) and has a
--   DIFFERENT schema. The connector-ingestion staging table is intentionally
--   named `connector_source_records` to avoid any collision.
--
-- NEW TABLES:
--   public.connected_accounts        — OAuth / API credentials per owner_context
--   public.sync_runs                 — sync execution history per connected_account
--   public.connector_source_records  — raw staged records from connectors
--   public.email_messages        — ingested email messages
--   public.calendar_events       — ingested calendar events
--   public.message_participants  — per-email participant rows
--   public.crm_contacts          — CRM contact records
--   public.crm_companies         — CRM company records
--   public.crm_activities        — CRM activity / interaction records
--   public.identity_rejections   — rejected identity-link candidates
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. connected_accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connected_accounts (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id   uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  provider           text        NOT NULL,   -- 'gmail' | 'google_calendar' | 'outlook' | 'hubspot' | …
  account_email      text,
  external_account_id text,
  status             text        NOT NULL DEFAULT 'active',
                                              -- 'active' | 'expired' | 'revoked' | 'error'
  last_synced_at     timestamptz,
  metadata           jsonb       NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connected_accounts_provider_check
    CHECK (provider IN ('gmail','google_calendar','outlook','hubspot','salesforce','pipedrive','linear','notion','other')),
  CONSTRAINT connected_accounts_status_check
    CHECK (status IN ('active','expired','revoked','error')),
  CONSTRAINT connected_accounts_unique
    UNIQUE (owner_context_id, provider, external_account_id)
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_owner_context_id
  ON public.connected_accounts (owner_context_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_provider
  ON public.connected_accounts (provider);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_status
  ON public.connected_accounts (status);

CREATE TRIGGER connected_accounts_touch_updated_at
  BEFORE UPDATE ON public.connected_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connected_accounts_select"
  ON public.connected_accounts FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "connected_accounts_insert"
  ON public.connected_accounts FOR INSERT TO authenticated
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "connected_accounts_update"
  ON public.connected_accounts FOR UPDATE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "connected_accounts_delete"
  ON public.connected_accounts FOR DELETE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- ---------------------------------------------------------------------------
-- 2. sync_runs — one row per sync execution attempt
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  connected_account_id  uuid        NOT NULL REFERENCES public.connected_accounts(id) ON DELETE CASCADE,
  status                text        NOT NULL DEFAULT 'running',
                                               -- 'running' | 'completed' | 'failed' | 'cancelled'
  started_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  records_fetched       integer     NOT NULL DEFAULT 0,
  records_staged        integer     NOT NULL DEFAULT 0,
  error_message         text,
  metadata              jsonb       NOT NULL DEFAULT '{}',
  CONSTRAINT sync_runs_status_check
    CHECK (status IN ('running','completed','failed','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_connected_account_id
  ON public.sync_runs (connected_account_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status
  ON public.sync_runs (status);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at
  ON public.sync_runs (started_at DESC);

-- RLS (via connected_account → owner_context chain)
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_runs_select"
  ON public.sync_runs FOR SELECT TO authenticated
  USING (
    connected_account_id IN (
      SELECT id FROM public.connected_accounts
      WHERE owner_context_id IN (SELECT public.my_owner_context_ids())
    )
  );

CREATE POLICY "sync_runs_insert"
  ON public.sync_runs FOR INSERT TO authenticated
  WITH CHECK (
    connected_account_id IN (
      SELECT id FROM public.connected_accounts
      WHERE owner_context_id IN (SELECT public.my_owner_context_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. connector_source_records — raw staged records from connectors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connector_source_records (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  sync_run_id      uuid        REFERENCES public.sync_runs(id) ON DELETE SET NULL,
  provider         text        NOT NULL,
  record_type      text        NOT NULL,   -- 'email' | 'calendar_event' | 'contact' | 'company' | 'activity'
  external_id      text        NOT NULL,
  raw_data         jsonb       NOT NULL DEFAULT '{}',
  staged_at        timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connector_source_records_unique
    UNIQUE (owner_context_id, provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_connector_source_records_owner_context_id
  ON public.connector_source_records (owner_context_id);
CREATE INDEX IF NOT EXISTS idx_connector_source_records_sync_run_id
  ON public.connector_source_records (sync_run_id) WHERE sync_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_connector_source_records_record_type
  ON public.connector_source_records (record_type);
CREATE INDEX IF NOT EXISTS idx_connector_source_records_processed
  ON public.connector_source_records (processed_at) WHERE processed_at IS NULL;

CREATE TRIGGER connector_source_records_touch_updated_at
  BEFORE UPDATE ON public.connector_source_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.connector_source_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connector_source_records_select"
  ON public.connector_source_records FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "connector_source_records_insert"
  ON public.connector_source_records FOR INSERT TO authenticated
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "connector_source_records_update"
  ON public.connector_source_records FOR UPDATE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- ---------------------------------------------------------------------------
-- 4. email_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  source_record_id uuid        REFERENCES public.connector_source_records(id) ON DELETE SET NULL,
  external_id      text        NOT NULL,
  thread_id        text,
  subject          text,
  body_text        text,
  body_html        text,
  from_email       text,
  from_name        text,
  sent_at          timestamptz,
  received_at      timestamptz,
  is_inbound       boolean,
  labels           text[]      NOT NULL DEFAULT '{}',
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_messages_unique
    UNIQUE (owner_context_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_email_messages_owner_context_id
  ON public.email_messages (owner_context_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread_id
  ON public.email_messages (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_sent_at
  ON public.email_messages (sent_at DESC);

CREATE TRIGGER email_messages_touch_updated_at
  BEFORE UPDATE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_messages_select"
  ON public.email_messages FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "email_messages_insert"
  ON public.email_messages FOR INSERT TO authenticated
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "email_messages_update"
  ON public.email_messages FOR UPDATE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- ---------------------------------------------------------------------------
-- 5. calendar_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  source_record_id uuid        REFERENCES public.connector_source_records(id) ON DELETE SET NULL,
  external_id      text        NOT NULL,
  title            text,
  description      text,
  location         text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  is_all_day       boolean     NOT NULL DEFAULT false,
  status           text,                               -- 'confirmed' | 'tentative' | 'cancelled'
  organizer_email  text,
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_unique
    UNIQUE (owner_context_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_owner_context_id
  ON public.calendar_events (owner_context_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_starts_at
  ON public.calendar_events (starts_at DESC);

CREATE TRIGGER calendar_events_touch_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_events_select"
  ON public.calendar_events FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "calendar_events_insert"
  ON public.calendar_events FOR INSERT TO authenticated
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "calendar_events_update"
  ON public.calendar_events FOR UPDATE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- ---------------------------------------------------------------------------
-- 6. message_participants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_participants (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  email_message_id uuid        NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  email            text        NOT NULL,
  display_name     text,
  role             text        NOT NULL DEFAULT 'to',  -- 'from' | 'to' | 'cc' | 'bcc'
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_participants_role_check
    CHECK (role IN ('from','to','cc','bcc'))
);

CREATE INDEX IF NOT EXISTS idx_message_participants_message_id
  ON public.message_participants (email_message_id);
CREATE INDEX IF NOT EXISTS idx_message_participants_email
  ON public.message_participants (email);
CREATE INDEX IF NOT EXISTS idx_message_participants_owner_context_id
  ON public.message_participants (owner_context_id);

-- RLS
ALTER TABLE public.message_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_participants_select"
  ON public.message_participants FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "message_participants_insert"
  ON public.message_participants FOR INSERT TO authenticated
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- ---------------------------------------------------------------------------
-- 7. crm_contacts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  source_record_id uuid        REFERENCES public.connector_source_records(id) ON DELETE SET NULL,
  external_id      text,
  email            text,
  first_name       text,
  last_name        text,
  title            text,
  company          text,
  phone            text,
  linkedin_url     text,
  notes            text,
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner_context_id
  ON public.crm_contacts (owner_context_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email
  ON public.crm_contacts (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_external_id
  ON public.crm_contacts (owner_context_id, external_id) WHERE external_id IS NOT NULL;

CREATE TRIGGER crm_contacts_touch_updated_at
  BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_contacts_select"
  ON public.crm_contacts FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "crm_contacts_insert"
  ON public.crm_contacts FOR INSERT TO authenticated
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "crm_contacts_update"
  ON public.crm_contacts FOR UPDATE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "crm_contacts_delete"
  ON public.crm_contacts FOR DELETE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- ---------------------------------------------------------------------------
-- 8. crm_companies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_companies (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  source_record_id uuid        REFERENCES public.connector_source_records(id) ON DELETE SET NULL,
  external_id      text,
  name             text        NOT NULL,
  domain           text,
  description      text,
  industry         text,
  employee_count   integer,
  website_url      text,
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_companies_owner_context_id
  ON public.crm_companies (owner_context_id);
CREATE INDEX IF NOT EXISTS idx_crm_companies_domain
  ON public.crm_companies (domain) WHERE domain IS NOT NULL;

CREATE TRIGGER crm_companies_touch_updated_at
  BEFORE UPDATE ON public.crm_companies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_companies_select"
  ON public.crm_companies FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "crm_companies_insert"
  ON public.crm_companies FOR INSERT TO authenticated
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "crm_companies_update"
  ON public.crm_companies FOR UPDATE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "crm_companies_delete"
  ON public.crm_companies FOR DELETE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- ---------------------------------------------------------------------------
-- 9. crm_activities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  source_record_id uuid        REFERENCES public.connector_source_records(id) ON DELETE SET NULL,
  external_id      text,
  activity_type    text        NOT NULL,   -- 'call' | 'meeting' | 'email' | 'note' | 'task'
  title            text,
  body             text,
  occurred_at      timestamptz,
  contact_id       uuid        REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  company_id       uuid        REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_owner_context_id
  ON public.crm_activities (owner_context_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_contact_id
  ON public.crm_activities (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_activities_occurred_at
  ON public.crm_activities (occurred_at DESC);

CREATE TRIGGER crm_activities_touch_updated_at
  BEFORE UPDATE ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_activities_select"
  ON public.crm_activities FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "crm_activities_insert"
  ON public.crm_activities FOR INSERT TO authenticated
  WITH CHECK (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "crm_activities_update"
  ON public.crm_activities FOR UPDATE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "crm_activities_delete"
  ON public.crm_activities FOR DELETE TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

-- ---------------------------------------------------------------------------
-- 10. identity_rejections — prevents re-surfacing rejected identity candidates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.identity_rejections (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_context_id uuid        NOT NULL REFERENCES public.owner_contexts(id) ON DELETE CASCADE,
  person_id        text        NOT NULL,   -- FK to public.people(id) (Prisma-managed)
  rejected_by      text        NOT NULL REFERENCES public.users(id),
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_rejections_unique UNIQUE (owner_context_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_rejections_owner_context_id
  ON public.identity_rejections (owner_context_id);

-- RLS
ALTER TABLE public.identity_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "identity_rejections_select"
  ON public.identity_rejections FOR SELECT TO authenticated
  USING (owner_context_id IN (SELECT public.my_owner_context_ids()));

CREATE POLICY "identity_rejections_insert"
  ON public.identity_rejections FOR INSERT TO authenticated
  WITH CHECK (
    owner_context_id IN (SELECT public.my_owner_context_ids())
    AND rejected_by = (auth.jwt()->>'sub')
  );

-- ---------------------------------------------------------------------------
-- 11. enforce_connector_source_record_context_match()
--     Trigger function: ensures connector_source_records.owner_context_id
--     matches the owning connected_account's context.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_connector_source_record_context_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only validates rows that have a sync_run_id (connector-sourced records).
  IF NEW.sync_run_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.sync_runs sr
      JOIN public.connected_accounts ca ON ca.id = sr.connected_account_id
      WHERE sr.id = NEW.sync_run_id
        AND ca.owner_context_id = NEW.owner_context_id
    ) THEN
      RAISE EXCEPTION
        'connector_source_records.owner_context_id (%) does not match connected_account context for sync_run %',
        NEW.owner_context_id, NEW.sync_run_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_connector_source_record_context ON public.connector_source_records;
CREATE TRIGGER enforce_connector_source_record_context
  BEFORE INSERT OR UPDATE ON public.connector_source_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_connector_source_record_context_match();

-- ---------------------------------------------------------------------------
-- 12. enforce_message_participant_parent()
--     Trigger function: ensures message_participants.owner_context_id matches
--     the parent email_message's owner_context_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_message_participant_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_msg_context uuid;
BEGIN
  SELECT owner_context_id INTO v_msg_context
  FROM public.email_messages
  WHERE id = NEW.email_message_id;

  IF v_msg_context IS DISTINCT FROM NEW.owner_context_id THEN
    RAISE EXCEPTION
      'message_participants.owner_context_id (%) must match email_messages.owner_context_id (%)',
      NEW.owner_context_id, v_msg_context;
  END IF;
  RETURN NEW;
END;
$$;
