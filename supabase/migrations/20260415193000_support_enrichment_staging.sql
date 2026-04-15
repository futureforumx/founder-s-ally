-- ============================================================
-- Migration: Support enrichment staging tables
-- Date:      2026-04-15
-- Purpose:   Store read-only enrichment candidates and QA flags
--            without touching the live backfill write path.
--            Safe / idempotent — uses IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.firm_source_url_candidates (
  candidate_key     text PRIMARY KEY,
  firm_id           uuid NOT NULL REFERENCES public.firm_records(id) ON DELETE CASCADE,
  source_name       text NOT NULL,
  candidate_url     text NOT NULL,
  confidence_score  numeric(4,3) NOT NULL DEFAULT 0.500,
  discovery_method  text NOT NULL,
  discovered_at     timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'pending',
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firm_source_url_candidates_status_chk
    CHECK (status IN ('pending', 'accepted', 'rejected', 'applied'))
);

CREATE INDEX IF NOT EXISTS idx_firm_source_url_candidates_firm_id
  ON public.firm_source_url_candidates (firm_id);

CREATE INDEX IF NOT EXISTS idx_firm_source_url_candidates_source_name
  ON public.firm_source_url_candidates (source_name);

CREATE INDEX IF NOT EXISTS idx_firm_source_url_candidates_status
  ON public.firm_source_url_candidates (status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_firm_source_url_candidates_unique_row
  ON public.firm_source_url_candidates (firm_id, source_name, candidate_url);

COMMENT ON TABLE public.firm_source_url_candidates IS
  'Read-only staging table for candidate source URLs discovered by the support enrichment job.';

CREATE TABLE IF NOT EXISTS public.firm_data_qa_flags (
  flag_key          text PRIMARY KEY,
  firm_id           uuid NOT NULL REFERENCES public.firm_records(id) ON DELETE CASCADE,
  flag_type         text NOT NULL,
  field_name        text,
  current_value     text,
  suggested_value   text,
  confidence_score  numeric(4,3) NOT NULL DEFAULT 0.500,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firm_data_qa_flags_firm_id
  ON public.firm_data_qa_flags (firm_id);

CREATE INDEX IF NOT EXISTS idx_firm_data_qa_flags_flag_type
  ON public.firm_data_qa_flags (flag_type);

CREATE INDEX IF NOT EXISTS idx_firm_data_qa_flags_created_at
  ON public.firm_data_qa_flags (created_at DESC);

COMMENT ON TABLE public.firm_data_qa_flags IS
  'Read-only staging table for QA findings emitted by the support enrichment job.';

ALTER TABLE public.firm_source_url_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_data_qa_flags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "firm_source_url_candidates_read"
    ON public.firm_source_url_candidates
    FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "firm_data_qa_flags_read"
    ON public.firm_data_qa_flags
    FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.set_firm_source_url_candidates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firm_source_url_candidates_updated_at
  ON public.firm_source_url_candidates;

CREATE TRIGGER trg_firm_source_url_candidates_updated_at
  BEFORE UPDATE ON public.firm_source_url_candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_firm_source_url_candidates_updated_at();
