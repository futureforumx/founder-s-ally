// =============================================================================
// Edge Function: kb-agent-actions
// =============================================================================
// Action preview and execution endpoint for Vyta agent.
// Protected by ENABLE_VYTA_ACTIONS feature flag.
//
// Routes:
//   POST / with { mode: "preview" }  — Preview an action without executing
//   POST / with { mode: "execute" }  — Execute an action through a provider
//   GET  /                            — List recent action logs
//   GET  /?providers=true             — List available providers
//
// Every action is logged to kb_action_logs for full auditability.
// This function writes ONLY to kb_action_logs and kb_external_object_links.
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
  previewAction,
  executeAction,
  registerProvider,
  listProviders,
} from "../_shared/kb-action-dispatcher.ts";
import { ZapierMcpAdapter } from "../_shared/kb-provider-zapier.ts";

// Register provider adapters on cold start
registerProvider(new ZapierMcpAdapter());

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const flagCheck = requireFeatureFlag("ENABLE_VYTA_ACTIONS");
  if (flagCheck) return flagCheck;

  try {
    const supabase = getServiceClient();

    // --- GET: List action logs or providers ---
    if (req.method === "GET") {
      const url = new URL(req.url);

      // List available providers
      if (url.searchParams.get("providers") === "true") {
        return jsonResponse({ providers: listProviders() });
      }

      // List recent action logs
      const userId = url.searchParams.get("userId");
      const entityType = url.searchParams.get("entityType");
      const entityId = url.searchParams.get("entityId");
      const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
      const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

      let query = supabase
        .from("kb_action_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + Math.min(limit, 100) - 1);

      if (userId) query = query.eq("user_id", userId);
      if (entityType) query = query.eq("related_entity_type", entityType);
      if (entityId) query = query.eq("related_entity_id", entityId);

      const { data, error } = await query;
      if (error) return errorResponse(`Query failed: ${error.message}`);

      return jsonResponse({ actions: data ?? [], count: (data ?? []).length });
    }

    // --- POST: Preview or execute an action ---
    if (req.method === "POST") {
      const body = await req.json();

      if (!body.actionType || typeof body.actionType !== "string") {
        return errorResponse("actionType (string) is required", 400);
      }
      if (!body.provider || typeof body.provider !== "string") {
        return errorResponse("provider (string) is required", 400);
      }

      const request = {
        userId: body.userId,
        workspaceId: body.workspaceId,
        actionType: body.actionType,
        provider: body.provider,
        preview: body.mode === "preview",
        relatedEntityType: body.relatedEntityType,
        relatedEntityId: body.relatedEntityId,
        payload: body.payload ?? {},
      };

      if (body.mode === "preview") {
        const result = await previewAction(supabase, request);
        return jsonResponse({ result });
      }

      if (body.mode === "execute") {
        const result = await executeAction(supabase, request);
        return jsonResponse({ result });
      }

      return errorResponse(
        `Invalid mode: "${body.mode}". Use "preview" or "execute".`,
        400,
      );
    }

    return errorResponse("Method not allowed", 405);
  } catch (err) {
    console.error("kb-agent-actions error:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal error");
  }
});
