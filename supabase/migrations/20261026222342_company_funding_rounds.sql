-- Admin-entered funding rounds for a market-intelligence company.
-- public.startup_funding_rounds is the scraper history table (source, confidence,
-- lead investors, unique on round date) and is not the editor's round list.
-- Writes go through the admin-market-intel service role, not the browser client.
-- Saving rounds must not touch startups or startup_investment_links.

create table if not exists public.company_funding_rounds (
  id uuid primary key default gen_random_uuid(),
  startup_id text not null references public.startups(id) on delete cascade,
  round_type text not null,
  amount_usd numeric,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_funding_rounds_round_type_check check (
    round_type in (
      'Angel',
      'Accelerator',
      'Pre-Seed',
      'Seed',
      'Series A',
      'Series B',
      'Series C',
      'Growth'
    )
  ),
  constraint company_funding_rounds_amount_nonnegative check (amount_usd is null or amount_usd >= 0)
);

create index if not exists company_funding_rounds_startup_sort_idx
  on public.company_funding_rounds (startup_id, sort_order, created_at);

alter table public.company_funding_rounds enable row level security;

revoke all on table public.company_funding_rounds from public, anon, authenticated;
grant all on table public.company_funding_rounds to service_role;

comment on table public.company_funding_rounds is
  'Admin-entered company funding rounds. Round size is amount_usd. Investor links store the same round_type in startup_investment_links.round_name.';
