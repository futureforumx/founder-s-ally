-- ============================================================
-- CRM staging tables: idempotency guarantees
-- ============================================================
create unique index if not exists crm_contacts_unique
  on public.crm_contacts (owner_context_id, external_id)
  where external_id is not null;

create unique index if not exists crm_companies_unique
  on public.crm_companies (owner_context_id, external_id)
  where external_id is not null;

create unique index if not exists crm_activities_unique
  on public.crm_activities (owner_context_id, external_id)
  where external_id is not null;

-- ============================================================
-- message_participants: idempotency guarantee for email staging
-- ============================================================
-- The actual schema uses email_message_id (uuid FK to email_messages),
-- not parent_type/parent_id.  Smallest correct unique key for email participants:
create unique index if not exists message_participants_email_unique
  on public.message_participants (email_message_id, email, role)
  where email is not null;
