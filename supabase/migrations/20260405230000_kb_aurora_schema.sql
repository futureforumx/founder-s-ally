-- =============================================================================
-- Vyta Knowledge Base & Agent Backend Schema
-- =============================================================================
-- This migration creates the kb_* table family for the Vyta knowledge base,
-- agent context assembly, and action dispatcher layers.
--
-- SAFETY:
--   - No existing tables are modified.
--   - No existing RLS policies are changed.
--   - All new tables are prefixed with kb_ to isolate from current schema.
--   - Existing canonical tables (investor_database, company_analyses, profiles,
--     etc.) remain the source of truth. kb_* tables reference them via
--     entity_type + entity_id polymorphic links.
--
-- REQUIRES: pgvector extension (for vector(1536) columns and HNSW indexes)
-- =============================================================================

-- Ensure pgvector is available
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- 1. kb_notes — user notes, meeting notes, agent-generated notes
-- =============================================================================
CREATE TABLE IF NOT EXISTS kb_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id uuid,
  title text,
  body text NOT NULL,
  note_type text,          -- e.g. 'meeting', 'quick', 'research', 'agent_generated'
  source_type text,        -- e.g. 'manual', 'import', 'agent', 'api'
  source_ref text,         -- external reference identifier
  related_entity_type text,-- e.g. 'investor', 'company', 'profile'
  related_entity_id uuid,
  created_by_agent boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_notes_entity ON kb_notes (related_entity_type, related_entity_id)
  WHERE related_entity_type IS NOT NULL;
CREATE INDEX idx_kb_notes_user ON kb_notes (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_kb_notes_workspace ON kb_notes (workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX idx_kb_notes_created_at ON kb_notes (created_at DESC);
CREATE INDEX idx_kb_notes_note_type ON kb_notes (note_type) WHERE note_type IS NOT NULL;

-- =============================================================================
-- 2. kb_documents — uploaded docs, scraped pages, memos, transcripts
-- =============================================================================
CREATE TABLE IF NOT EXISTS kb_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id uuid,
  title text NOT NULL,
  document_type text,      -- e.g. 'memo', 'transcript', 'scraped_page', 'upload'
  mime_type text,
  storage_path text,       -- Supabase Storage path or external URL
  raw_text text,           -- full extracted text (nullable for binary-only docs)
  source_type text,        -- e.g. 'upload', 'scrape', 'import', 'api'
  source_ref text,
  related_entity_type text,
  related_entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_documents_entity ON kb_documents (related_entity_type, related_entity_id)
  WHERE related_entity_type IS NOT NULL;
CREATE INDEX idx_kb_documents_user ON kb_documents (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_kb_documents_created_at ON kb_documents (created_at DESC);
CREATE INDEX idx_kb_documents_type ON kb_documents (document_type) WHERE document_type IS NOT NULL;

-- =============================================================================
-- 3. kb_document_chunks — retrieval chunks with embeddings and tsvector
-- =============================================================================
CREATE TABLE IF NOT EXISTS kb_document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  content_tsv tsvector,                    -- full-text search vector
  embedding vector(1536),                  -- OpenAI text-embedding-3-small dimension
  token_count integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_chunks_document ON kb_document_chunks (document_id);
CREATE INDEX idx_kb_chunks_created_at ON kb_document_chunks (created_at DESC);

-- Full-text search GIN index
CREATE INDEX idx_kb_chunks_tsv ON kb_document_chunks USING gin(content_tsv);

-- HNSW vector similarity index (cosine distance)
-- Uses HNSW per project preference — NOT ivfflat.
-- m=16, ef_construction=64 are conservative defaults suitable for <1M rows.
CREATE INDEX idx_kb_chunks_embedding ON kb_document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- 4. kb_entity_links — polymorphic links from kb artifacts to canonical entities
-- =============================================================================
-- This is the core join table that connects notes, documents, chunks, cards,
-- and actions to canonical entities (investor_database, company_analyses,
-- profiles, etc.) WITHOUT duplicating entity data.
CREATE TABLE IF NOT EXISTS kb_entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,   -- e.g. 'kb_notes', 'kb_documents', 'kb_document_chunks'
  source_id uuid NOT NULL,
  entity_type text NOT NULL,    -- e.g. 'investor', 'company', 'profile'
  entity_id uuid NOT NULL,
  relationship_type text,       -- e.g. 'about', 'mentions', 'authored_by', 'tagged'
  confidence numeric(5,4),      -- 0.0000 to 9.9999, nullable for manual links
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_entity_links_source ON kb_entity_links (source_table, source_id);
CREATE INDEX idx_kb_entity_links_entity ON kb_entity_links (entity_type, entity_id);
CREATE UNIQUE INDEX idx_kb_entity_links_unique ON kb_entity_links (source_table, source_id, entity_type, entity_id);

-- =============================================================================
-- 5. kb_summary_cards — concise derived memory/context cards per entity
-- =============================================================================
CREATE TABLE IF NOT EXISTS kb_summary_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  card_type text NOT NULL,     -- e.g. 'overview', 'risk', 'relationship', 'timeline'
  title text NOT NULL,
  summary text NOT NULL,
  source_table text,           -- which kb table sourced this card
  source_id uuid,
  confidence numeric(5,4),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_summary_cards_entity ON kb_summary_cards (entity_type, entity_id);
CREATE INDEX idx_kb_summary_cards_type ON kb_summary_cards (card_type);
CREATE INDEX idx_kb_summary_cards_created_at ON kb_summary_cards (created_at DESC);

-- =============================================================================
-- 6. kb_action_logs — audit trail for all agent/backend-triggered actions
-- =============================================================================
CREATE TABLE IF NOT EXISTS kb_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  workspace_id uuid,
  agent_name text,             -- e.g. 'vyta', 'enrichment_bot'
  action_type text NOT NULL,   -- e.g. 'hubspot_create_contact', 'send_email', 'zapier_trigger'
  target_provider text,        -- e.g. 'zapier', 'hubspot', 'notion', 'slack'
  status text NOT NULL,        -- 'pending', 'running', 'success', 'failed', 'preview'
  preview_only boolean NOT NULL DEFAULT false,
  related_entity_type text,
  related_entity_id uuid,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_action_logs_user ON kb_action_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_kb_action_logs_status ON kb_action_logs (status);
CREATE INDEX idx_kb_action_logs_entity ON kb_action_logs (related_entity_type, related_entity_id)
  WHERE related_entity_type IS NOT NULL;
CREATE INDEX idx_kb_action_logs_created_at ON kb_action_logs (created_at DESC);
CREATE INDEX idx_kb_action_logs_provider ON kb_action_logs (target_provider) WHERE target_provider IS NOT NULL;

-- =============================================================================
-- 7. kb_external_accounts — connected external accounts for syncs/actions
-- =============================================================================
CREATE TABLE IF NOT EXISTS kb_external_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,         -- e.g. 'hubspot', 'notion', 'zapier', 'slack'
  account_label text,
  external_account_id text,
  auth_status text NOT NULL DEFAULT 'pending',  -- 'pending', 'active', 'revoked', 'expired'
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_ext_accounts_user ON kb_external_accounts (user_id);
CREATE INDEX idx_kb_ext_accounts_provider ON kb_external_accounts (provider);
CREATE UNIQUE INDEX idx_kb_ext_accounts_unique ON kb_external_accounts (user_id, provider, external_account_id);

-- =============================================================================
-- 8. kb_external_object_links — map entities/artifacts to external objects
-- =============================================================================
CREATE TABLE IF NOT EXISTS kb_external_object_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,            -- e.g. 'hubspot', 'notion', 'google_drive'
  entity_type text NOT NULL,         -- canonical entity type
  entity_id uuid NOT NULL,
  external_object_type text,         -- e.g. 'contact', 'page', 'deal'
  external_object_id text NOT NULL,
  external_url text,
  sync_status text,                  -- 'synced', 'pending', 'error', 'stale'
  last_synced_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_ext_obj_links_entity ON kb_external_object_links (entity_type, entity_id);
CREATE INDEX idx_kb_ext_obj_links_provider ON kb_external_object_links (provider, external_object_id);
CREATE INDEX idx_kb_ext_obj_links_sync ON kb_external_object_links (sync_status)
  WHERE sync_status IS NOT NULL;

-- =============================================================================
-- 9. kb_sync_jobs — high-level sync job tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS kb_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,          -- e.g. 'hubspot_full_sync', 'notion_import', 'enrichment'
  provider text,
  status text NOT NULL,            -- 'pending', 'running', 'completed', 'failed', 'cancelled'
  initiated_by_user_id uuid,
  related_entity_type text,
  related_entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_sync_jobs_status ON kb_sync_jobs (status);
CREATE INDEX idx_kb_sync_jobs_provider ON kb_sync_jobs (provider) WHERE provider IS NOT NULL;
CREATE INDEX idx_kb_sync_jobs_created_at ON kb_sync_jobs (created_at DESC);

-- =============================================================================
-- 10. kb_sync_job_runs — individual sync run attempts
-- =============================================================================
CREATE TABLE IF NOT EXISTS kb_sync_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_job_id uuid NOT NULL REFERENCES kb_sync_jobs(id) ON DELETE CASCADE,
  status text NOT NULL,            -- 'running', 'success', 'failed'
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_sync_job_runs_job ON kb_sync_job_runs (sync_job_id);
CREATE INDEX idx_kb_sync_job_runs_status ON kb_sync_job_runs (status);

-- =============================================================================
-- 11. kb_saved_queries — reusable retrieval queries
-- =============================================================================
CREATE TABLE IF NOT EXISTS kb_saved_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  workspace_id uuid,
  name text NOT NULL,
  query_text text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_saved_queries_user ON kb_saved_queries (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_kb_saved_queries_workspace ON kb_saved_queries (workspace_id) WHERE workspace_id IS NOT NULL;

-- =============================================================================
-- Row Level Security — enable on all kb_* tables
-- Policies are intentionally permissive for service-role access.
-- Fine-grained user-scoped policies should be added before UI integration.
-- =============================================================================
ALTER TABLE kb_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_entity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_summary_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_external_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_external_object_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_sync_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_saved_queries ENABLE ROW LEVEL SECURITY;

-- Service-role bypass policies (edge functions use service role key)
-- These allow full access when using the service_role key.
-- User-scoped policies for anon/authenticated roles should be added
-- before any UI integration.
CREATE POLICY "Service role full access" ON kb_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON kb_documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON kb_document_chunks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON kb_entity_links FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON kb_summary_cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON kb_action_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON kb_external_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON kb_external_object_links FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON kb_sync_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON kb_sync_job_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON kb_saved_queries FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- Helper function: auto-update updated_at timestamp
-- =============================================================================
CREATE OR REPLACE FUNCTION kb_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to tables that have the column
CREATE TRIGGER trg_kb_notes_updated_at BEFORE UPDATE ON kb_notes
  FOR EACH ROW EXECUTE FUNCTION kb_set_updated_at();
CREATE TRIGGER trg_kb_documents_updated_at BEFORE UPDATE ON kb_documents
  FOR EACH ROW EXECUTE FUNCTION kb_set_updated_at();
CREATE TRIGGER trg_kb_summary_cards_updated_at BEFORE UPDATE ON kb_summary_cards
  FOR EACH ROW EXECUTE FUNCTION kb_set_updated_at();
CREATE TRIGGER trg_kb_external_accounts_updated_at BEFORE UPDATE ON kb_external_accounts
  FOR EACH ROW EXECUTE FUNCTION kb_set_updated_at();
CREATE TRIGGER trg_kb_external_object_links_updated_at BEFORE UPDATE ON kb_external_object_links
  FOR EACH ROW EXECUTE FUNCTION kb_set_updated_at();
CREATE TRIGGER trg_kb_sync_jobs_updated_at BEFORE UPDATE ON kb_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION kb_set_updated_at();
CREATE TRIGGER trg_kb_saved_queries_updated_at BEFORE UPDATE ON kb_saved_queries
  FOR EACH ROW EXECUTE FUNCTION kb_set_updated_at();

-- =============================================================================
-- Done. All kb_* tables created with indexes, RLS, and triggers.
-- No existing tables were modified.
-- =============================================================================
