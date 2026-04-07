-- =============================================================================
-- Migration: Fund enrichment pipeline tables
-- fund_records (Supabase-side fund registry), fund_aliases, fund_source_evidence,
-- enrichment_review_queue
-- =============================================================================

-- ---------------------------------------------------------------
-- 0. Enum types (idempotent)
-- ---------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.fund_source_type AS ENUM (
    'official_website',
    'sec_filing',
    'crunchbase',
    'pitchbook',
    'preqin',
    'news_article',
    'press_release',
    'lp_disclosure',
    'secondary_aggregator',
    'ai_inferred',
    'manual',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fund_status_enum AS ENUM (
    'active', 'closed', 'forming', 'winding_down'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.review_status AS ENUM (
    'pending', 'approved', 'rejected', 'merged'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.review_entity_type AS ENUM (
    'fund', 'fund_alias', 'firm_fund_link'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------
-- 1. fund_records — Supabase-side fund registry
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fund_records (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_id               uuid REFERENCES public.firm_records(id) ON DELETE CASCADE,
  prisma_fund_id        text UNIQUE,

  fund_name             text NOT NULL,
  normalized_fund_name  text,
  fund_number           integer,

  fund_type             text DEFAULT 'traditional',
  fund_status           public.fund_status_enum DEFAULT 'active',
  strategy              text,

  vintage_year          integer,
  open_date             timestamptz,
  close_date            timestamptz,

  currency              varchar(3) DEFAULT 'USD',
  size_usd              double precision,
  target_size_usd       double precision,
  final_close_size_usd  double precision,
  aum_usd               double precision,
  committed_capital     double precision,
  gp_commit_usd         double precision,

  stage_focus           text[] DEFAULT '{}',
  sector_focus          text[] DEFAULT '{}',
  geo_focus             text[] DEFAULT '{}',
  themes                text[] DEFAULT '{}',

  avg_check_size_min    double precision,
  avg_check_size_max    double precision,
  actively_deploying    boolean DEFAULT true,

  confidence            numeric(3,2) DEFAULT 0.00,
  source_url            text,

  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  deleted_at            timestamptz,

  CONSTRAINT fund_records_firm_normalized_name_key
    UNIQUE (firm_id, normalized_fund_name)
);

CREATE INDEX IF NOT EXISTS fund_records_firm_id_idx ON public.fund_records(firm_id);
CREATE INDEX IF NOT EXISTS fund_records_normalized_name_idx ON public.fund_records(normalized_fund_name);
CREATE INDEX IF NOT EXISTS fund_records_vintage_year_idx ON public.fund_records(vintage_year);
CREATE INDEX IF NOT EXISTS fund_records_fund_status_idx ON public.fund_records(fund_status);
CREATE INDEX IF NOT EXISTS fund_records_confidence_idx ON public.fund_records(confidence);
CREATE INDEX IF NOT EXISTS fund_records_deleted_at_idx ON public.fund_records(deleted_at);

-- ---------------------------------------------------------------
-- 2. fund_aliases — alternate fund names for dedup
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fund_aliases (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fund_id           uuid NOT NULL REFERENCES public.fund_records(id) ON DELETE CASCADE,

  alias_value       text NOT NULL,
  normalized_value  text NOT NULL,

  source            text,
  notes             text,
  confidence        double precision,

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),

  CONSTRAINT fund_aliases_fund_normalized_key UNIQUE (fund_id, normalized_value)
);

CREATE INDEX IF NOT EXISTS fund_aliases_normalized_value_idx ON public.fund_aliases(normalized_value);
CREATE INDEX IF NOT EXISTS fund_aliases_fund_id_idx ON public.fund_aliases(fund_id);

-- ---------------------------------------------------------------
-- 3. fund_source_evidence — traceable evidence per fund write
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fund_source_evidence (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fund_id           uuid NOT NULL REFERENCES public.fund_records(id) ON DELETE CASCADE,

  field_name        text NOT NULL DEFAULT '*',
  source_type       public.fund_source_type NOT NULL,
  source_url        text,
  evidence_quote    text,
  source_confidence numeric(3,2) NOT NULL DEFAULT 0.50,
  raw_payload       jsonb,

  discovered_at     timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fund_source_evidence_fund_id_idx ON public.fund_source_evidence(fund_id);
CREATE INDEX IF NOT EXISTS fund_source_evidence_source_type_idx ON public.fund_source_evidence(source_type);
CREATE INDEX IF NOT EXISTS fund_source_evidence_confidence_idx ON public.fund_source_evidence(source_confidence);

-- ---------------------------------------------------------------
-- 4. enrichment_review_queue — ambiguous records for human review
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.enrichment_review_queue (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  entity_type       public.review_entity_type NOT NULL,
  entity_id         text NOT NULL,
  firm_id           uuid REFERENCES public.firm_records(id) ON DELETE SET NULL,

  reason            text NOT NULL,
  review_data       jsonb,
  status            public.review_status NOT NULL DEFAULT 'pending',

  resolved_by       text,
  resolved_at       timestamptz,
  resolution_notes  text,

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enrichment_review_queue_entity_status_idx
  ON public.enrichment_review_queue(entity_type, status);
CREATE INDEX IF NOT EXISTS enrichment_review_queue_firm_id_idx
  ON public.enrichment_review_queue(firm_id);
CREATE INDEX IF NOT EXISTS enrichment_review_queue_status_idx
  ON public.enrichment_review_queue(status);
CREATE INDEX IF NOT EXISTS enrichment_review_queue_created_at_idx
  ON public.enrichment_review_queue(created_at);

-- ---------------------------------------------------------------
-- 5. RLS policies
-- ---------------------------------------------------------------

ALTER TABLE public.fund_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_source_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_review_queue ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read fund data
CREATE POLICY "fund_records_select_authenticated"
  ON public.fund_records FOR SELECT
  TO authenticated USING (deleted_at IS NULL);

CREATE POLICY "fund_aliases_select_authenticated"
  ON public.fund_aliases FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "fund_source_evidence_select_authenticated"
  ON public.fund_source_evidence FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "enrichment_review_queue_select_authenticated"
  ON public.enrichment_review_queue FOR SELECT
  TO authenticated USING (true);

-- Service role can do everything
CREATE POLICY "fund_records_service_all"
  ON public.fund_records FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "fund_aliases_service_all"
  ON public.fund_aliases FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "fund_source_evidence_service_all"
  ON public.fund_source_evidence FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "enrichment_review_queue_service_all"
  ON public.enrichment_review_queue FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 6. Updated_at trigger
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fund_records_updated_at ON public.fund_records;
CREATE TRIGGER fund_records_updated_at
  BEFORE UPDATE ON public.fund_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS fund_aliases_updated_at ON public.fund_aliases;
CREATE TRIGGER fund_aliases_updated_at
  BEFORE UPDATE ON public.fund_aliases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS enrichment_review_queue_updated_at ON public.enrichment_review_queue;
CREATE TRIGGER enrichment_review_queue_updated_at
  BEFORE UPDATE ON public.enrichment_review_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
