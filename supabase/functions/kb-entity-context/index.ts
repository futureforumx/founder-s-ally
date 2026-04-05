// =============================================================================
// Edge Function: kb-entity-context
// =============================================================================
// Aurora agent context assembly endpoint.
// Returns grounded, structured context for a canonical entity.
// Protected by ENABLE_AURORA_KB feature flag.
//
// Routes:
//   POST /   — Get full entity context (for agent consumption)
//   POST / with { mode: "search" } — Search-based context assembly
//
// This function is READ-ONLY against canonical tables.
// It reads from kb_* tables and existing entity tables.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  requireFeatureFlag,
  getServiceClient,
} from "../_shared/kb-utils.ts";
import {
  assembleAuroraEntityContext,
  assembleAuroraSearchContext,
} from "../_shared/kb-agent-context-service.ts";
import { createEmbeddingProvider } from "../_shared/kb-embedding-provider.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const flagCheck = requireFeatureFlag("ENABLE_AURORA_KB");
  if (flagCheck) return flagCheck;

  try {
    if (req.method !== "POST") {
      return errorResponse("Method not allowed. Use POST.", 405);
    }

    const supabase = getServiceClient();
    const body = await req.json();

    // --- Mode: entity context ---
    if (!body.mode || body.mode === "entity") {
      if (!body.entityType || typeof body.entityType !== "string") {
        return errorResponse("entityType (string) is required", 400);
      }
      if (!body.entityId || typeof body.entityId !== "string") {
        return errorResponse("entityId (string) is required", 400);
      }

      const context = await assembleAuroraEntityContext(
        supabase,
        body.entityType,
        body.entityId,
      );

      return jsonResponse({ context });
    }

    // --- Mode: search context ---
    if (body.mode === "search") {
      if (!body.query || typeof body.query !== "string") {
        return errorResponse("query (string) is required for search mode", 400);
      }

      const embeddingProvider = body.semantic
        ? createEmbeddingProvider()
        : undefined;

      const context = await assembleAuroraSearchContext(
        supabase,
        body.query,
        {
          entityType: body.entityType,
          entityId: body.entityId,
          userId: body.userId,
          workspaceId: body.workspaceId,
          semantic: body.semantic ?? false,
        },
        embeddingProvider,
        body.enrichTopN ?? 3,
      );

      return jsonResponse({ context });
    }

    return errorResponse(
      `Unknown mode: "${body.mode}". Use "entity" or "search".`,
      400,
    );
  } catch (err) {
    console.error("kb-entity-context error:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal error");
  }
});
