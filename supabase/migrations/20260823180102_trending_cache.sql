-- Daily ranked early-stage leaderboard. Written by midnight UTC cron; read on /trending-startups.
-- Tables are not auto-exposed to the Data API; grant SELECT and enable RLS.
-- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

CREATE TABLE IF NOT EXISTS public.trending_cache (
  id text PRIMARY KEY,
  rank integer NOT NULL,
  startup_name text NOT NULL,
  domain text NOT NULL,
  category text NOT NULL,
  score double precision NOT NULL,
  velocity_sparkline jsonb NOT NULL DEFAULT '[]'::jsonb,
  why_trending text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT trending_cache_rank_nonnegative CHECK (rank >= 0)
);

CREATE INDEX IF NOT EXISTS trending_cache_rank_idx ON public.trending_cache (rank ASC);

DROP TRIGGER IF EXISTS trending_cache_updated_at ON public.trending_cache;
CREATE TRIGGER trending_cache_updated_at
  BEFORE UPDATE ON public.trending_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.trending_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trending_cache_select_public" ON public.trending_cache;
CREATE POLICY "trending_cache_select_public"
  ON public.trending_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "trending_cache_service_all" ON public.trending_cache;
CREATE POLICY "trending_cache_service_all"
  ON public.trending_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.trending_cache IS
  'Idempotent daily snapshot of the early-stage trending leaderboard. Cron writes; page loads only SELECT.';

REVOKE ALL ON TABLE public.trending_cache FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.trending_cache FROM anon, authenticated;
GRANT SELECT ON TABLE public.trending_cache TO anon, authenticated;
GRANT ALL ON TABLE public.trending_cache TO service_role;
