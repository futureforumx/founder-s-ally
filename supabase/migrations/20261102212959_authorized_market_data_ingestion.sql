-- Extend Vekta's existing global source_records and ingestion_jobs pipeline.
-- Canonical entities remain startups, startup_founders, startup_funding_rounds,
-- firm_records, and firm_investors. No provider-specific entity tables are added.

alter table public.source_records
  add column if not exists import_job_id uuid references public.ingestion_jobs(id) on delete set null,
  add column if not exists processing_status text not null default 'raw',
  add column if not exists license_scope text,
  add column if not exists payload_hash text,
  add column if not exists parsing_errors jsonb not null default '[]'::jsonb,
  add column if not exists canonical_entity_type text,
  add column if not exists source_retrieved_at timestamptz,
  add column if not exists usage_expires_at timestamptz;

alter table public.source_records drop constraint if exists source_records_processing_status_check;
alter table public.source_records add constraint source_records_processing_status_check
  check (processing_status in ('raw','parsed','normalized','staged','quarantined','applied','deleted'));

create index if not exists source_records_import_job_idx on public.source_records (import_job_id);
create index if not exists source_records_status_idx on public.source_records (processing_status, "fetchedAt" desc);
create index if not exists source_records_payload_hash_idx on public.source_records ("sourceAdapter", payload_hash);
create index if not exists source_records_expiry_idx on public.source_records (usage_expires_at) where usage_expires_at is not null;
create index if not exists source_records_provider_entity_idx
  on public.source_records ("sourceAdapter", "sourceId") where "sourceId" is not null;
alter table public.source_records alter column "sourceUrl" drop not null;

comment on column public.source_records.license_scope is
  'Approved source license/usage scope identifier; raw retention and downstream use are gated by this scope.';
comment on column public.source_records.payload_hash is
  'SHA-256 hash for idempotent imports without duplicating unchanged provider payloads.';

alter table public.ingestion_jobs
  add column if not exists "config" jsonb not null default '{}'::jsonb,
  add column if not exists "checkpoint" jsonb not null default '{}'::jsonb,
  add column if not exists "pausedAt" timestamptz,
  add column if not exists "cancelledAt" timestamptz;

comment on table public.source_records is
  'Raw external-source provenance for Vekta directory and authorized data ingestion. Retention and use follow license_scope.';

-- These existing global ingestion tables are administered only by trusted
-- server-side jobs. No browser table access is needed by the current app flow.
alter table public.source_records enable row level security;
revoke all on table public.source_records from public, anon, authenticated;
grant all on table public.source_records to service_role;

alter table public.ingestion_jobs enable row level security;
revoke all on table public.ingestion_jobs from public, anon, authenticated;
grant all on table public.ingestion_jobs to service_role;
