create table if not exists public.signup_confirmation_codes (
  email text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now()
);

alter table public.signup_confirmation_codes enable row level security;

revoke all on table public.signup_confirmation_codes from anon, authenticated;
grant all on table public.signup_confirmation_codes to service_role;

comment on table public.signup_confirmation_codes is
  'Server-only, short-lived signup confirmation challenges.';
