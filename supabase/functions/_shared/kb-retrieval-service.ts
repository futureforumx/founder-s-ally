// =============================================================================
// Vyta KB — Retrieval Service (Hybrid Search)
// =============================================================================
// Implements hybrid retrieval combining:
//   1. Structured filters (entity type, date range, user/workspace scope)
//   2. Full-text search via tsvector (GIN-indexed)
//   3. Vector similarity via pgvector HNSW
//
// IMPORTANT: Reads canonical entity tables for profile data but never writes.
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type {
  SearchKnowledgeParams,
  SearchResult,
  EntityContext,
  EmbeddingProvider,
  KbNote,
  KbDocument,
  KbDocumentChunk,
  KbSummaryCard,
  KbActionLog,
  KbExternalObjectLink,
  KbEntityLink,
} from "./kb-types.ts";
import { getCanonicalTable } from "./kb-utils.ts";

// ---------------------------------------------------------------------------
// searchKnowledge — hybrid search across notes and document chunks
// ---------------------------------------------------------------------------
export async function searchKnowledge(
  supabase: SupabaseClient,
  params: SearchKnowledgeParams,
  embeddingProvider?: EmbeddingProvider,
): Promise<{ results: SearchResult[]; total: number }> {
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = params.offset ?? 0;
  const results: SearchResult[] = [];

  // Run text search on notes and chunks in parallel
  const [noteResults, chunkResults] = await Promise.all([
    searchNotes(supabase, params, limit, offset),
    searchChunks(supabase, params, limit, offset, embeddingProvider),
  ]);

  results.push(...noteResults, ...chunkResults);

  // Sort by score descending, then by recency
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Apply final limit
  const trimmed = results.slice(0, limit);

  return { results: trimmed, total: trimmed.length };
}

// ---------------------------------------------------------------------------
// searchNotes — full-text + structured search over kb_notes
// ---------------------------------------------------------------------------
async function searchNotes(
  supabase: SupabaseClient,
  params: SearchKnowledgeParams,
  limit: number,
  offset: number,
): Promise<SearchResult[]> {
  let query = supabase
    .from("kb_notes")
    .select("id, title, body, related_entity_type, related_entity_id, created_at, metadata")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Apply structured filters
  if (params.entityType) query = query.eq("related_entity_type", params.entityType);
  if (params.entityId) query = query.eq("related_entity_id", params.entityId);
  if (params.userId) query = query.eq("user_id", params.userId);
  if (params.workspaceId) query = query.eq("workspace_id", params.workspaceId);
  if (params.dateFrom) query = query.gte("created_at", params.dateFrom);
  if (params.dateTo) query = query.lte("created_at", params.dateTo);
  if (params.sourceTypes?.length) query = query.in("source_type", params.sourceTypes);

  // Text filter: use ilike for simple matching
  // TODO: For production, use a dedicated full-text search column on kb_notes
  if (params.query) {
    query = query.or(`title.ilike.%${params.query}%,body.ilike.%${params.query}%`);
  }

  const { data: notes, error } = await query;
  if (error) {
    console.error(`Note search error: ${error.message}`);
    return [];
  }

  return (notes ?? []).map((note: any) => ({
    id: note.id,
    sourceTable: "kb_notes",
    title: note.title,
    snippet: (note.body ?? "").slice(0, 300),
    entityType: note.related_entity_type,
    entityId: note.related_entity_id,
    score: params.query ? computeTextScore(params.query, `${note.title ?? ""} ${note.body}`) : 0.5,
    scoreType: "text" as const,
    createdAt: note.created_at,
    metadata: note.metadata ?? {},
  }));
}

// ---------------------------------------------------------------------------
// searchChunks — full-text (tsvector) + vector similarity on kb_document_chunks
// ---------------------------------------------------------------------------
async function searchChunks(
  supabase: SupabaseClient,
  params: SearchKnowledgeParams,
  limit: number,
  offset: number,
  embeddingProvider?: EmbeddingProvider,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // --- Full-text search via tsvector ---
  if (params.query) {
    // Convert query to tsquery format (simple: join words with &)
    const tsquery = params.query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .join(" & ");

    // Use RPC for tsvector search since the JS client doesn't support @@ natively
    // Fall back to ilike if RPC is unavailable
    try {
      const { data: ftsResults, error: ftsError } = await supabase.rpc(
        "kb_search_chunks_fts",
        {
          p_query: tsquery,
          p_entity_type: params.entityType ?? null,
          p_entity_id: params.entityId ?? null,
          p_limit: limit,
          p_offset: offset,
        },
      );

      if (!ftsError && ftsResults) {
        for (const row of ftsResults) {
          results.push({
            id: row.id,
            sourceTable: "kb_document_chunks",
            title: row.document_title ?? null,
            snippet: (row.content ?? "").slice(0, 300),
            entityType: row.related_entity_type ?? null,
            entityId: row.related_entity_id ?? null,
            score: row.rank ?? 0.5,
            scoreType: "text",
            createdAt: row.created_at,
            metadata: row.metadata ?? {},
          });
        }
      }
    } catch {
      // RPC not available — fall back to ilike
      const { data: chunks, error } = await supabase
        .from("kb_document_chunks")
        .select("id, content, document_id, chunk_index, metadata, created_at")
        .ilike("content", `%${params.query}%`)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (!error && chunks) {
        for (const chunk of chunks) {
          results.push({
            id: chunk.id,
            sourceTable: "kb_document_chunks",
            title: null,
            snippet: (chunk.content ?? "").slice(0, 300),
            entityType: null,
            entityId: null,
            score: computeTextScore(params.query, chunk.content),
            scoreType: "text",
            createdAt: chunk.created_at,
            metadata: chunk.metadata ?? {},
          });
        }
      }
    }
  }

  // --- Vector similarity search ---
  if (params.semantic && params.query && embeddingProvider) {
    try {
      const queryEmbedding = await embeddingProvider.embed(params.query);

      // Use RPC for vector similarity search
      const { data: vecResults, error: vecError } = await supabase.rpc(
        "kb_search_chunks_vector",
        {
          p_embedding: JSON.stringify(queryEmbedding),
          p_entity_type: params.entityType ?? null,
          p_entity_id: params.entityId ?? null,
          p_limit: limit,
          p_similarity_threshold: 0.3,
        },
      );

      if (!vecError && vecResults) {
        for (const row of vecResults) {
          // Avoid duplicate chunks already found via FTS
          if (!results.some((r) => r.id === row.id)) {
            results.push({
              id: row.id,
              sourceTable: "kb_document_chunks",
              title: row.document_title ?? null,
              snippet: (row.content ?? "").slice(0, 300),
              entityType: row.related_entity_type ?? null,
              entityId: row.related_entity_id ?? null,
              score: row.similarity ?? 0,
              scoreType: "vector",
              createdAt: row.created_at,
              metadata: row.metadata ?? {},
            });
          }
        }
      }
    } catch (err) {
      // Vector search is optional; don't fail the whole request
      console.error(`Vector search error: ${err}`);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// getEntityContext — full context assembly for a single entity
// ---------------------------------------------------------------------------
export async function getEntityContext(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<EntityContext> {
  // 1. Fetch canonical entity profile (READ-ONLY from existing tables)
  const canonicalTable = getCanonicalTable(entityType);
  let entity: Record<string, unknown> | null = null;

  if (canonicalTable) {
    const { data, error } = await supabase
      .from(canonicalTable)
      .select("*")
      .eq("id", entityId)
      .maybeSingle();

    if (!error && data) {
      entity = data as Record<string, unknown>;
    }
  }

  // 2. Fetch all KB artifacts linked to this entity in parallel
  const [
    summaryCards,
    recentNotes,
    documents,
    recentActions,
    externalLinks,
    relatedEntities,
  ] = await Promise.all([
    fetchSummaryCards(supabase, entityType, entityId),
    fetchRecentNotes(supabase, entityType, entityId),
    fetchDocuments(supabase, entityType, entityId),
    fetchRecentActions(supabase, entityType, entityId),
    fetchExternalLinks(supabase, entityType, entityId),
    fetchRelatedEntities(supabase, entityType, entityId),
  ]);

  // 3. Fetch top chunks from linked documents
  const docIds = documents.map((d) => d.id);
  let topChunks: Array<Pick<KbDocumentChunk, "id" | "content" | "chunk_index" | "document_id" | "metadata">> = [];
  if (docIds.length > 0) {
    const { data: chunks } = await supabase
      .from("kb_document_chunks")
      .select("id, content, chunk_index, document_id, metadata")
      .in("document_id", docIds.slice(0, 10)) // Limit to first 10 docs
      .order("chunk_index", { ascending: true })
      .limit(20);

    topChunks = chunks ?? [];
  }

  return {
    entity,
    entityType,
    entityId,
    summaryCards,
    recentNotes,
    documents,
    topChunks,
    recentActions,
    externalLinks,
    relatedEntities,
  };
}

// ---------------------------------------------------------------------------
// Fetch helpers — each queries a single kb_* table
// ---------------------------------------------------------------------------

async function fetchSummaryCards(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<KbSummaryCard[]> {
  const { data } = await supabase
    .from("kb_summary_cards")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(10);
  return data ?? [];
}

async function fetchRecentNotes(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<KbNote[]> {
  // Direct notes + notes linked via kb_entity_links
  const { data: directNotes } = await supabase
    .from("kb_notes")
    .select("*")
    .eq("related_entity_type", entityType)
    .eq("related_entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(20);

  // Also find notes linked via entity_links
  const { data: linkedNoteIds } = await supabase
    .from("kb_entity_links")
    .select("source_id")
    .eq("source_table", "kb_notes")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .limit(20);

  const directIds = new Set((directNotes ?? []).map((n: any) => n.id));
  const additionalIds = (linkedNoteIds ?? [])
    .map((l: any) => l.source_id)
    .filter((id: string) => !directIds.has(id));

  let linkedNotes: KbNote[] = [];
  if (additionalIds.length > 0) {
    const { data } = await supabase
      .from("kb_notes")
      .select("*")
      .in("id", additionalIds)
      .order("created_at", { ascending: false });
    linkedNotes = data ?? [];
  }

  // Merge and deduplicate, sort by recency
  const allNotes = [...(directNotes ?? []), ...linkedNotes];
  allNotes.sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return allNotes.slice(0, 20);
}

async function fetchDocuments(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<KbDocument[]> {
  const { data } = await supabase
    .from("kb_documents")
    .select("*")
    .eq("related_entity_type", entityType)
    .eq("related_entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(10);
  return data ?? [];
}

async function fetchRecentActions(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<KbActionLog[]> {
  const { data } = await supabase
    .from("kb_action_logs")
    .select("*")
    .eq("related_entity_type", entityType)
    .eq("related_entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(10);
  return data ?? [];
}

async function fetchExternalLinks(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<KbExternalObjectLink[]> {
  const { data } = await supabase
    .from("kb_external_object_links")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

async function fetchRelatedEntities(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<KbEntityLink[]> {
  const { data } = await supabase
    .from("kb_entity_links")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Simple text relevance scoring (used when tsvector/RPC unavailable)
// ---------------------------------------------------------------------------
function computeTextScore(query: string, text: string): number {
  if (!query || !text) return 0;
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lowerText = text.toLowerCase();
  let matches = 0;
  for (const term of queryTerms) {
    if (lowerText.includes(term)) matches++;
  }
  return queryTerms.length > 0 ? matches / queryTerms.length : 0;
}
