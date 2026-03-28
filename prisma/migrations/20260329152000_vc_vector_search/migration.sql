-- Enable pgvector for semantic search
-- NOTE: requires the pgvector extension to be allowed in your Supabase project
-- (Dashboard → Database → Extensions → vector)
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- thesis_embedding
-- Stores the Gemini text-embedding-004 (768-dim) embedding of each firm's
-- investment thesis / elevator_pitch for cosine / inner-product similarity.
-- Managed outside Prisma (Unsupported type) — written by the AI enrichment
-- worker, not by the Prisma client.
-- ---------------------------------------------------------------------------
ALTER TABLE "vc_firms"
  ADD COLUMN IF NOT EXISTS "thesis_embedding" vector(768);

-- HNSW index — inner-product ops for normalised embeddings (fastest path for
-- cosine similarity when vectors are L2-normalised before insert, which
-- text-embedding-004 vectors are).
CREATE INDEX IF NOT EXISTS "vc_firms_thesis_embedding_hnsw_idx"
  ON "vc_firms" USING hnsw ("thesis_embedding" vector_ip_ops);

-- ---------------------------------------------------------------------------
-- Freshness & decay fields
-- volatility_score  1 = mega-fund (slow decay), 2 = mid, 3 = micro (fast)
-- last_verified_at  last time a human or automated job confirmed data quality
-- next_update_scheduled_at  computed by the enrichment scheduler
-- ---------------------------------------------------------------------------
ALTER TABLE "vc_firms"
  ADD COLUMN IF NOT EXISTS "volatility_score"          INTEGER   NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "last_verified_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "next_update_scheduled_at"  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days');

-- Index so the enrichment worker can efficiently page through stale rows
CREATE INDEX IF NOT EXISTS "vc_firms_next_update_scheduled_at_idx"
  ON "vc_firms" ("next_update_scheduled_at");
