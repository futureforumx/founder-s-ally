-- Persist top-nav omnibar and AI home searches for engagement analytics.
create table if not exists public.product_searches (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  source text not null,
  query text,
  user_id text,
  constraint product_searches_source_check check (source in ('omnibar', 'ai_home'))
);

create index if not exists product_searches_created_at_idx
  on public.product_searches (created_at desc);

create index if not exists product_searches_source_created_at_idx
  on public.product_searches (source, created_at desc);

alter table public.product_searches enable row level security;

create policy "product_searches_insert"
  on public.product_searches
  for insert
  to anon, authenticated
  with check (true);

grant insert on public.product_searches to anon, authenticated;
