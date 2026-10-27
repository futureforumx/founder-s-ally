-- Company-editor "Led Round" is per startup + firm + round.
-- startup_investment_links.led_round is the link flag (shared by every person at that firm for that round).
-- portfolio_investments.led_round already means this firm led this round; the linker keeps it in sync.
-- firm_recent_deals is one row per firm + portfolio company, which is what the firm record shows.
-- led_rounds lists the round names this firm led for that company.

alter table public.startup_investment_links
  add column if not exists led_round boolean not null default false;

comment on column public.startup_investment_links.led_round is
  'True when this firm led this round for this startup. All person links for that firm and round share the flag. At most one firm leads a given round.';

alter table public.firm_recent_deals
  add column if not exists led_rounds text[] not null default '{}';

comment on column public.firm_recent_deals.led_rounds is
  'Round names this firm led for this portfolio company. Kept in sync with startup_investment_links.led_round and portfolio_investments.led_round.';
