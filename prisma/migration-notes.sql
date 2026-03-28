-- Run AFTER `prisma migrate dev` (or apply as a follow-up migration).
-- Adjust table/column names if Prisma emits different casing (should match @@map names).

-- ── Partial indexes: active rows only (soft delete) ─────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vc_firms_slug_active
  ON vc_firms (slug) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vc_funds_firm_active
  ON vc_funds (firm_id) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vc_investments_firm_date
  ON vc_investments (firm_id, investment_date DESC) WHERE deleted_at IS NULL;

-- ── GIN: array & filter-heavy columns ────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vc_funds_geography_gin
  ON vc_funds USING GIN (geography_focus);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vc_funds_themes_gin
  ON vc_funds USING GIN (themes);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vc_funds_stage_focus_gin
  ON vc_funds USING GIN (stage_focus);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vc_funds_sector_focus_gin
  ON vc_funds USING GIN (sector_focus);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vc_people_stage_focus_gin
  ON vc_people USING GIN (stage_focus);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vc_people_sector_focus_gin
  ON vc_people USING GIN (sector_focus);

-- ── Optional: pgvector (separate table or add column via Prisma Unsupported) ─
-- CREATE EXTENSION IF NOT EXISTS vector;
-- CREATE TABLE vc_entity_embeddings (... embedding vector(1536) ...);
