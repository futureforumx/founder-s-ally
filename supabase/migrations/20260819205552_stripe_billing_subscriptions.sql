create table public.stripe_customers (
  user_id text primary key,
  stripe_customer_id text not null unique,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stripe_subscriptions (
  stripe_subscription_id text primary key,
  user_id text not null,
  stripe_customer_id text not null,
  stripe_price_id text,
  stripe_product_id text,
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stripe_subscriptions_user_id_idx
  on public.stripe_subscriptions (user_id);

create index stripe_subscriptions_customer_id_idx
  on public.stripe_subscriptions (stripe_customer_id);

alter table public.stripe_customers enable row level security;
alter table public.stripe_subscriptions enable row level security;

create policy "Users can read their Stripe customer"
  on public.stripe_customers
  for select
  to authenticated
  using ((auth.jwt()->>'sub') = user_id);

create policy "Users can read their Stripe subscriptions"
  on public.stripe_subscriptions
  for select
  to authenticated
  using ((auth.jwt()->>'sub') = user_id);

revoke all on public.stripe_customers from anon, authenticated;
revoke all on public.stripe_subscriptions from anon, authenticated;
grant select on public.stripe_customers to authenticated;
grant select on public.stripe_subscriptions to authenticated;

-- Billing entitlements are webhook-controlled. Users may read their own row,
-- while the service-role webhook and SECURITY DEFINER RPCs retain write access.
drop policy if exists "Users can update own credits" on public.user_credits;
drop policy if exists "Users can insert own credits" on public.user_credits;
revoke insert, update on public.user_credits from authenticated;
