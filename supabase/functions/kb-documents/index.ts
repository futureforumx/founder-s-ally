// =============================================================================
// Edge Function: kb-documents
// =============================================================================
// Endpoints for document ingestion and retrieval.
// Protected by ENABLE_AURORA_KB feature flag.
//
// Routes:
//   POST /   — Ingest a new document (chunk, embed, link)
//   GET  /   — List documents (with optional entity filters)
//
// This function does NOT modify any existing tables.
// It writes to kb_documents, kb_document_chunks, and kb_entity_links.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  requireFeatureFlag,
  getServiceClient,
} from "../_shared/kb-utils.ts";
import { ingestDocument } from "../_shared/kb-ingestion-service.ts";
import { createEmbeddingProvider } from "../_shared/kb-embedding-provider.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const flagCheck = requireFeatureFlag("ENABLE_AURORA_KB");
  if (flagCheck) return flagCheck;

  try {
    const supabase = getServiceClient();

    // --- POST: Ingest a document ---
    if (req.method === "POST") {
      const body = await req.json();

      if (!body.title || typeof body.title !== "string") {
        return errorResponse("title (string) is required", 400);
      }
      if (!body.rawText || typeof body.rawText !== "string") {
        return errorResponse("rawText (string) is required", 400);
      }

      // Create embedding provider if embeddings requested
      const embeddingProvider = body.generateEmbeddings
        ? createEmbeddingProvider()
        : undefined;

      const result = await ingestDocument(
        supabase,
        {
          userId: body.userId,
          workspaceId: body.workspaceId,
          title: body.title,
          documentType: body.documentType,
          mimeType: body.mimeType,
          storagePath: body.storagePath,
          rawText: body.rawText,
          sourceType: body.sourceType,
          sourceRef: body.sourceRef,
          relatedEntityType: body.relatedEntityType,
          relatedEntityId: body.relatedEntityId,
          metadata: body.metadata,
          generateEmbeddings: body.generateEmbeddings ?? false,
          linkToEntity: body.linkToEntity ?? false,
        },
        embeddingProvider,
      );

      return jsonResponse(
        {
          success: true,
          document: result.document,
          chunkCount: result.chunks.length,
          entityLinkId: result.entityLinkId,
        },
        201,
      );
    }

    // --- GET: List documents ---
    if (req.method === "GET") {
      const url = new URL(req.url);
      const entityType = url.searchParams.get("entityType");
      const entityId = url.searchParams.get("entityId");
      const userId = url.searchParams.get("userId");
      const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
      const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

      let query = supabase
        .from("kb_documents")
        .select("id, title, document_type, mime_type, source_type, related_entity_type, related_entity_id, metadata, created_at, updated_at")
        .order("created_at", { ascending: false })
        .range(offset, offset + Math.min(limit, 100) - 1);

      if (entityType) query = query.eq("related_entity_type", entityType);
      if (entityId) query = query.eq("related_entity_id", entityId);
      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;

      if (error) return errorResponse(`Query failed: ${error.message}`);

      return jsonResponse({ documents: data ?? [], count: (data ?? []).length });
    }

    return errorResponse("Method not allowed", 405);
  } catch (err) {
    console.error("kb-documents error:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal error");
  }
});
