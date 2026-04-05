-- =============================================================================
-- Vyta KB — Search Helper Functions
-- =============================================================================
-- SQL functions used by the retrieval service for full-text and vector search.
-- These are called via supabase.rpc() from the edge functions.
--
-- SAFETY: These functions only READ from kb_* tables and kb_documents.
-- They do not modify any existing tables.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- kb_populate_tsvector: Update tsvector column for all chunks of a document
-- Called after document ingestion to populate full-text search vectors.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kb_populate_tsvector(p_document_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE kb_document_chunks
  SET content_tsv = to_tsvector('english', content)
  WHERE document_id = p_document_id
    AND content_tsv IS NULL;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- kb_search_chunks_fts: Full-text search over document chunks
-- Uses GIN-indexed tsvector for efficient text matching.
-- Optionally filters by entity via the parent document's related_entity fields.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kb_search_chunks_fts(
  p_query text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  content text,
  chunk_index integer,
  document_id uuid,
  document_title text,
  related_entity_type text,
  related_entity_id uuid,
  rank real,
  metadata jsonb,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.content,
    c.chunk_index,
    c.document_id,
    d.title AS document_title,
    d.related_entity_type,
    d.related_entity_id,
    ts_rank(c.content_tsv, to_tsquery('english', p_query)) AS rank,
    c.metadata,
    c.created_at
  FROM kb_document_chunks c
  JOIN kb_documents d ON d.id = c.document_id
  WHERE
    c.content_tsv @@ to_tsquery('english', p_query)
    AND (p_entity_type IS NULL OR d.related_entity_type = p_entity_type)
    AND (p_entity_id IS NULL OR d.related_entity_id = p_entity_id)
  ORDER BY rank DESC, c.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- kb_search_chunks_vector: Vector similarity search over document chunks
-- Uses HNSW-indexed embedding column with cosine distance.
-- Returns chunks ordered by similarity, filtered by threshold.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kb_search_chunks_vector(
  p_embedding text,                    -- JSON-stringified float array
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_similarity_threshold real DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  content text,
  chunk_index integer,
  document_id uuid,
  document_title text,
  related_entity_type text,
  related_entity_id uuid,
  similarity real,
  metadata jsonb,
  created_at timestamptz
) AS $$
DECLARE
  query_embedding vector(1536);
BEGIN
  -- Parse the JSON string into a vector
  query_embedding := p_embedding::vector(1536);

  RETURN QUERY
  SELECT
    c.id,
    c.content,
    c.chunk_index,
    c.document_id,
    d.title AS document_title,
    d.related_entity_type,
    d.related_entity_id,
    (1 - (c.embedding <=> query_embedding))::real AS similarity,
    c.metadata,
    c.created_at
  FROM kb_document_chunks c
  JOIN kb_documents d ON d.id = c.document_id
  WHERE
    c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) >= p_similarity_threshold
    AND (p_entity_type IS NULL OR d.related_entity_type = p_entity_type)
    AND (p_entity_id IS NULL OR d.related_entity_id = p_entity_id)
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
