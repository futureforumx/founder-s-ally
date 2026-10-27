-- Square brand mark, kept separate from the wordmark in startups.logo_url.

alter table public.startups
  add column if not exists brand_icon_url text;

comment on column public.startups.brand_icon_url is
  'URL for the company brand icon. logo_url remains the wordmark.';
