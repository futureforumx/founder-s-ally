// =============================================================================
// Edge Function: kb-notes
// =============================================================================
// Endpoints for note ingestion and retrieval.
// Protected by ENABLE_VYTA_KB feature flag.
//
// Routes:
//   POST /   — Create a new note (ingestNote)
//   GET  /   — List notes (with optional entity filters)
//
// This function does NOT modify any existing tables.
// It only writes to kb_notes and kb_entity_links.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  requireFeatureFlag,
  getServiceClient,
} from "../_shared/kb-utils.ts";
import { ingestNote } from "../_shared/kb-ingestion-service.ts";

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Feature flag gate
  const flagCheck = requireFeatureFlag("ENABLE_VYTA_KB");
  if (flagCheck) return flagCheck;

  try {
    const supabase = getServiceClient();

    // --- POST: Create a new note ---
    if (req.method === "POST") {
      const body = await req.json();

      if (!body.body || typeof body.body !== "string") {
        return errorResponse("body (string) is required", 400);
      }

      const result = await ingestNote(supabase, {
        userId: body.userId,
        workspaceId: body.workspaceId,
        title: body.title,
        body: body.body,
        noteType: body.noteType,
        sourceType: body.sourceType,
        sourceRef: body.sourceRef,
        relatedEntityType: body.relatedEntityType,
        relatedEntityId: body.relatedEntityId,
        createdByAgent: body.createdByAgent ?? false,
        metadata: body.metadata,
        linkToEntity: body.linkToEntity ?? false,
      });

      return jsonResponse({ success: true, ...result }, 201);
    }

    // --- GET: List notes with filters ---
    if (req.method === "GET") {
      const url = new URL(req.url);
      const entityType = url.searchParams.get("entityType");
      const entityId = url.searchParams.get("entityId");
      const userId = url.searchParams.get("userId");
      const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
      const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

      let query = supabase
        .from("kb_notes")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + Math.min(limit, 100) - 1);

      if (entityType) query = query.eq("related_entity_type", entityType);
      if (entityId) query = query.eq("related_entity_id", entityId);
      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;

      if (error) return errorResponse(`Query failed: ${error.message}`);

      return jsonResponse({ notes: data ?? [], count: (data ?? []).length });
    }

    return errorResponse("Method not allowed", 405);
  } catch (err) {
    console.error("kb-notes error:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal error");
  }
});
