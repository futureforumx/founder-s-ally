-- Ahrefs free Domain Rating observations. All access is through server routes;
-- RLS is enabled and no client role receives table privileges.
create table if not exists public.domain_rating_tracking (
  id uuid primary key default gen_random_uuid(),
  owner_context_id uuid not null references public.owner_contexts(id) on delete cascade,
  startup_id text not null references public.startups(id) on delete cascade,
  domain text not null,
  provider text not null default 'ahrefs',
  rating_version text not null default 'dr3',
  enabled boolean not null default true,
  tracking_started_at timestamptz not null default now(),
  refresh_status text not null default 'pending' check (refresh_status in ('pending','ready','stale','error','disabled')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  next_eligible_refresh_at timestamptz,
  sanitized_error text,
  updated_at timestamptz not null default now(),
  unique(owner_context_id, startup_id)
);
create index if not exists domain_rating_tracking_due_idx on public.domain_rating_tracking(next_eligible_refresh_at) where enabled;
create index if not exists domain_rating_tracking_domain_idx on public.domain_rating_tracking(domain, rating_version) where enabled;
alter table public.domain_rating_tracking enable row level security;
revoke all on public.domain_rating_tracking from anon, authenticated;

create table if not exists public.domain_rating_observations (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  provider text not null default 'ahrefs',
  rating_version text not null default 'dr3',
  rating numeric not null check (rating >= 0 and rating <= 100),
  fetched_at timestamptz not null,
  license_url text,
  created_at timestamptz not null default now(),
  unique(domain, rating_version, fetched_at)
);
create index if not exists domain_rating_observations_history_idx on public.domain_rating_observations(domain, rating_version, fetched_at desc);
alter table public.domain_rating_observations enable row level security;
revoke all on public.domain_rating_observations from anon, authenticated;
