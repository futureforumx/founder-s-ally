-- =============================================================================
-- Migration: disk_io_remediation
-- Created:   2026-04-03
-- Purpose:   Reduce Disk IO budget consumption on the vekta project.
--
-- WHAT THIS MIGRATION DOES
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drops 14 confirmed-unused indexes (0 scans since DB creation).
--    Every dropped index reduces write overhead on INSERT/UPDATE.
-- 2. Enables pg_trgm and adds trigram indexes for ILIKE text search.
-- 3. Adds a partial index on updated_at for enrichment queue ordering.
-- 4. Tunes autovacuum on the three highest-write tables.
--
-- WHAT THIS MIGRATION DOES NOT DO (do these manually — see notes below)
-- ─────────────────────────────────────────────────────────────────────────────
-- • VACUUM ANALYZE — must be run outside a transaction; see "Manual Steps" below.
-- • DROP INDEX on source_records_pkey / match_decisions_pkey — excluded because
--   a primary key showing 0 idx_scan can mean the table is unused or the stat
--   hasn't been captured yet. Verify before dropping. See note [A] below.
--
-- SAFETY
-- ─────────────────────────────────────────────────────────────────────────────
-- • All DROP INDEX statements use CONCURRENTLY — zero table lock, safe on live DB.
-- • All CREATE INDEX statements use CONCURRENTLY — zero table lock.
-- • All DROP INDEX use IF EXISTS — migration is idempotent / safe to re-run.
-- • autovacuum tuning uses storage parameters, not global pg settings — applies
--   only to the named table, has no effect on other tables.
--
-- NOTE: CONCURRENTLY cannot run inside a transaction block.
-- Supabase's apply_migration wraps in a transaction, so CONCURRENTLY is removed
-- from the statements below. If you run this manually via psql, add CONCURRENTLY
-- back to all DROP INDEX and CREATE INDEX statements for zero-downtime execution.
-- =============================================================================


-- =============================================================================
-- SECTION 1: DROP UNUSED INDEXES
-- =============================================================================
-- Confirmed 0 idx_scan since project creation (2026-03-22, 12 days of traffic).
-- Each of these is actively maintained on every INSERT/UPDATE to its table.
-- Dropping them immediately reduces write amplification.

-- ── firm_investors (53,178 updates recorded — these are expensive to maintain) ──

-- Dead: GIN index on past_investments ARRAY — 1,080 kB, never queried
DROP INDEX IF EXISTS public.idx_firm_investors_past_investments;

-- Dead: GIN index on co_investors ARRAY — 1,048 kB, never queried
DROP INDEX IF EXISTS public.idx_firm_investors_co_investors;

-- Dead: GIN index on networks ARRAY — 1,040 kB, never queried
DROP INDEX IF EXISTS public.idx_firm_investors_networks;

-- Dead: Unique index on prisma_person_id — 800 kB, never queried (duplicate of below)
DROP INDEX IF EXISTS public.investor_partners_prisma_person_id_key;

-- Dead: B-tree index on prisma_person_id — 800 kB, never queried
DROP INDEX IF EXISTS public.idx_firm_investors_prisma_person_id;

-- Dead: Partial index on needs_review — 16 kB, never queried
DROP INDEX IF EXISTS public.idx_firm_investors_needs_review;


-- ── firm_records (35,039 updates + 41,924 inserts recorded) ──

-- Dead: IVFFlat vector index on sector_embedding — 808 kB, never queried.
-- NOTE: If you later activate vector similarity search, recreate this as:
--   CREATE INDEX idx_firm_records_sector_embedding ON firm_records
--     USING ivfflat (sector_embedding vector_cosine_ops) WITH (lists = 100)
--     WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS public.idx_investor_sector_embedding;

-- Dead: Unique index on firm_name (case-sensitive) — 1,200 kB, never queried
-- The lowercase variant in SUPABASE_CLEANUP_PLAN.md replaces this intent.
DROP INDEX IF EXISTS public.idx_firm_records_unique_firm_name;

-- Dead: Unique index on prisma_firm_id — 368 kB (duplicate of below)
DROP INDEX IF EXISTS public.investor_database_prisma_firm_id_key;

-- Dead: B-tree index on prisma_firm_id — 368 kB, never queried
DROP INDEX IF EXISTS public.idx_firm_records_prisma_firm_id;

-- Dead: B-tree index on thesis_orientation enum — 280 kB, never queried
DROP INDEX IF EXISTS public.idx_firm_records_thesis_orientation;

-- Dead: B-tree index on hq_zip_code — 272 kB, never queried
DROP INDEX IF EXISTS public.idx_firm_records_hq_zip_code;

-- Dead: GIN index on stage_focus ARRAY — 312 kB, never queried
DROP INDEX IF EXISTS public.idx_firm_records_stage_focus;


-- ── people (33,776 updates recorded) ──

-- Dead: B-tree index on canonicalName — 600 kB, never queried
-- People lookups use dedupeKey, ycId, or primary key — not name text search.
DROP INDEX IF EXISTS public.idx_people_name;


-- ── organizations (11,243 updates recorded) ──

-- Dead: B-tree index on canonicalName — 312 kB, never queried
DROP INDEX IF EXISTS public.idx_orgs_name;

-- Dead: Unique index on domain — 312 kB, never queried
-- NOTE [B]: If domain-based deduplication is used in any import script, verify
-- before dropping. No app-layer query was found touching this index.
DROP INDEX IF EXISTS public.organizations_domain_key;

-- Dead: Unique index on ycId — 248 kB, never queried
DROP INDEX IF EXISTS public.organizations_ycId_key;


-- =============================================================================
-- SECTION 2: ENABLE pg_trgm AND ADD TRIGRAM SEARCH INDEXES
-- =============================================================================
-- Required by ReviewSubmissionModal.tsx which issues ILIKE '%term%' against
-- firm_name, legal_name, and website_url. Without these, every review submission
-- causes a full sequential scan of firm_records (17,980 rows).
--
-- After these indexes exist, Postgres automatically uses them for any
-- ILIKE '%term%' or ILIKE 'term%' pattern on these columns. No code change needed.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index on firm_name (used by ReviewSubmissionModal and InvestorDetailPanel)
CREATE INDEX IF NOT EXISTS idx_firm_records_firm_name_trgm
  ON public.firm_records USING gin (firm_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Trigram index on website_url (used by ReviewSubmissionModal ILIKE '%host%')
CREATE INDEX IF NOT EXISTS idx_firm_records_website_url_trgm
  ON public.firm_records USING gin (website_url gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Trigram index on legal_name (used by ReviewSubmissionModal ILIKE on legal_name)
CREATE INDEX IF NOT EXISTS idx_firm_records_legal_name_trgm
  ON public.firm_records USING gin (legal_name gin_trgm_ops)
  WHERE deleted_at IS NULL AND legal_name IS NOT NULL;


-- =============================================================================
-- SECTION 3: ADD MISSING USEFUL INDEXES
-- =============================================================================

-- Partial index on updated_at for enrichment queue ordering.
-- The enrich-pipeline orders by last_enriched_at ASC NULLS FIRST, which
-- already has an index (idx_investor_database_last_enriched, 118 uses).
-- updated_at has no index and is used for general ordering in admin views.
CREATE INDEX IF NOT EXISTS idx_firm_records_updated_at
  ON public.firm_records (updated_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

-- Partial index on is_actively_deploying for directory filtering.
-- The investor directory commonly filters WHERE is_actively_deploying = true.
CREATE INDEX IF NOT EXISTS idx_firm_records_is_active_deploying
  ON public.firm_records (is_actively_deploying)
  WHERE deleted_at IS NULL AND is_actively_deploying = true;


-- =============================================================================
-- SECTION 4: AUTOVACUUM TUNING
-- =============================================================================
-- Default autovacuum triggers at 20% dead rows (autovacuum_vacuum_scale_factor).
-- At current write rates, firm_records and people accumulate dead rows faster
-- than the default threshold catches. Tightening the threshold makes autovacuum
-- run earlier and more frequently, preventing bloat from compounding.
--
-- These are table-storage parameters — they override the global setting only
-- for the named table and do not affect any other table.

ALTER TABLE public.firm_records SET (
  autovacuum_vacuum_scale_factor  = 0.02,   -- vacuum when 2% of rows are dead (was 20%)
  autovacuum_vacuum_threshold     = 50,      -- also vacuum if > 50 dead rows absolute
  autovacuum_analyze_scale_factor = 0.01    -- re-analyze stats after 1% row change
);

ALTER TABLE public.people SET (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_vacuum_threshold     = 50,
  autovacuum_analyze_scale_factor = 0.01
);

ALTER TABLE public.firm_investors SET (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_vacuum_threshold     = 100,    -- slightly higher threshold for large table
  autovacuum_analyze_scale_factor = 0.01
);

ALTER TABLE public.organizations SET (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_vacuum_threshold     = 50,
  autovacuum_analyze_scale_factor = 0.01
);


-- =============================================================================
-- NOTES
-- =============================================================================
--
-- [A] source_records_pkey and match_decisions_pkey show 0 idx_scan.
--     Primary keys with 0 scans typically mean the table is never queried
--     directly (data is bulk-inserted but never fetched by PK). Do NOT drop
--     primary keys without first confirming in the application layer that no
--     code references these tables. Excluded from this migration intentionally.
--
-- [B] organizations_domain_key: if import scripts use domain as a dedup key
--     (e.g., ON CONFLICT (domain)), dropping this unique constraint will break
--     those upserts. Verify with: SELECT indexdef FROM pg_indexes
--     WHERE indexname = 'organizations_domain_key'; before dropping.
--
-- MANUAL STEPS (run separately, not in this migration):
-- ─────────────────────────────────────────────────────────────────────────────
-- These cannot run inside a transaction. Execute them in the Supabase SQL
-- Editor immediately BEFORE running this migration:
--
--   VACUUM ANALYZE public.firm_records;
--   VACUUM ANALYZE public.people;
--   VACUUM ANALYZE public.organizations;
--   VACUUM ANALYZE public.firm_investors;
--   VACUUM ANALYZE public.enrich_social_state;
--   VACUUM ANALYZE public.operator_companies;
--
-- Then run this migration, then run VACUUM ANALYZE again on firm_records
-- to update planner statistics after the index drops.
-- =============================================================================
