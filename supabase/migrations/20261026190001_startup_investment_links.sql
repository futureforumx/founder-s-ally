-- Links a market-intelligence startup to a firm, an optional round and check size,
-- and an optional person at that firm. Admin writes go through admin-market-intel.

create table if not exists public.startup_investment_links (
  id uuid primary key default gen_random_uuid(),
  startup_id text not null references public.startups(id) on delete cascade,
  firm_id uuid not null references public.firm_records(id) on delete cascade,
  firm_investor_id uuid references public.firm_investors(id) on delete set null,
  round_name text,
  amount_usd numeric,
  firm_recent_deal_id uuid references public.firm_recent_deals(id) on delete set null,
  portfolio_investment_id uuid references public.portfolio_investments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists startup_investment_links_identity
  on public.startup_investment_links (
    startup_id,
    firm_id,
    coalesce(lower(btrim(round_name)), ''),
    coalesce(firm_investor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists startup_investment_links_startup_idx
  on public.startup_investment_links (startup_id);

alter table public.startup_investment_links enable row level security;

revoke all on table public.startup_investment_links from public, anon, authenticated;

comment on table public.startup_investment_links is
  'Admin links from a startup to a firm portfolio deal, round, check size, and optional firm investor.';
