// =============================================================================
// Edge Function: backfill-phase3-graph
// =============================================================================
// One-shot backfill that promotes already-staged Phase 2 records into the
// Phase 3 graph layer.
//
// Scans:
//   email_messages    WHERE id NOT IN (SELECT source_record_id FROM interactions WHERE kind='email')
//   calendar_events   WHERE id NOT IN (SELECT source_record_id FROM interactions WHERE kind='meeting')
//   crm_activities    WHERE id NOT IN (SELECT source_record_id FROM interactions WHERE kind='crm_touch')
//
// For each un-promoted record it:
//   1. Looks up the originating connector_source_records row.
//   2. Resolves the self person for the owner_context.
//   3. Calls the appropriate promote* function.
//
// Request body:
//   {
//     ownerContextId?: string    // limit to one context (optional)
//     batchSize?:      number    // rows per pass (default 50, max 200)
//     dryRun?:         boolean   // true → count only, no writes
//   }
//
// Response:
//   {
//     emailsPromoted:    number
//     calendarsPromoted: number
//     crmPromoted:       number
//     errors:            string[]
//   }
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { ConnectorSourceRecord } from "../_shared/connector-types.ts";
import { promoteEmail }    from "../_shared/promoteEmail.ts";
import { promoteCalendar } from "../_shared/promoteCalendar.ts";
import { promoteCrm }      from "../_shared/promoteCrm.ts";
import { resolveSelfPerson } from "../_shared/resolveIdentity.ts";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Service client
// ---------------------------------------------------------------------------

function getClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "POST required" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const ownerContextId = typeof body.ownerContextId === "string" ? body.ownerContextId : null;
  const batchSize      = Math.min(200, typeof body.batchSize === "number" ? body.batchSize : 50);
  const dryRun         = body.dryRun === true;

  const supabase = getClient();
  const errors: string[] = [];
  let emailsPromoted    = 0;
  let calendarsPromoted = 0;
  let crmPromoted       = 0;

  // -------------------------------------------------------------------------
  // 1. Email messages not yet promoted
  // -------------------------------------------------------------------------
  {
    let q = supabase
      .from("email_messages")
      .select("id, owner_context_id, external_id, source_record_id")
      .is("source_record_id", null)    // will be refined below
      .limit(batchSize);

    // Use a NOT-IN subquery via RPC isn't available, so we check via
    // interactions table: fetch interaction external_ids for email kind,
    // then exclude matching email_messages.
    // Simpler: join on source_record_id presence in interactions.
    // Actually, easiest approach: fetch interactions.source_record_id for email
    // kind first, then exclude those from email_messages query.

    const { data: promotedSourceIds } = await supabase
      .from("interactions")
      .select("source_record_id")
      .eq("kind", "email")
      .not("source_record_id", "is", null)
      .limit(10000);  // reasonable cap — adjust if needed

    const promotedSet = new Set(
      (promotedSourceIds ?? []).map((r: { source_record_id: string }) => r.source_record_id),
    );

    // Fetch email_messages that have a source_record_id
    let emQuery = supabase
      .from("email_messages")
      .select()
      .not("source_record_id", "is", null)
      .limit(batchSize);

    if (ownerContextId) emQuery = emQuery.eq("owner_context_id", ownerContextId);

    const { data: messages, error: emErr } = await emQuery;
    if (emErr) {
      errors.push(`email_messages fetch: ${emErr.message}`);
    } else {
      for (const msg of (messages ?? [])) {
        if (promotedSet.has(msg.source_record_id)) continue;

        if (dryRun) { emailsPromoted++; continue; }

        try {
          const sourceRecord = await fetchSourceRecord(supabase, msg.source_record_id);
          if (!sourceRecord) continue;

          const selfPerson = await resolveSelfPerson(supabase, msg.owner_context_id).catch(() => null);
          await promoteEmail(supabase, sourceRecord, msg, selfPerson?.id ?? null);
          emailsPromoted++;
        } catch (err) {
          errors.push(`email ${msg.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Calendar events not yet promoted
  // -------------------------------------------------------------------------
  {
    const { data: promotedSourceIds } = await supabase
      .from("interactions")
      .select("source_record_id")
      .eq("kind", "meeting")
      .not("source_record_id", "is", null)
      .limit(10000);

    const promotedSet = new Set(
      (promotedSourceIds ?? []).map((r: { source_record_id: string }) => r.source_record_id),
    );

    let ceQuery = supabase
      .from("calendar_events")
      .select()
      .not("source_record_id", "is", null)
      .limit(batchSize);

    if (ownerContextId) ceQuery = ceQuery.eq("owner_context_id", ownerContextId);

    const { data: events, error: ceErr } = await ceQuery;
    if (ceErr) {
      errors.push(`calendar_events fetch: ${ceErr.message}`);
    } else {
      for (const evt of (events ?? [])) {
        if (promotedSet.has(evt.source_record_id)) continue;

        if (dryRun) { calendarsPromoted++; continue; }

        try {
          const sourceRecord = await fetchSourceRecord(supabase, evt.source_record_id);
          if (!sourceRecord) continue;

          const selfPerson = await resolveSelfPerson(supabase, evt.owner_context_id).catch(() => null);
          await promoteCalendar(supabase, sourceRecord, evt, selfPerson?.id ?? null);
          calendarsPromoted++;
        } catch (err) {
          errors.push(`calendar ${evt.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. CRM activities not yet promoted
  // -------------------------------------------------------------------------
  {
    const { data: promotedSourceIds } = await supabase
      .from("interactions")
      .select("source_record_id")
      .eq("kind", "crm_touch")
      .not("source_record_id", "is", null)
      .limit(10000);

    const promotedSet = new Set(
      (promotedSourceIds ?? []).map((r: { source_record_id: string }) => r.source_record_id),
    );

    let actQuery = supabase
      .from("crm_activities")
      .select()
      .not("source_record_id", "is", null)
      .limit(batchSize);

    if (ownerContextId) actQuery = actQuery.eq("owner_context_id", ownerContextId);

    const { data: activities, error: actErr } = await actQuery;
    if (actErr) {
      errors.push(`crm_activities fetch: ${actErr.message}`);
    } else {
      for (const act of (activities ?? [])) {
        if (promotedSet.has(act.source_record_id)) continue;

        if (dryRun) { crmPromoted++; continue; }

        try {
          const sourceRecord = await fetchSourceRecord(supabase, act.source_record_id);
          if (!sourceRecord) continue;

          const selfPerson = await resolveSelfPerson(supabase, act.owner_context_id).catch(() => null);

          // Build a minimal StageCrmResult for the activity row
          const staged = { contact: null, company: null, activity: act };
          await promoteCrm(supabase, sourceRecord, staged, selfPerson?.id ?? null);
          crmPromoted++;
        } catch (err) {
          errors.push(`crm_activity ${act.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  return json({
    emailsPromoted,
    calendarsPromoted,
    crmPromoted,
    errors,
    dryRun,
  });
});

// ---------------------------------------------------------------------------
// fetchSourceRecord
// ---------------------------------------------------------------------------

async function fetchSourceRecord(
  supabase: ReturnType<typeof getClient>,
  sourceRecordId: string,
): Promise<ConnectorSourceRecord | null> {
  const { data, error } = await supabase
    .from("connector_source_records")
    .select()
    .eq("id", sourceRecordId)
    .maybeSingle();

  if (error) {
    console.error(`fetchSourceRecord failed for ${sourceRecordId}: ${error.message}`);
    return null;
  }
  return (data ?? null) as ConnectorSourceRecord | null;
}
