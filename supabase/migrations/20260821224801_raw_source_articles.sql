-- Shared raw listing cache for GHA ingest jobs (TechCrunch / AlleyWatch RSS).
-- Distinct from source_articles (processed extraction state).
-- Ingest jobs write via Prisma (DATABASE_URL / postgres). Not a public Data API surface.

CREATE TABLE IF NOT EXISTS public.raw_source_articles (
  id text PRIMARY KEY,
  source_key "FundingIngestSourceKey" NOT NULL,
  canonical_url text NOT NULL,
  article_url text NOT NULL,
  listing_url text,
  title text NOT NULL,
  published_at timestamptz,
  summary text,
  raw_payload jsonb NOT NULL,
  content_hash varchar(128) NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS raw_source_articles_source_key_canonical_url_key
  ON public.raw_source_articles (source_key, canonical_url);

CREATE INDEX IF NOT EXISTS raw_source_articles_source_key_published_at_idx
  ON public.raw_source_articles (source_key, published_at);

CREATE INDEX IF NOT EXISTS raw_source_articles_source_key_fetched_at_idx
  ON public.raw_source_articles (source_key, fetched_at);

ALTER TABLE public.raw_source_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "raw_source_articles_service_all" ON public.raw_source_articles;
CREATE POLICY "raw_source_articles_service_all"
  ON public.raw_source_articles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.raw_source_articles FROM anon, authenticated;
GRANT ALL ON TABLE public.raw_source_articles TO service_role;

COMMENT ON TABLE public.raw_source_articles IS
  'Raw RSS/listing payloads shared by funding-ingest and vc-fund-sync. Not processed deal state.';
