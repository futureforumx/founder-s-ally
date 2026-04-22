-- Track every outbound click that passes through /outbound for analytics and referral attribution.
create table if not exists public.outbound_clicks (
  id          uuid        default gen_random_uuid() primary key,
  created_at  timestamptz default now()            not null,
  destination_url text                             not null,
  type        text,          -- e.g. 'funding_article', 'firm_website', 'company_website', 'lead_investor'
  context     text,          -- e.g. 'fresh_funds', 'latest_funding'
  entity_id   text,          -- vc_fund_id, deal id, or firm id
  referrer    text,          -- document.referrer at time of click
  user_agent  text           -- navigator.userAgent at time of click
);

alter table public.outbound_clicks enable row level security;

-- Anyone (anon or authenticated) can insert a click event.
-- Reads are restricted to service-role only (no client-facing SELECT policy).
create policy "outbound_clicks_public_insert"
  on public.outbound_clicks
  for insert
  to anon, authenticated
  with check (true);
