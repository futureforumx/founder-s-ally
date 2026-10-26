-- =============================================================================
-- Alexandria enrichment pipeline (additive, non-destructive)
--
-- Reuses the existing enrichment tables:
--   enrichment_field_provenance, enrichment_candidate_values,
--   enrichment_match_failures, enrichment_scrape_runs,
--   enrichment_scrape_checkpoints, enrichment_review_queue
-- and adds only what they cannot express:
--   alexandria_enrichment_state   per-record cadence / retry / completeness
--   alexandria_credit_ledger      credits by provider, entity, request, run, batch
--   alexandria_provider_cache     cached provider responses (service role only)
--   alexandria_enrichment_changes before/after values enabling batch rollback
--
-- Nothing here drops data, renames columns or alters existing row values.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Widen entity_type on existing enrichment tables (firm, investor -> + company,
--    founder, operator). Widening a CHECK never invalidates existing rows.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  tbl text;
  tables text[] := ARRAY[
    'enrichment_field_provenance',
    'enrichment_candidate_values',
    'enrichment_scrape_checkpoints',
    'enrichment_match_failures'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOR r IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = format('public.%I', tbl)::regclass
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%entity_type%'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', tbl, r.conname);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (entity_type IN (''firm'',''investor'',''company'',''founder'',''operator''))',
      tbl,
      tbl || '_entity_type_check'
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Extra provenance columns (all nullable; existing writers are unaffected)
-- ---------------------------------------------------------------------------
ALTER TABLE public.enrichment_field_provenance
  ADD COLUMN IF NOT EXISTS run_id              text,
  ADD COLUMN IF NOT EXISTS batch_id            uuid,
  ADD COLUMN IF NOT EXISTS provider            text,
  ADD COLUMN IF NOT EXISTS capability          text,
  ADD COLUMN IF NOT EXISTS credits_cost        numeric(10,2),
  ADD COLUMN IF NOT EXISTS confidence_label    text CHECK (confidence_label IS NULL OR confidence_label IN ('high','medium','low')),
  ADD COLUMN IF NOT EXISTS fact_kind           text CHECK (fact_kind IS NULL OR fact_kind IN ('explicit','inferred')),
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS decision            text;

CREATE INDEX IF NOT EXISTS idx_efp_run   ON public.enrichment_field_provenance (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_efp_batch ON public.enrichment_field_provenance (batch_id) WHERE batch_id IS NOT NULL;

ALTER TABLE public.enrichment_candidate_values
  ADD COLUMN IF NOT EXISTS run_id           text,
  ADD COLUMN IF NOT EXISTS provider         text,
  ADD COLUMN IF NOT EXISTS capability       text,
  ADD COLUMN IF NOT EXISTS confidence_label text CHECK (confidence_label IS NULL OR confidence_label IN ('high','medium','low')),
  ADD COLUMN IF NOT EXISTS fact_kind        text CHECK (fact_kind IS NULL OR fact_kind IN ('explicit','inferred'));

CREATE INDEX IF NOT EXISTS idx_ecv_run ON public.enrichment_candidate_values (run_id) WHERE run_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Per-record enrichment state (cadence, retry eligibility, completeness delta)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alexandria_enrichment_state (
  entity_type         text NOT NULL CHECK (entity_type IN ('firm','investor','company','founder','operator')),
  entity_id           text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','enriched','unchanged','no_match','ambiguous','failed','skipped','budget_stopped')),
  last_attempt_at     timestamptz,
  last_success_at     timestamptz,
  last_run_id         text,
  attempts            integer NOT NULL DEFAULT 0,
  completeness_before numeric(5,2),
  completeness_after  numeric(5,2),
  missing_fields      text[] NOT NULL DEFAULT '{}',
  fields_updated      text[] NOT NULL DEFAULT '{}',
  field_last_refreshed jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_after         timestamptz,
  last_error          text,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_aes_status  ON public.alexandria_enrichment_state (status);
CREATE INDEX IF NOT EXISTS idx_aes_run     ON public.alexandria_enrichment_state (last_run_id);
CREATE INDEX IF NOT EXISTS idx_aes_retry   ON public.alexandria_enrichment_state (retry_after) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_aes_success ON public.alexandria_enrichment_state (last_success_at);

-- ---------------------------------------------------------------------------
-- 4. Credit ledger (one row per Alexandria request id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alexandria_credit_ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       text NOT NULL,
  run_id           text NOT NULL,
  batch_id         uuid,
  entity_type      text,
  entity_id        text,
  provider         text NOT NULL,
  capability       text NOT NULL,
  credits_estimated numeric(10,2) NOT NULL DEFAULT 0,
  credits_actual   numeric(10,2),
  status           text NOT NULL
                   CHECK (status IN ('reserved','charged','no_charge','failed','unknown','cache_hit','blocked_terms')),
  error_code       text,
  scrape_id        text,
  attempt_count    integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_acl_request_id ON public.alexandria_credit_ledger (request_id);
CREATE INDEX IF NOT EXISTS idx_acl_run      ON public.alexandria_credit_ledger (run_id);
CREATE INDEX IF NOT EXISTS idx_acl_provider ON public.alexandria_credit_ledger (provider, capability);
CREATE INDEX IF NOT EXISTS idx_acl_created  ON public.alexandria_credit_ledger (created_at);
CREATE INDEX IF NOT EXISTS idx_acl_entity   ON public.alexandria_credit_ledger (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- 5. Provider response cache (contains personal data; service role only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alexandria_provider_cache (
  cache_key    text PRIMARY KEY,
  provider     text NOT NULL,
  capability   text NOT NULL,
  response     jsonb NOT NULL,
  credits_cost numeric(10,2) NOT NULL DEFAULT 0,
  request_id   text,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_apc_expires ON public.alexandria_provider_cache (expires_at);

-- ---------------------------------------------------------------------------
-- 6. Change log: exact before/after for every applied write; enables rollback
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alexandria_enrichment_changes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         uuid NOT NULL,
  run_id           text NOT NULL,
  entity_type      text NOT NULL CHECK (entity_type IN ('firm','investor','company','founder','operator')),
  entity_id        text NOT NULL,
  table_name       text NOT NULL,
  column_name      text,
  op               text NOT NULL CHECK (op IN ('update','insert_row')),
  row_id           text,
  before_value     jsonb,
  after_value      jsonb,
  provider         text,
  capability       text,
  confidence_label text CHECK (confidence_label IS NULL OR confidence_label IN ('high','medium','low')),
  confidence_score numeric(3,2),
  applied_at       timestamptz NOT NULL DEFAULT now(),
  rolled_back_at   timestamptz,
  rolled_back_by   text
);

CREATE INDEX IF NOT EXISTS idx_aec_batch  ON public.alexandria_enrichment_changes (batch_id);
CREATE INDEX IF NOT EXISTS idx_aec_run    ON public.alexandria_enrichment_changes (run_id);
CREATE INDEX IF NOT EXISTS idx_aec_entity ON public.alexandria_enrichment_changes (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_aec_active ON public.alexandria_enrichment_changes (batch_id) WHERE rolled_back_at IS NULL;

-- ---------------------------------------------------------------------------
-- 7. RLS: service role only. Admin reads go through the admin-enrichment-report
--    edge function, which strips raw payloads and private contact values.
-- ---------------------------------------------------------------------------
ALTER TABLE public.alexandria_enrichment_state   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alexandria_credit_ledger      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alexandria_provider_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alexandria_enrichment_changes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access" ON public.alexandria_enrichment_state
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access" ON public.alexandria_credit_ledger
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access" ON public.alexandria_provider_cache
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access" ON public.alexandria_enrichment_changes
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Review-queue entity kind for ambiguous Alexandria identity matches.
ALTER TYPE public.review_entity_type ADD VALUE IF NOT EXISTS 'alexandria_identity_match';

-- ---------------------------------------------------------------------------
-- 8. Aggregated admin report. Returns counts, distributions and credit totals only:
--    no raw provider payloads, no contact values, no free-text field values.
--    Callable by the service role (CLI, admin-enrichment-report edge function) only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alexandria_enrichment_report(p_since timestamptz DEFAULT (now() - interval '30 days'))
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'generated_at', now(),
    'since', p_since,
    'by_entity', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT entity_type,
               count(*)                                              AS records_tracked,
               count(*) FILTER (WHERE status = 'enriched')           AS enriched,
               count(*) FILTER (WHERE status = 'unchanged')          AS unchanged,
               count(*) FILTER (WHERE status = 'no_match')           AS no_match,
               count(*) FILTER (WHERE status = 'ambiguous')          AS ambiguous,
               count(*) FILTER (WHERE status = 'failed')             AS failed,
               count(*) FILTER (WHERE status = 'skipped')            AS skipped,
               count(*) FILTER (WHERE status = 'budget_stopped')     AS budget_stopped,
               count(*) FILTER (WHERE status IN ('failed','budget_stopped') AND (retry_after IS NULL OR retry_after <= now())) AS retry_eligible,
               round(avg(completeness_before)::numeric, 1)           AS avg_completeness_before,
               round(avg(completeness_after)::numeric, 1)            AS avg_completeness_after,
               max(last_success_at)                                  AS last_success_at
        FROM public.alexandria_enrichment_state
        GROUP BY entity_type ORDER BY entity_type
      ) t), '[]'::jsonb),
    'fields_updated', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT entity_type, field_name, count(*) AS updates
        FROM public.enrichment_field_provenance
        WHERE source_platform LIKE 'alexandria:%' AND auto_applied AND scraped_at >= p_since
        GROUP BY entity_type, field_name ORDER BY count(*) DESC LIMIT 60
      ) t), '[]'::jsonb),
    'confidence_distribution', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT COALESCE(confidence_label, 'unlabelled') AS confidence,
               CASE WHEN auto_applied THEN 'applied' WHEN reviewer_required THEN 'queued_for_review' ELSE 'recorded' END AS outcome,
               count(*) AS fields
        FROM public.enrichment_field_provenance
        WHERE source_platform LIKE 'alexandria:%' AND scraped_at >= p_since
        GROUP BY 1, 2 ORDER BY 1, 2
      ) t), '[]'::jsonb),
    'provider_performance', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT provider, capability,
               count(*) FILTER (WHERE auto_applied)         AS fields_applied,
               count(*) FILTER (WHERE reviewer_required)    AS fields_queued_for_review,
               round(avg(confidence_score)::numeric, 2)     AS avg_confidence
        FROM public.enrichment_field_provenance
        WHERE source_platform LIKE 'alexandria:%' AND provider IS NOT NULL AND scraped_at >= p_since
        GROUP BY provider, capability ORDER BY provider, capability
      ) t), '[]'::jsonb),
    'credits', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT provider, capability,
               count(*) FILTER (WHERE status IN ('charged','unknown','no_charge','failed')) AS calls,
               count(*) FILTER (WHERE status = 'cache_hit')                                  AS cache_hits,
               count(*) FILTER (WHERE status IN ('failed','unknown'))                        AS failures,
               COALESCE(sum(credits_estimated) FILTER (WHERE status <> 'cache_hit'), 0)      AS credits_estimated,
               COALESCE(sum(credits_actual), 0)                                              AS credits_actual
        FROM public.alexandria_credit_ledger
        WHERE created_at >= p_since
        GROUP BY provider, capability ORDER BY provider, capability
      ) t), '[]'::jsonb),
    'credits_by_entity', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT COALESCE(entity_type, 'n/a') AS entity_type, COALESCE(sum(credits_actual), 0) AS credits_actual
        FROM public.alexandria_credit_ledger WHERE created_at >= p_since
        GROUP BY 1 ORDER BY 1
      ) t), '[]'::jsonb),
    'credits_by_run', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT run_id, COALESCE(sum(credits_actual), 0) AS credits_actual, max(created_at) AS last_call_at
        FROM public.alexandria_credit_ledger WHERE created_at >= p_since
        GROUP BY run_id ORDER BY max(created_at) DESC LIMIT 20
      ) t), '[]'::jsonb),
    'review', jsonb_build_object(
      'pending_candidate_values', (SELECT count(*) FROM public.enrichment_candidate_values WHERE status = 'pending' AND run_id IS NOT NULL),
      'pending_identity_reviews', (SELECT count(*) FROM public.enrichment_review_queue WHERE entity_type::text = 'alexandria_identity_match' AND status::text = 'pending'),
      'match_failures', (SELECT count(*) FROM public.enrichment_match_failures WHERE source_platform LIKE 'alexandria:%' AND created_at >= p_since)
    ),
    'runs', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT run_id, mode, status, started_at, finished_at, fields_updated, fields_queued_review, errors
        FROM public.enrichment_scrape_runs WHERE 'alexandria' = ANY(sources)
        ORDER BY started_at DESC LIMIT 20
      ) t), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.alexandria_enrichment_report(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alexandria_enrichment_report(timestamptz) TO service_role;
