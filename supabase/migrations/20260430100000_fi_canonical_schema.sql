-- =============================================================================
-- MIGRATION: 20260430100000_fi_canonical_schema
-- PURPOSE:   Funding-ingestion pipeline canonical data model.
--            Additive only — does not touch any existing Prisma-managed tables
--            (source_articles, funding_deals, funding_deal_investors).
--
-- NEW TABLES (all prefixed fi_ = funding ingestion):
--   fi_sources              — registry of all configured funding data sources
--   fi_fetch_runs           — one row per polling run per source
--   fi_documents            — raw fetched HTML / payloads per URL
--   fi_deals_raw            — one parsed candidate record per document × slot
--   fi_deals_canonical      — deduped / merged canonical funding deals
--   fi_deal_investors       — investors attached to canonical deals
--   fi_deal_source_links    — provenance: raw→canonical mapping
--   fi_errors               — pipeline error log
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'touch_updated_at' AND pronamespace = 'public'::regnamespace
  ) THEN
    CREATE OR REPLACE FUNCTION public.touch_updated_at()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $fn$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. fi_sources  — registry of all configured funding data sources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fi_sources (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text        NOT NULL UNIQUE,  -- e.g. 'startups_gallery_news'
  name            text        NOT NULL,
  base_url        text        NOT NULL,
  adapter_key     text        NOT NULL,         -- maps to TS adapter registry
  source_type     text        NOT NULL DEFAULT 'news',
  -- 'news' | 'curated_feed' | 'rumor_feed' | 'api'
  credibility_score numeric(4,3) NOT NULL DEFAULT 0.700,
  -- 0.0–1.0; drives confidence on ingested deals
  active          boolean     NOT NULL DEFAULT true,
  poll_interval_minutes int   NOT NULL DEFAULT 60,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  last_fetched_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fi_sources_type_chk CHECK (
    source_type IN ('news', 'curated_feed', 'rumor_feed', 'api')
  )
);

CREATE INDEX IF NOT EXISTS idx_fi_sources_active ON public.fi_sources (active) WHERE active;
CREATE INDEX IF NOT EXISTS idx_fi_sources_slug   ON public.fi_sources (slug);

CREATE TRIGGER fi_sources_touch_updated_at
  BEFORE UPDATE ON public.fi_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed built-in sources
INSERT INTO public.fi_sources (slug, name, base_url, adapter_key, source_type, credibility_score, poll_interval_minutes)
VALUES
  ('startups_gallery_news',   'Startups Gallery News',              'https://startups.gallery/news',                         'startups_gallery',   'curated_feed', 0.820, 120),
  ('vc_news_daily',           'VC News Daily',                      'https://vcnewsdaily.com/',                               'vc_news_daily',      'curated_feed', 0.800, 60),
  ('techcrunch_venture',      'TechCrunch Venture',                 'https://techcrunch.com/category/venture/',              'techcrunch',         'news',         0.880, 30),
  ('venture5_vc_deals',       'Venture5 VC Deals',                  'https://venture5.com/vc-deals/',                        'venture5',           'curated_feed', 0.770, 90),
  ('vcstack_funding',         'VC Stack Funding Announcements',     'https://www.vcstack.com/funding-announcements-rumours', 'vcstack',            'rumor_feed',   0.600, 60),
  ('crunchbase_api',          'Crunchbase API',                     'https://api.crunchbase.com',                            'crunchbase_api',     'api',          0.950, 360)
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  base_url         = EXCLUDED.base_url,
  source_type      = EXCLUDED.source_type,
  credibility_score= EXCLUDED.credibility_score,
  updated_at       = now();

-- ---------------------------------------------------------------------------
-- 2. fi_fetch_runs  — one row per polling execution per source
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fi_fetch_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid        NOT NULL REFERENCES public.fi_sources(id) ON DELETE CASCADE,
  run_mode        text        NOT NULL DEFAULT 'incremental',
  -- 'incremental' | 'backfill' | 'retry'
  status          text        NOT NULL DEFAULT 'running',
  -- 'running' | 'completed' | 'failed' | 'partial'
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  docs_fetched    int         NOT NULL DEFAULT 0,
  docs_parsed     int         NOT NULL DEFAULT 0,
  deals_raw       int         NOT NULL DEFAULT 0,
  deals_upserted  int         NOT NULL DEFAULT 0,
  error_count     int         NOT NULL DEFAULT 0,
  error_summary   text,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  CONSTRAINT fi_fetch_runs_mode_chk   CHECK (run_mode IN ('incremental','backfill','retry')),
  CONSTRAINT fi_fetch_runs_status_chk CHECK (status IN ('running','completed','failed','partial'))
);

CREATE INDEX IF NOT EXISTS idx_fi_fetch_runs_source_id   ON public.fi_fetch_runs (source_id);
CREATE INDEX IF NOT EXISTS idx_fi_fetch_runs_started_at  ON public.fi_fetch_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_fi_fetch_runs_status      ON public.fi_fetch_runs (status);

-- ---------------------------------------------------------------------------
-- 3. fi_documents  — raw fetched content per URL (idempotent store)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fi_documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid        NOT NULL REFERENCES public.fi_sources(id) ON DELETE CASCADE,
  fetch_run_id    uuid        REFERENCES public.fi_fetch_runs(id) ON DELETE SET NULL,
  url             text        NOT NULL,
  url_hash        text        NOT NULL,         -- SHA-256 of url for fast lookup
  doc_kind        text        NOT NULL DEFAULT 'detail',
  -- 'listing' | 'detail' | 'api_response'
  http_status     int,
  content_type    text,
  raw_html        text,                         -- full fetched body (may be NULL if not stored)
  parsed_payload  jsonb,                        -- structured extraction from the page
  content_hash    text,                         -- SHA-256 of raw content (change detection)
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  parse_status    text        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'parsed' | 'failed' | 'skipped'
  parse_error     text,
  parser_version  text        NOT NULL DEFAULT '1.0.0',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fi_documents_doc_kind_chk    CHECK (doc_kind IN ('listing','detail','api_response')),
  CONSTRAINT fi_documents_parse_status_chk CHECK (parse_status IN ('pending','parsed','failed','skipped')),
  CONSTRAINT fi_documents_source_url_unique UNIQUE (source_id, url_hash)
);

CREATE INDEX IF NOT EXISTS idx_fi_documents_source_id    ON public.fi_documents (source_id);
CREATE INDEX IF NOT EXISTS idx_fi_documents_url_hash     ON public.fi_documents (url_hash);
CREATE INDEX IF NOT EXISTS idx_fi_documents_parse_status ON public.fi_documents (parse_status);
CREATE INDEX IF NOT EXISTS idx_fi_documents_fetched_at   ON public.fi_documents (fetched_at DESC);

CREATE TRIGGER fi_documents_touch_updated_at
  BEFORE UPDATE ON public.fi_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. fi_deals_raw  — one parsed candidate per document × slot
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fi_deals_raw (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid        NOT NULL REFERENCES public.fi_documents(id) ON DELETE CASCADE,
  source_id       uuid        NOT NULL REFERENCES public.fi_sources(id) ON DELETE CASCADE,
  fetch_run_id    uuid        REFERENCES public.fi_fetch_runs(id) ON DELETE SET NULL,
  slot_index      int         NOT NULL DEFAULT 0,  -- for multi-deal articles

  -- Raw extracted fields (exactly as parsed)
  company_name_raw        text,
  company_domain_raw      text,
  company_website_raw     text,
  company_location_raw    text,
  round_type_raw          text,
  amount_raw              text,
  currency_raw            text,
  announced_date_raw      text,
  lead_investor_raw       text,
  co_investors_raw        text[],
  sector_raw              text,
  article_url             text,
  press_url               text,
  source_type             text        NOT NULL DEFAULT 'news',
  -- 'news' | 'curated_feed' | 'rumor' | 'api'
  is_rumor                boolean     NOT NULL DEFAULT false,
  confidence_score        numeric(4,3) NOT NULL DEFAULT 0.500,
  extracted_summary       text,
  extraction_method       text        NOT NULL DEFAULT 'html_parse',
  -- 'html_parse' | 'rss' | 'api' | 'llm'
  extraction_metadata     jsonb       NOT NULL DEFAULT '{}',

  -- Normalization status
  canonical_deal_id       uuid,       -- set after canonical upsert
  normalization_status    text        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'normalized' | 'skipped' | 'failed'
  normalization_error     text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fi_deals_raw_source_type_chk CHECK (
    source_type IN ('news','curated_feed','rumor','api')
  ),
  CONSTRAINT fi_deals_raw_norm_status_chk CHECK (
    normalization_status IN ('pending','normalized','skipped','failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_fi_deals_raw_document_id         ON public.fi_deals_raw (document_id);
CREATE INDEX IF NOT EXISTS idx_fi_deals_raw_source_id           ON public.fi_deals_raw (source_id);
CREATE INDEX IF NOT EXISTS idx_fi_deals_raw_canonical_deal_id   ON public.fi_deals_raw (canonical_deal_id)
  WHERE canonical_deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fi_deals_raw_normalization_status ON public.fi_deals_raw (normalization_status);
CREATE INDEX IF NOT EXISTS idx_fi_deals_raw_created_at          ON public.fi_deals_raw (created_at DESC);

CREATE TRIGGER fi_deals_raw_touch_updated_at
  BEFORE UPDATE ON public.fi_deals_raw
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. fi_deals_canonical  — deduped, merged canonical funding deals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fi_deals_canonical (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Company
  company_name            text        NOT NULL,
  normalized_company_name text        NOT NULL,
  company_domain          text,
  company_website         text,
  company_linkedin_url    text,
  company_location        text,

  -- Sector
  sector_raw              text,
  sector_normalized       text,

  -- Round
  round_type_raw          text,
  round_type_normalized   text,
  -- pre_seed | seed | series_a | series_b | series_c | growth | strategic | debt | grant | unknown | other

  -- Amount
  amount_raw              text,
  amount_minor_units      bigint,     -- in currency minor units (e.g. USD cents × 100 = dollars × 100)
  currency                text        NOT NULL DEFAULT 'USD',

  -- Dates
  announced_date          date,

  -- Investors
  lead_investor           text,
  lead_investor_normalized text,
  co_investors            text[]      NOT NULL DEFAULT '{}',

  -- Provenance
  primary_source_name     text,
  primary_source_url      text,
  primary_press_url       text,
  source_type             text        NOT NULL DEFAULT 'news',
  -- 'news' | 'curated_feed' | 'rumor' | 'api'
  is_rumor                boolean     NOT NULL DEFAULT false,
  confidence_score        numeric(4,3) NOT NULL DEFAULT 0.500,
  source_count            int         NOT NULL DEFAULT 1,

  -- Content
  extracted_summary       text,
  extraction_method       text        NOT NULL DEFAULT 'html_parse',

  -- Deduplication
  dedupe_key              text,       -- deterministic merge key
  duplicate_of_deal_id    uuid        REFERENCES public.fi_deals_canonical(id) ON DELETE SET NULL,
  needs_review            boolean     NOT NULL DEFAULT false,
  review_reason           text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fi_deals_canonical_source_type_chk CHECK (
    source_type IN ('news','curated_feed','rumor','api')
  )
);

-- Unique dedupe key (one canonical deal per company+round+date-window)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fi_deals_canonical_dedupe_key
  ON public.fi_deals_canonical (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fi_deals_canonical_normalized_company
  ON public.fi_deals_canonical (normalized_company_name);
CREATE INDEX IF NOT EXISTS idx_fi_deals_canonical_domain
  ON public.fi_deals_canonical (company_domain)
  WHERE company_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fi_deals_canonical_announced_date
  ON public.fi_deals_canonical (announced_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_fi_deals_canonical_round_type
  ON public.fi_deals_canonical (round_type_normalized);
CREATE INDEX IF NOT EXISTS idx_fi_deals_canonical_confidence
  ON public.fi_deals_canonical (confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_fi_deals_canonical_not_rumor
  ON public.fi_deals_canonical (announced_date DESC NULLS LAST)
  WHERE is_rumor = false AND duplicate_of_deal_id IS NULL AND needs_review = false;
CREATE INDEX IF NOT EXISTS idx_fi_deals_canonical_created_at
  ON public.fi_deals_canonical (created_at DESC);

CREATE TRIGGER fi_deals_canonical_touch_updated_at
  BEFORE UPDATE ON public.fi_deals_canonical
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. fi_deal_investors  — investors attached to canonical deals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fi_deal_investors (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         uuid        NOT NULL REFERENCES public.fi_deals_canonical(id) ON DELETE CASCADE,
  role            text        NOT NULL DEFAULT 'participant',
  -- 'lead' | 'participant' | 'existing' | 'unknown'
  name_raw        text        NOT NULL,
  name_normalized text        NOT NULL,
  sort_order      int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fi_deal_investors_role_chk CHECK (
    role IN ('lead','participant','existing','unknown')
  ),
  CONSTRAINT fi_deal_investors_unique UNIQUE (deal_id, name_normalized, role)
);

CREATE INDEX IF NOT EXISTS idx_fi_deal_investors_deal_id        ON public.fi_deal_investors (deal_id);
CREATE INDEX IF NOT EXISTS idx_fi_deal_investors_name_normalized ON public.fi_deal_investors (name_normalized);

-- ---------------------------------------------------------------------------
-- 7. fi_deal_source_links  — provenance: raw deal → canonical deal mapping
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fi_deal_source_links (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_deal_id uuid      NOT NULL REFERENCES public.fi_deals_canonical(id) ON DELETE CASCADE,
  raw_deal_id     uuid        REFERENCES public.fi_deals_raw(id) ON DELETE SET NULL,
  source_id       uuid        NOT NULL REFERENCES public.fi_sources(id) ON DELETE CASCADE,
  source_name     text        NOT NULL,
  source_url      text,
  press_url       text,
  source_type     text        NOT NULL DEFAULT 'news',
  confidence_score numeric(4,3) NOT NULL DEFAULT 0.500,
  contributed_fields text[]   NOT NULL DEFAULT '{}',
  -- which fields this source contributed to the canonical record
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fi_deal_source_links_unique UNIQUE (canonical_deal_id, raw_deal_id)
);

CREATE INDEX IF NOT EXISTS idx_fi_deal_source_links_canonical ON public.fi_deal_source_links (canonical_deal_id);
CREATE INDEX IF NOT EXISTS idx_fi_deal_source_links_raw       ON public.fi_deal_source_links (raw_deal_id)
  WHERE raw_deal_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8. fi_errors  — pipeline error log (quarantine / audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fi_errors (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fetch_run_id    uuid        REFERENCES public.fi_fetch_runs(id) ON DELETE CASCADE,
  source_id       uuid        REFERENCES public.fi_sources(id) ON DELETE SET NULL,
  document_id     uuid        REFERENCES public.fi_documents(id) ON DELETE SET NULL,
  error_stage     text        NOT NULL,
  -- 'fetch' | 'parse' | 'normalize' | 'dedupe' | 'upsert'
  error_code      text,
  error_message   text        NOT NULL,
  error_detail    jsonb,
  url             text,
  retryable       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fi_errors_stage_chk CHECK (
    error_stage IN ('fetch','parse','normalize','dedupe','upsert')
  )
);

CREATE INDEX IF NOT EXISTS idx_fi_errors_fetch_run_id ON public.fi_errors (fetch_run_id)
  WHERE fetch_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fi_errors_source_id    ON public.fi_errors (source_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fi_errors_created_at   ON public.fi_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fi_errors_retryable    ON public.fi_errors (retryable, created_at DESC)
  WHERE retryable = true;

-- ---------------------------------------------------------------------------
-- RLS: all fi_* tables are service-role only for writes; anon/authenticated
-- may not read raw or error tables. Canonical deals are readable by service_role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.fi_sources           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fi_fetch_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fi_documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fi_deals_raw         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fi_deals_canonical   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fi_deal_investors    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fi_deal_source_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fi_errors            ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by Edge Functions)
CREATE POLICY fi_sources_service_all           ON public.fi_sources           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY fi_fetch_runs_service_all        ON public.fi_fetch_runs        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY fi_documents_service_all         ON public.fi_documents         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY fi_deals_raw_service_all         ON public.fi_deals_raw         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY fi_deals_canonical_service_all   ON public.fi_deals_canonical   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY fi_deal_investors_service_all    ON public.fi_deal_investors    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY fi_deal_source_links_service_all ON public.fi_deal_source_links FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY fi_errors_service_all            ON public.fi_errors            FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Canonical deals and their investors are readable by authenticated / anon via the RPC only
-- (Direct table reads blocked; RPC uses SECURITY DEFINER)

COMMENT ON TABLE public.fi_sources           IS 'Registry of all funding data source configs for the fi_ ingestion pipeline.';
COMMENT ON TABLE public.fi_fetch_runs        IS 'One row per polling execution per source; tracks run state and stats.';
COMMENT ON TABLE public.fi_documents         IS 'Raw fetched HTML/payloads per URL with idempotency guard on (source_id, url_hash).';
COMMENT ON TABLE public.fi_deals_raw         IS 'One parsed candidate deal per document x slot; feeds normalization + dedupe.';
COMMENT ON TABLE public.fi_deals_canonical   IS 'Deduped, merged canonical funding deals from all sources.';
COMMENT ON TABLE public.fi_deal_investors    IS 'Investors attached to canonical deals; roles: lead, participant, existing, unknown.';
COMMENT ON TABLE public.fi_deal_source_links IS 'Provenance map: which raw deal + source contributed to each canonical deal.';
COMMENT ON TABLE public.fi_errors           IS 'Pipeline error/quarantine log; retryable flag drives retry jobs.';
