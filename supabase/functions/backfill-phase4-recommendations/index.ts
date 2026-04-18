// =============================================================================
// backfill-phase4-recommendations / index.ts
// =============================================================================
// Edge Function: generates / refreshes Phase 4 recommendations.
//
// Invoked:
//   a) By the DB trigger notify_phase4_recs_refresh() after a
//      context_entity_notes INSERT/UPDATE (org note enters active stage).
//   b) Manually via POST for a full backfill across all contexts.
//
// Request body (all optional):
//   {
//     "ownerContextId": "<uuid>",   // scope to one context; omit for all
//     "orgNoteId":      "<uuid>",   // hint from trigger (unused, logged only)
//     "dryRun":         true        // compute but skip writes
//   }
//
// Response:
//   {
//     "notesProcessed":   number,
//     "askIntroCreated":  number,
//     "askIntroUpdated":  number,
//     "reachOutCreated":  number,
//     "reachOutUpdated":  number,
//     "expired":          number,
//     "errors":           string[],
//     "dryRun":           boolean
//   }
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { generateRecommendations } from "../_shared/generateRecommendations.ts";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
// Two paths are accepted:
//   Path 1 — webhook secret (DB trigger → x-webhook-secret header)
//   Path 2 — Supabase Bearer JWT (frontend → Authorization: Bearer <jwt>)
//             Validated by checking RLS on owner_contexts: if the user has
//             SELECT access to the requested context, the call is allowed.
// If WEBHOOK_SECRET is not set, all callers are accepted (dev / CI mode).

async function isAuthorized(
  req: Request,
  ownerContextId: string | null,
): Promise<boolean> {
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET") ?? "";

  // No secret configured → open (dev / CI)
  if (!webhookSecret) return true;

  // Path 1: webhook secret
  const incomingSecret = req.headers.get("x-webhook-secret") ?? "";
  if (incomingSecret === webhookSecret) return true;

  // Path 2: Bearer JWT
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return false;

  try {
    // Create a user-scoped client — RLS will restrict rows to the calling user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (ownerContextId) {
      // Validate the user has access to the specific context they're requesting
      const { data } = await userClient
        .from("owner_contexts")
        .select("id")
        .eq("id", ownerContextId)
        .limit(1)
        .maybeSingle();
      return data !== null;
    }

    // No specific context → just confirm the JWT resolves to at least one context
    const { data } = await userClient
      .from("owner_contexts")
      .select("id")
      .limit(1)
      .maybeSingle();
    return data !== null;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // Parse body first so ownerContextId is available for auth scoping
  let body: Record<string, unknown> = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch (_) {
    // empty body is fine
  }

  const ownerContextId = typeof body.ownerContextId === "string"
    ? body.ownerContextId
    : null;

  const dryRun = body.dryRun === true;

  // Auth check (webhook secret OR Bearer JWT)
  if (!(await isAuthorized(req, ownerContextId))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Service-role client (bypasses RLS)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const result = await generateRecommendations(supabase, ownerContextId, dryRun);

    return new Response(
      JSON.stringify({ ...result, dryRun }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("backfill-phase4-recommendations error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
