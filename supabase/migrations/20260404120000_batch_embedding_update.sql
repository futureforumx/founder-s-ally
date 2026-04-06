-- =============================================================================
-- DISK IO REMEDIATION — VEKTA / SUPABASE
-- Verified against live schema on 2026-04-04.
-- Safe to paste directly into the Supabase SQL Editor.
-- Every statement is idempotent (IF EXISTS / IF NOT EXISTS throughout).
--
-- CONFIRMED TABLE EXISTENCE (via information_schema):
--   firm_records    ✓  17,963 rows  |  firm_investors  ✓  34,828 rows
--   people          ✓   9,286 rows  |  organizations   ✓   5,020 rows
--   enrich_social_state ✓ 1 row (600% dead-row ratio — 2,589 updates!)
--
-- CONFIRMED MISSING — SKIP ENTIRELY:
--   raw_intelligence_items  ✗   intelligence_events     ✗
--   intelligence_entities   ✗   intelligence_sources    ✗
--   intelligence_event_entities ✗
--
-- CONFIRMED ALREADY INSTALLED:
--   vector 0.8.0  |  pg_trgm 1.6
--   idx_firm_records_firm_name_trgm   ✓ (already exists)
--   idx_firm_records_website_url_trgm ✓ (already exists)
--   idx_firm_records_legal_name_trgm  ✓ (already exists)
--
-- NOTE: VACUUM ANALYZE cannot run inside a transaction. Run these separately
-- in the SQL Editor BEFORE this block:
--   VACUUM ANALYZE public.firm_records;
--   VACUUM ANALYZE public.firm_investors;
--   VACUUM ANALYZE public.people;
--   VACUUM ANALYZE public.organizations;
--   VACUUM ANALYZE public.enrich_social_state;
-- =============================================================================


-- =============================================================================
-- SECTION 1: DROP CONFIRMED-DEAD INDEXES
-- =============================================================================
-- These were verified present in the live DB and had 0 idx_scan since creation.
-- Dropping them reduces write overhead on every INSERT/UPDATE to these tables.
-- firm_investors has 53,209 updates recorded — every dropped index here matters.

-- ── firm_investors (GIN + btree dead indexes — expensive to maintain) ─────────

-- GIN on co_investors JSONB: ~1,048 kB, 0 scans
DROP INDEX IF EXISTS public.idx_firm_investors_co_investors;

-- GIN on networks ARRAY: ~1,040 kB, 0 scans
DROP INDEX IF EXISTS public.idx_firm_investors_networks;

-- GIN on past_investments JSONB: ~1,080 kB, 0 scans
DROP INDEX IF EXISTS public.idx_firm_investors_past_investments;

-- btree on prisma_person_id: ~800 kB, 0 scans
DROP INDEX IF EXISTS public.idx_firm_investors_prisma_person_id;

-- UNIQUE btree on prisma_person_id: ~800 kB, 0 scans (duplicate of above)
DROP INDEX IF EXISTS public.investor_partners_prisma_person_id_key;

-- Partial btree on needs_review: ~16 kB, 0 scans
DROP INDEX IF EXISTS public.idx_firm_investors_needs_review;

-- ── firm_records (35k+ updates — IVFFlat maintenance is the biggest offender) ──

-- IVFFlat vector index on sector_embedding: ~808 kB, 0 scans.
-- This is the most expensive index to maintain: every row update on firm_records
-- must re-cluster the vector into the IVFFlat index. With 37,393 updates and
-- 0 queries, this is pure write overhead. Drop immediately.
DROP INDEX IF EXISTS public.idx_investor_sector_embedding;

-- UNIQUE btree on prisma_firm_id: ~368 kB, 0 scans
DROP INDEX IF EXISTS public.investor_database_prisma_firm_id_key;

-- btree on prisma_firm_id: ~368 kB, 0 scans (non-unique duplicate of above)
DROP INDEX IF EXISTS public.idx_firm_records_prisma_firm_id;

-- btree on thesis_orientation enum: ~280 kB, 0 scans
DROP INDEX IF EXISTS public.idx_firm_records_thesis_orientation;

-- btree on hq_zip_code: ~272 kB, 0 scans
DROP INDEX IF EXISTS public.idx_firm_records_hq_zip_code;

-- GIN on stage_focus ARRAY: ~312 kB, 0 scans
DROP INDEX IF EXISTS public.idx_firm_records_stage_focus;


-- =============================================================================
-- SECTION 2: CREATE MISSING USEFUL INDEXES
-- =============================================================================
-- Extensions already confirmed installed — no-op safety calls only.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes already confirmed present — these are pure no-ops.
CREATE INDEX IF NOT EXISTS idx_firm_records_firm_name_trgm
  ON public.firm_records USING gin (firm_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_records_website_url_trgm
  ON public.firm_records USING gin (website_url gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_firm_records_legal_name_trgm
  ON public.firm_records USING gin (legal_name gin_trgm_ops)
  WHERE deleted_at IS NULL AND legal_name IS NOT NULL;

-- NEW: partial index on updated_at for admin view ordering (column confirmed present)
CREATE INDEX IF NOT EXISTS idx_firm_records_updated_at
  ON public.firm_records (updated_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

-- NEW: partial index for directory filter WHERE is_actively_deploying = true
CREATE INDEX IF NOT EXISTS idx_firm_records_is_active_deploying
  ON public.firm_records (is_actively_deploying)
  WHERE deleted_at IS NULL AND is_actively_deploying = true;

-- NEW: partial index for embedding backfill query (.is("sector_embedding", null))
-- Makes the generate-embeddings scan O(unembedded) instead of O(all 17,963 rows)
-- thesis_verticals confirmed present as ARRAY column; sector_embedding as vector
CREATE INDEX IF NOT EXISTS idx_firm_records_sector_embedding_null
  ON public.firm_records (id)
  WHERE sector_embedding IS NULL
    AND deleted_at IS NULL
    AND thesis_verticals IS NOT NULL;


-- =============================================================================
-- SECTION 3: batch_update_sector_embeddings RPC FUNCTION
-- =============================================================================
-- Called by the generate-embeddings Edge Function to collapse N per-row UPDATEs
-- (one per firm) into a single set-based UPDATE via:
--   supabase.rpc('batch_update_sector_embeddings', { updates: [...] })
--
-- Input: JSONB array of objects: [{"id": "<uuid>", "embedding": [0.1, 0.2, ...]}]
-- Returns: count of rows updated
--
-- vector(1536) confirmed present on firm_records.sector_embedding (USER-DEFINED type)
-- pgvector 0.8.0 confirmed installed

CREATE OR REPLACE FUNCTION public.batch_update_sector_embeddings(
  updates jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.firm_records AS fr
  SET
    sector_embedding = (
      -- Parse the JSON float array → text[] → float4[] → vector(1536)
      SELECT ARRAY(
        SELECT jsonb_array_elements_text(elem -> 'embedding')::float4
      )::vector(1536)
    ),
    updated_at = NOW()
  FROM jsonb_array_elements(updates) AS elem
  WHERE fr.id = (elem ->> 'id')::uuid
    AND fr.deleted_at IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Grant to both service_role (Edge Functions) and authenticated (direct RPC calls)
GRANT EXECUTE ON FUNCTION public.batch_update_sector_embeddings(jsonb)
  TO service_role, authenticated;


-- =============================================================================
-- SECTION 4: AUTOVACUUM TUNING
-- =============================================================================
-- Default threshold: 20% dead rows before autovacuum triggers.
-- people is at 12.4% dead, organizations at 7.0% — already past healthy limits.
-- enrich_social_state is at 600% dead (2,589 updates on 1 live row).
-- Tightening to 2% scale factor forces earlier, more frequent cleanup.
-- These are table-level storage overrides — no effect on any other table.

ALTER TABLE public.firm_records SET (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_vacuum_threshold     = 50,
  autovacuum_analyze_scale_factor = 0.01
);

ALTER TABLE public.firm_investors SET (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_vacuum_threshold     = 100,
  autovacuum_analyze_scale_factor = 0.01
);

ALTER TABLE public.people SET (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_vacuum_threshold     = 50,
  autovacuum_analyze_scale_factor = 0.01
);

ALTER TABLE public.organizations SET (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_vacuum_threshold     = 50,
  autovacuum_analyze_scale_factor = 0.01
);

-- enrich_social_state has 600% dead-row ratio (1 live row, 6+ dead, 2,589 updates).
-- Set an extremely tight threshold: vacuum after just 1 dead row.
ALTER TABLE public.enrich_social_state SET (
  autovacuum_vacuum_scale_factor  = 0.0,
  autovacuum_vacuum_threshold     = 1,
  autovacuum_analyze_scale_factor = 0.0,
  autovacuum_analyze_threshold    = 1
);
