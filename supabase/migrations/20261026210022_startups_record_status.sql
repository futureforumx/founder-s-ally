-- Company catalog workflow status. Distinct from startups.status
-- (operating status: ACTIVE, ACQUIRED, SHUT_DOWN, IPO, UNKNOWN).

alter table public.startups
  add column if not exists record_status text not null default 'live';

update public.startups
  set record_status = 'live'
  where record_status is null or btrim(record_status) = '';

alter table public.startups
  drop constraint if exists startups_record_status_check;

alter table public.startups
  add constraint startups_record_status_check
  check (record_status in ('live', 'needs_review', 'archived'));

comment on column public.startups.record_status is
  'Record workflow status: live, needs_review, or archived. Distinct from startups.status (operating status).';
