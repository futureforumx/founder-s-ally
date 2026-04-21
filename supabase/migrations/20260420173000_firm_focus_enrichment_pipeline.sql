-- Firm focus enrichment pipeline storage.
-- Adds canonical firm fields, field-level evidence tables, and review support
-- for official-site / TechCrunch / PR-backed focus enrichment.

ALTER TYPE public.review_entity_type ADD VALUE IF NOT EXISTS 'firm_focus';

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS sector_focus text[],
  ADD COLUMN IF NOT EXISTS latest_fund_name text,
  ADD COLUMN IF NOT EXISTS latest_fund_announcement_date date,
  ADD COLUMN IF NOT EXISTS underrepresented_founders_focus boolean,
  ADD COLUMN IF NOT EXISTS underrepresented_founders_focus_label text,
  ADD COLUMN IF NOT EXISTS underrepresented_founders_focus_rationale text,
  ADD COLUMN IF NOT EXISTS evidence_urls text[],
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS focus_enriched_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'firm_records_extraction_confidence_chk'
  ) THEN
    ALTER TABLE public.firm_records
      ADD CONSTRAINT firm_records_extraction_confidence_chk
      CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_firm_records_focus_enriched_at
  ON public.firm_records (focus_enriched_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_firm_records_latest_fund_announcement_date
  ON public.firm_records (latest_fund_announcement_date DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.firm_enrichment_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  commit_mode boolean NOT NULL DEFAULT false,
  limit_count integer,
  offset_count integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  report_path text,
  config_json jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firm_enrichment_runs_started_at
  ON public.firm_enrichment_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.firm_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.firm_enrichment_runs(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firm_records(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  normalized_value_json jsonb NOT NULL,
  confidence_score numeric(4,3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  source_type text NOT NULL,
  source_url text,
  is_winner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firm_field_values_firm_field
  ON public.firm_field_values (firm_id, field_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_firm_field_values_run
  ON public.firm_field_values (run_id);

CREATE TABLE IF NOT EXISTS public.firm_source_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.firm_enrichment_runs(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firm_records(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  source_type text NOT NULL,
  source_url text NOT NULL,
  source_title text,
  quote_or_snippet text NOT NULL,
  value_json jsonb NOT NULL,
  confidence_score numeric(4,3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firm_source_evidence_firm
  ON public.firm_source_evidence (firm_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_firm_source_evidence_source_type
  ON public.firm_source_evidence (source_type);

ALTER TABLE public.firm_enrichment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_source_evidence ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'firm_enrichment_runs'
      AND policyname = 'firm_enrichment_runs_select_authenticated'
  ) THEN
    CREATE POLICY firm_enrichment_runs_select_authenticated
      ON public.firm_enrichment_runs FOR SELECT
      TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'firm_field_values'
      AND policyname = 'firm_field_values_select_authenticated'
  ) THEN
    CREATE POLICY firm_field_values_select_authenticated
      ON public.firm_field_values FOR SELECT
      TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'firm_source_evidence'
      AND policyname = 'firm_source_evidence_select_authenticated'
  ) THEN
    CREATE POLICY firm_source_evidence_select_authenticated
      ON public.firm_source_evidence FOR SELECT
      TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'firm_enrichment_runs'
      AND policyname = 'firm_enrichment_runs_service_all'
  ) THEN
    CREATE POLICY firm_enrichment_runs_service_all
      ON public.firm_enrichment_runs FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'firm_field_values'
      AND policyname = 'firm_field_values_service_all'
  ) THEN
    CREATE POLICY firm_field_values_service_all
      ON public.firm_field_values FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'firm_source_evidence'
      AND policyname = 'firm_source_evidence_service_all'
  ) THEN
    CREATE POLICY firm_source_evidence_service_all
      ON public.firm_source_evidence FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firm_enrichment_runs_updated_at ON public.firm_enrichment_runs;
CREATE TRIGGER trg_firm_enrichment_runs_updated_at
BEFORE UPDATE ON public.firm_enrichment_runs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.firm_enrichment_runs IS
  'Run-level logs for focused venture-firm enrichment jobs.';

COMMENT ON TABLE public.firm_field_values IS
  'Structured normalized field values emitted during a firm enrichment run. Stores winners and alternates.';

COMMENT ON TABLE public.firm_source_evidence IS
  'Raw provenance snippets and URLs backing firm focus enrichment fields.';
