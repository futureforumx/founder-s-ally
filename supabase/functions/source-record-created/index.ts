// =============================================================================
// Edge Function: source-record-created
// =============================================================================
// Dispatcher for new connector_source_records rows.
//
// Primary path: explicit HTTP POST with `{ sourceRecordIds: string[] }`
// (used by the Vercel Google resync worker after each batch of inserts).
//
// The AFTER INSERT pg_net trigger on connector_source_records was removed
// (migration 20260422181000) to avoid double-invoke with that worker. Any
// other writer that inserts into connector_source_records must POST here
// when staging / promotion is required.
//
// Phase 2 — staging:
//   'email'          → stageEmail()
//   'calendar_event' → stageCalendar()
//   'contact' |
//   'company'  |
//   'activity'       → stageCrm()
//
// Phase 3 — promotion (runs immediately after staging):
//   email staged     → promoteEmail()
//   calendar staged  → promoteCalendar()
//   crm staged       → promoteCrm()
//
// Request body (both modes):
//   { type: "INSERT", record: ConnectorSourceRecord }  — Supabase webhook shape
//   OR
//   { sourceRecordIds: string[] }                      — direct invocation
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { ConnectorSourceRecord, DispatchOutcome } from "../_shared/connector-types.ts";
import { stageEmail }    from "../_shared/stageEmail.ts";
import { stageCalendar } from "../_shared/stageCalendar.ts";
import { stageCrm }      from "../_shared/stageCrm.ts";
import { promoteEmail }    from "../_shared/promoteEmail.ts";
import { promoteCalendar } from "../_shared/promoteCalendar.ts";
import { promoteCrm }      from "../_shared/promoteCrm.ts";
import { resolveSelfPerson } from "../_shared/resolveIdentity.ts";

// ---------------------------------------------------------------------------
// CORS + helpers
// ---------------------------------------------------------------------------

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(msg: string, status = 500): Response {
  return jsonResponse({ error: msg }, status);
}

// ---------------------------------------------------------------------------
// Supabase service client
// ---------------------------------------------------------------------------

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // --- Webhook secret verification ---
  // Set SUPABASE_WEBHOOK_SECRET in the function's environment secrets.
  // When the DB webhook fires, include the header:
  //   x-webhook-secret: <SUPABASE_WEBHOOK_SECRET>
  const webhookSecret = Deno.env.get("SUPABASE_WEBHOOK_SECRET");
  if (webhookSecret) {
    const incomingSecret = req.headers.get("x-webhook-secret");
    if (incomingSecret !== webhookSecret) {
      return errorResponse("Unauthorized", 401);
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const supabase = getServiceClient();
  const results: Array<{ id: string; outcome: DispatchOutcome }> = [];

  // --- Mode A: Supabase webhook shape { type: 'INSERT', record: {...} } ---
  if (body.type === "INSERT" && body.record) {
    const sourceRecord = body.record as ConnectorSourceRecord;
    const outcome = await dispatch(supabase, sourceRecord);
    results.push({ id: sourceRecord.id, outcome });
    return jsonResponse({ processed: results });
  }

  // --- Mode B: Direct invocation { sourceRecordIds: [...] } ---
  if (Array.isArray(body.sourceRecordIds) && body.sourceRecordIds.length > 0) {
    const ids: string[] = body.sourceRecordIds.map(String);

    const { data: rows, error } = await supabase
      .from("connector_source_records")
      .select()
      .in("id", ids)
      .is("processed_at", null);   // skip already-processed

    if (error) {
      return errorResponse(`Failed to fetch connector_source_records: ${error.message}`);
    }

    const records = (rows ?? []) as ConnectorSourceRecord[];

    // Process concurrently (bounded — caller should not send >50 IDs at once)
    const settled = await Promise.allSettled(
      records.map(async (r) => {
        const outcome = await dispatch(supabase, r);
        return { id: r.id, outcome };
      }),
    );

    for (const s of settled) {
      if (s.status === "fulfilled") {
        results.push(s.value);
      } else {
        console.error("[source-record-created] dispatch error:", s.reason);
        results.push({
          id: "unknown",
          outcome: { type: "skipped", reason: String(s.reason) },
        });
      }
    }

    return jsonResponse({ processed: results });
  }

  return errorResponse(
    "Body must be a Supabase webhook INSERT payload or { sourceRecordIds: string[] }",
    400,
  );
});

// ---------------------------------------------------------------------------
// dispatch — route a single ConnectorSourceRecord to the correct stager
//            then promote into the graph layer
// ---------------------------------------------------------------------------

async function dispatch(
  supabase: ReturnType<typeof getServiceClient>,
  sourceRecord: ConnectorSourceRecord,
): Promise<DispatchOutcome> {
  try {
    // Resolve the self-person once per record (used by all promoters)
    let selfPersonId: string | null = null;
    try {
      const selfPerson = await resolveSelfPerson(supabase, sourceRecord.owner_context_id);
      selfPersonId = selfPerson?.id ?? null;
    } catch (err) {
      // Non-fatal: promotion will skip edge creation but still write interactions
      console.warn(
        `[source-record-created] resolveSelfPerson failed for context ${sourceRecord.owner_context_id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }

    switch (sourceRecord.record_type) {
      case "email": {
        const stageResult = await stageEmail(supabase, sourceRecord);
        // Promote regardless of whether already existed (idempotent)
        try {
          await promoteEmail(supabase, sourceRecord, stageResult.message, selfPersonId);
        } catch (err) {
          console.error(
            `[source-record-created] promoteEmail failed for ${sourceRecord.id}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
        return { type: "email", result: stageResult };
      }

      case "calendar_event": {
        const stageResult = await stageCalendar(supabase, sourceRecord);
        try {
          await promoteCalendar(supabase, sourceRecord, stageResult.event, selfPersonId);
        } catch (err) {
          console.error(
            `[source-record-created] promoteCalendar failed for ${sourceRecord.id}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
        return { type: "calendar", result: stageResult };
      }

      case "contact":
      case "company":
      case "activity": {
        const stageResult = await stageCrm(supabase, sourceRecord);
        try {
          await promoteCrm(supabase, sourceRecord, stageResult, selfPersonId);
        } catch (err) {
          console.error(
            `[source-record-created] promoteCrm failed for ${sourceRecord.id}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
        return { type: "crm", result: stageResult };
      }

      default:
        return {
          type: "skipped",
          reason: `Unknown record_type: ${sourceRecord.record_type}`,
        };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[source-record-created] dispatch failed for ${sourceRecord.id}:`, msg);
    // Return skipped rather than throwing so one bad record doesn't abort the batch
    return { type: "skipped", reason: msg };
  }
}
