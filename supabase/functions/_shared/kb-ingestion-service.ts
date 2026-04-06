// =============================================================================
// Vyta KB — Ingestion Service
// =============================================================================
// Handles note and document ingestion into the kb_* tables.
// Reads canonical entities for validation but NEVER modifies them.
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type {
  IngestNoteParams,
  IngestDocumentParams,
  KbNote,
  KbDocument,
  KbDocumentChunk,
  EmbeddingProvider,
} from "./kb-types.ts";
import { chunkText, getCanonicalTable } from "./kb-utils.ts";

// ---------------------------------------------------------------------------
// ingestNote — create a note and optionally link to a canonical entity
// ---------------------------------------------------------------------------
export async function ingestNote(
  supabase: SupabaseClient,
  params: IngestNoteParams,
): Promise<{ note: KbNote; entityLinkId?: string }> {
  // Validate related entity exists if specified (read-only check)
  if (params.relatedEntityType && params.relatedEntityId) {
    await validateEntityExists(supabase, params.relatedEntityType, params.relatedEntityId);
  }

  const { data: note, error } = await supabase
    .from("kb_notes")
    .insert({
      workspace_id: params.workspaceId ?? null,
      user_id: params.userId ?? null,
      title: params.title ?? null,
      body: params.body,
      note_type: params.noteType ?? null,
      source_type: params.sourceType ?? "manual",
      source_ref: params.sourceRef ?? null,
      related_entity_type: params.relatedEntityType ?? null,
      related_entity_id: params.relatedEntityId ?? null,
      created_by_agent: params.createdByAgent ?? false,
      metadata: params.metadata ?? {},
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create note: ${error.message}`);

  let entityLinkId: string | undefined;

  // Create entity link if requested and entity info is provided
  if (params.linkToEntity && params.relatedEntityType && params.relatedEntityId) {
    const { data: link, error: linkError } = await supabase
      .from("kb_entity_links")
      .insert({
        source_table: "kb_notes",
        source_id: note.id,
        entity_type: params.relatedEntityType,
        entity_id: params.relatedEntityId,
        relationship_type: "about",
      })
      .select("id")
      .single();

    if (linkError) {
      console.error(`Warning: note created but entity link failed: ${linkError.message}`);
    } else {
      entityLinkId = link.id;
    }
  }

  return { note, entityLinkId };
}

// ---------------------------------------------------------------------------
// ingestDocument — create doc, chunk, populate tsvector, optionally embed
// ---------------------------------------------------------------------------
export async function ingestDocument(
  supabase: SupabaseClient,
  params: IngestDocumentParams,
  embeddingProvider?: EmbeddingProvider,
): Promise<{ document: KbDocument; chunks: KbDocumentChunk[]; entityLinkId?: string }> {
  // Validate related entity exists if specified
  if (params.relatedEntityType && params.relatedEntityId) {
    await validateEntityExists(supabase, params.relatedEntityType, params.relatedEntityId);
  }

  // 1. Create the document record
  const { data: doc, error: docError } = await supabase
    .from("kb_documents")
    .insert({
      workspace_id: params.workspaceId ?? null,
      user_id: params.userId ?? null,
      title: params.title,
      document_type: params.documentType ?? null,
      mime_type: params.mimeType ?? null,
      storage_path: params.storagePath ?? null,
      raw_text: params.rawText,
      source_type: params.sourceType ?? "upload",
      source_ref: params.sourceRef ?? null,
      related_entity_type: params.relatedEntityType ?? null,
      related_entity_id: params.relatedEntityId ?? null,
      metadata: params.metadata ?? {},
    })
    .select()
    .single();

  if (docError) throw new Error(`Failed to create document: ${docError.message}`);

  // 2. Chunk the raw text
  const textChunks = chunkText(params.rawText);

  if (textChunks.length === 0) {
    return { document: doc, chunks: [] };
  }

  // 3. Generate embeddings if provider available and requested
  let embeddings: number[][] | null = null;
  if (params.generateEmbeddings && embeddingProvider) {
    try {
      embeddings = await embeddingProvider.embedBatch(
        textChunks.map((c) => c.content),
      );
    } catch (err) {
      // Log but don't fail — embeddings can be generated asynchronously later
      // TODO: Queue failed embedding generation for async retry
      console.error(`Embedding generation failed, continuing without: ${err}`);
    }
  }

  // 4. Insert chunks with tsvector populated via to_tsvector()
  // We use raw SQL for tsvector generation since the Supabase JS client
  // doesn't support PostgreSQL functions in insert values directly.
  // Instead, we insert without tsvector and update it in a second pass.
  const chunkInserts = textChunks.map((chunk, i) => ({
    document_id: doc.id,
    chunk_index: chunk.index,
    content: chunk.content,
    token_count: chunk.tokenCountEstimate,
    embedding: embeddings?.[i] ? JSON.stringify(embeddings[i]) : null,
    metadata: {},
  }));

  const { data: chunks, error: chunkError } = await supabase
    .from("kb_document_chunks")
    .insert(chunkInserts)
    .select();

  if (chunkError) throw new Error(`Failed to create chunks: ${chunkError.message}`);

  // 5. Update tsvector for full-text search using RPC or raw SQL
  // We batch-update tsvector for all chunks of this document
  // TODO: This could be moved to a Postgres trigger for automatic population
  const { error: tsvError } = await supabase.rpc("kb_populate_tsvector", {
    p_document_id: doc.id,
  }).catch(() => {
    // RPC may not exist yet — fall back to individual updates
    console.warn("kb_populate_tsvector RPC not available, tsvector will be null until populated");
    return { error: null };
  });

  if (tsvError) {
    console.warn(`tsvector population warning: ${tsvError.message}`);
  }

  // 6. Create entity link if requested
  let entityLinkId: string | undefined;
  if (params.linkToEntity && params.relatedEntityType && params.relatedEntityId) {
    const { data: link, error: linkError } = await supabase
      .from("kb_entity_links")
      .insert({
        source_table: "kb_documents",
        source_id: doc.id,
        entity_type: params.relatedEntityType,
        entity_id: params.relatedEntityId,
        relationship_type: "about",
      })
      .select("id")
      .single();

    if (linkError) {
      console.error(`Warning: document created but entity link failed: ${linkError.message}`);
    } else {
      entityLinkId = link.id;
    }
  }

  return { document: doc, chunks: chunks ?? [], entityLinkId };
}

// ---------------------------------------------------------------------------
// linkArtifactToEntity — create a kb_entity_links row
// ---------------------------------------------------------------------------
export async function linkArtifactToEntity(
  supabase: SupabaseClient,
  params: {
    sourceTable: string;
    sourceId: string;
    entityType: string;
    entityId: string;
    relationshipType?: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<{ id: string }> {
  await validateEntityExists(supabase, params.entityType, params.entityId);

  const { data, error } = await supabase
    .from("kb_entity_links")
    .upsert(
      {
        source_table: params.sourceTable,
        source_id: params.sourceId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        relationship_type: params.relationshipType ?? "about",
        confidence: params.confidence ?? null,
        metadata: params.metadata ?? {},
      },
      { onConflict: "source_table,source_id,entity_type,entity_id" },
    )
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create entity link: ${error.message}`);
  return { id: data.id };
}

// ---------------------------------------------------------------------------
// buildSummaryCard — create or update a summary card for an entity
// ---------------------------------------------------------------------------
export async function buildSummaryCard(
  supabase: SupabaseClient,
  params: {
    entityType: string;
    entityId: string;
    cardType: string;
    title: string;
    summary: string;
    sourceTable?: string;
    sourceId?: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("kb_summary_cards")
    .insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      card_type: params.cardType,
      title: params.title,
      summary: params.summary,
      source_table: params.sourceTable ?? null,
      source_id: params.sourceId ?? null,
      confidence: params.confidence ?? null,
      metadata: params.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create summary card: ${error.message}`);
  return { id: data.id };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a canonical entity exists. READ-ONLY check.
 * Throws if the entity type is unknown or the record doesn't exist.
 */
async function validateEntityExists(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<void> {
  const table = getCanonicalTable(entityType);
  if (!table) {
    throw new Error(
      `Unknown entity type: "${entityType}". Valid types: firm, company, org, person, profile, competitor`,
    );
  }

  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", entityId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to validate ${entityType} entity: ${error.message}`);
  }
  if (!data) {
    throw new Error(`${entityType} entity not found: ${entityId}`);
  }
}
