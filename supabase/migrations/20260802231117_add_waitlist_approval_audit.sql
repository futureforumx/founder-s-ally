-- Add explicit review provenance for admin waitlist decisions. The existing
-- waitlist_users table remains the single source of truth for registrations.

alter table public.waitlist_users
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_by_email text;

create index if not exists idx_waitlist_users_status_created_at
  on public.waitlist_users (status, created_at desc);

create or replace function public.admin_update_waitlist_status(
  p_waitlist_user_id uuid,
  p_status text,
  p_reviewed_by text,
  p_reviewed_by_email text default null
)
returns public.waitlist_users
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_previous_status text;
  v_updated public.waitlist_users;
begin
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Unsupported waitlist review status: %', p_status;
  end if;

  if nullif(trim(p_reviewed_by), '') is null then
    raise exception 'A reviewer identity is required';
  end if;

  select status
    into v_previous_status
    from public.waitlist_users
    where id = p_waitlist_user_id
    for update;

  if not found then
    raise exception 'Waitlist applicant not found';
  end if;

  update public.waitlist_users
  set
    status = p_status,
    reviewed_at = now(),
    reviewed_by = trim(p_reviewed_by),
    reviewed_by_email = nullif(lower(trim(p_reviewed_by_email)), '')
  where id = p_waitlist_user_id
  returning * into v_updated;

  insert into public.waitlist_events (user_id, event_type, payload)
  values (
    p_waitlist_user_id,
    'admin_status_changed',
    jsonb_build_object(
      'previous_status', v_previous_status,
      'status', p_status,
      'reviewed_by', trim(p_reviewed_by),
      'reviewed_by_email', nullif(lower(trim(p_reviewed_by_email)), '')
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.admin_update_waitlist_status(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_waitlist_status(uuid, text, text, text)
  to service_role;
