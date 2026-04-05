// =============================================================================
// Edge Function: kb-search
// =============================================================================
// Hybrid knowledge search endpoint.
// Combines structured filters, full-text search, and optional vector similarity.
// Protected by ENABLE_VYTA_KB feature flag.
//
// Routes:
//   POST /   — Search across notes and document chunks
//
// This function is READ-ONLY. It does not write to any table.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  requireFeatureFlag,
  getServiceClient,
} from "../_shared/kb-utils.ts";
import { searchKnowledge } from "../_shared/kb-retrieval-service.ts";
import { createEmbeddingProvider } from "../_shared/kb-embedding-provider.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const flagCheck = requireFeatureFlag("ENABLE_VYTA_KB");
  if (flagCheck) return flagCheck;

  try {
    if (req.method !== "POST") {
      return errorResponse("Method not allowed. Use POST.", 405);
    }

    const supabase = getServiceClient();
    const body = await req.json();

    if (!body.query || typeof body.query !== "string") {
      return errorResponse("query (string) is required", 400);
    }

    // Create embedding provider for semantic search if requested
    const embeddingProvider = body.semantic
      ? createEmbeddingProvider()
      : undefined;

    const startTime = Date.now();

    const { results, total } = await searchKnowledge(
      supabase,
      {
        query: body.query,
        entityType: body.entityType,
        entityId: body.entityId,
        sourceTypes: body.sourceTypes,
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
        userId: body.userId,
        workspaceId: body.workspaceId,
        limit: body.limit,
        offset: body.offset,
        semantic: body.semantic ?? false,
      },
      embeddingProvider,
    );

    return jsonResponse({
      results,
      total,
      searchDuration: Date.now() - startTime,
      semantic: !!(body.semantic && embeddingProvider),
    });
  } catch (err) {
    console.error("kb-search error:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal error");
  }
});
