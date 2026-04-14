-- Cache for /api/firm-website-team (avoids repeated team-page crawls per firm website host).

CREATE TABLE IF NOT EXISTS public.firm_website_team_cache (
  firm_website_host   text PRIMARY KEY,
  people              jsonb NOT NULL DEFAULT '[]'::jsonb,
  team_member_estimate integer NOT NULL DEFAULT 0,
  fetched_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firm_website_team_cache_fetched_at
  ON public.firm_website_team_cache (fetched_at DESC);

COMMENT ON TABLE public.firm_website_team_cache IS
  'Server-side cache for firm website team scrape payloads keyed by normalized host.';

ALTER TABLE public.firm_website_team_cache ENABLE ROW LEVEL SECURITY;
