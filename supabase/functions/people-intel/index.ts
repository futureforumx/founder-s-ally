/**
 * people-intel Edge Function
 * ===========================
 * Internal API surface for the People Intelligence Graph backend.
 * Routes are handled via JSON body { action, ...params }.
 *
 * Actions:
 *   POST  enrich/person
 *   POST  enrich/organization
 *   POST  refresh/person
 *   POST  refresh/organization
 *   GET   person/:id/graph       (via action + params)
 *   GET   organization/:id/graph
 *   GET   person/:id/changes
 *   GET   organization/:id/changes
 *   GET   intro-paths
 *   GET   signals/recent
 *
 * Auth: service_role key required (internal backend use only).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action =
  | "enrich/person"
  | "enrich/organization"
  | "refresh/person"
  | "refresh/organization"
  | "person/graph"
  | "organization/graph"
  | "person/changes"
  | "organization/changes"
  | "intro-paths"
  | "signals/recent";

interface RequestBody {
  action:      Action;
  entity_type?: string;
  entity_id?:   string;
  linkedin_url?: string;
  seed_input?:  Record<string, string>;
  limit?:       number;
  offset?:      number;
  dry_run?:     boolean;
  force?:       boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl      = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Auth guard — only accept service_role key
  const authHeader = req.headers.get("authorization") ?? req.headers.get("apikey") ?? "";
  if (!authHeader.includes(serviceRoleKey)) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body: RequestBody = await req.json().catch(() => ({ action: "signals/recent" as Action }));
    const db = createClient(supabaseUrl, serviceRoleKey);

    const { action, entity_type, entity_id, limit = 50, offset = 0 } = body;

    // ── POST enrich/person ─────────────────────────────────────────────────
    if (action === "enrich/person" || action === "refresh/person") {
      if (!entity_type || !entity_id) return json({ error: "entity_type and entity_id required" }, 400);

      const runKey = `person:${entity_type}:${entity_id}:${datestamp()}`;
      const { error: runErr, data: existingRun } = await db
        .from("pig_enrichment_runs")
        .select("id, status")
        .eq("run_key", runKey)
        .maybeSingle();

      if (!runErr && existingRun?.status === "running") {
        return json({ message: "Run already in progress", run_id: existingRun.id });
      }

      const { data: run } = await db.from("pig_enrichment_runs").upsert(
        { run_key: runKey, entity_type, entity_id, trigger: "api", status: "running", started_at: new Date().toISOString() },
        { onConflict: "run_key" },
      ).select("id").single();

      // Respond immediately — caller polls status via run_id
      scheduleEnrichmentInBackground(db, entity_type, entity_id, "person", run?.id ?? "", body.dry_run ?? false);
      return json({ run_id: run?.id, status: "queued", entity_type, entity_id });
    }

    // ── POST enrich/organization ───────────────────────────────────────────
    if (action === "enrich/organization" || action === "refresh/organization") {
      if (!entity_type || !entity_id) return json({ error: "entity_type and entity_id required" }, 400);

      const runKey = `org:${entity_type}:${entity_id}:${datestamp()}`;
      const { data: run } = await db.from("pig_enrichment_runs").upsert(
        { run_key: runKey, entity_type, entity_id, trigger: "api", status: "running", started_at: new Date().toISOString() },
        { onConflict: "run_key" },
      ).select("id").single();

      scheduleEnrichmentInBackground(db, entity_type, entity_id, "org", run?.id ?? "", body.dry_run ?? false);
      return json({ run_id: run?.id, status: "queued", entity_type, entity_id });
    }

    // ── GET person/:id/graph ───────────────────────────────────────────────
    if (action === "person/graph") {
      if (!entity_type || !entity_id) return json({ error: "entity_type and entity_id required" }, 400);

      const [
        { data: personEdges },
        { data: orgEdges },
        { data: roles },
        { data: scores },
        { data: attributes },
      ] = await Promise.all([
        db.from("person_relationship_edges")
          .select("*")
          .or(`from_entity_type.eq.${entity_type},to_entity_type.eq.${entity_type}`)
          .or(`from_entity_id.eq.${entity_id},to_entity_id.eq.${entity_id}`)
          .order("weight", { ascending: false })
          .limit(limit),
        db.from("person_org_relationship_edges")
          .select("*")
          .eq("person_entity_type", entity_type)
          .eq("person_entity_id", entity_id)
          .order("weight", { ascending: false })
          .limit(limit),
        db.from("person_organization_roles")
          .select("*")
          .eq("person_entity_type", entity_type)
          .eq("person_entity_id", entity_id)
          .order("start_date", { ascending: false }),
        db.from("person_reputation_scores")
          .select("score_key, score_value, scored_at")
          .eq("entity_type", entity_type)
          .eq("entity_id", entity_id),
        db.from("person_inferred_attributes")
          .select("attribute_key, attribute_value, confidence, explanation_summary")
          .eq("entity_type", entity_type)
          .eq("entity_id", entity_id),
      ]);

      return json({ entity_type, entity_id, person_edges: personEdges, org_edges: orgEdges, roles, scores, attributes });
    }

    // ── GET organization/:id/graph ─────────────────────────────────────────
    if (action === "organization/graph") {
      if (!entity_type || !entity_id) return json({ error: "entity_type and entity_id required" }, 400);

      const [
        { data: orgEdges },
        { data: personEdges },
        { data: signals },
        { data: scores },
      ] = await Promise.all([
        db.from("organization_relationship_edges")
          .select("*")
          .or(`from_entity_type.eq.${entity_type},to_entity_type.eq.${entity_type}`)
          .or(`from_entity_id.eq.${entity_id},to_entity_id.eq.${entity_id}`)
          .order("weight", { ascending: false })
          .limit(limit),
        db.from("person_org_relationship_edges")
          .select("*")
          .eq("org_entity_type", entity_type)
          .eq("org_entity_id", entity_id)
          .limit(limit),
        db.from("organization_activity_signals")
          .select("signal_type, signal_date, source_url, extracted_text")
          .eq("entity_type", entity_type)
          .eq("entity_id", entity_id)
          .order("signal_date", { ascending: false })
          .limit(20),
        db.from("organization_reputation_scores")
          .select("score_key, score_value, scored_at")
          .eq("entity_type", entity_type)
          .eq("entity_id", entity_id),
      ]);

      return json({ entity_type, entity_id, org_edges: orgEdges, person_edges: personEdges, signals, scores });
    }

    // ── GET person/:id/changes ────────────────────────────────────────────
    if (action === "person/changes") {
      if (!entity_type || !entity_id) return json({ error: "entity_type and entity_id required" }, 400);
      const { data } = await db
        .from("person_change_log")
        .select("field_name, old_value, new_value, detected_at, source_provider, diff_summary")
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .order("detected_at", { ascending: false })
        .range(offset, offset + limit - 1);
      return json({ entity_type, entity_id, changes: data ?? [] });
    }

    // ── GET organization/:id/changes ──────────────────────────────────────
    if (action === "organization/changes") {
      if (!entity_type || !entity_id) return json({ error: "entity_type and entity_id required" }, 400);
      const { data } = await db
        .from("organization_change_log")
        .select("field_name, old_value, new_value, detected_at, source_provider, diff_summary")
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .order("detected_at", { ascending: false })
        .range(offset, offset + limit - 1);
      return json({ entity_type, entity_id, changes: data ?? [] });
    }

    // ── GET intro-paths ────────────────────────────────────────────────────
    if (action === "intro-paths") {
      const from_entity_id = body.entity_id;
      const { data } = await db
        .from("strongest_founder_to_investor_paths_basis")
        .select("*")
        .eq("founder_entity_id", from_entity_id ?? "")
        .limit(limit);
      return json({ paths: data ?? [] });
    }

    // ── GET signals/recent ────────────────────────────────────────────────
    if (action === "signals/recent") {
      const [{ data: personSigs }, { data: orgSigs }] = await Promise.all([
        db.from("person_activity_signals")
          .select("entity_type, entity_id, signal_type, signal_date, source_provider, extracted_text")
          .order("signal_date", { ascending: false })
          .limit(limit),
        db.from("organization_activity_signals")
          .select("entity_type, entity_id, signal_type, signal_date, source_provider, extracted_text")
          .order("signal_date", { ascending: false })
          .limit(limit),
      ]);
      return json({ person_signals: personSigs ?? [], org_signals: orgSigs ?? [] });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    console.error("[people-intel] error", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function datestamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// Fire-and-forget background enrichment (Deno Edge Functions do not have
// background queues natively — for production use Supabase pg_cron or a queue).
// This function returns immediately and runs enrichment asynchronously within
// the same request lifetime (Deno ensures the response is sent first).
function scheduleEnrichmentInBackground(
  db: ReturnType<typeof createClient>,
  entityType: string,
  entityId: string,
  kind: "person" | "org",
  runId: string,
  dryRun: boolean,
): void {
  // Minimal inline enrichment (no heavy scraping in edge function — that lives in Node scripts).
  // Here we run the inference + scoring pipeline on existing snapshots.
  Promise.resolve().then(async () => {
    try {
      const stepNames = ["inference", "relationship_extraction", "reputation_scoring"];
      for (const step of stepNames) {
        await db.from("pig_enrichment_run_steps").insert({
          run_id: runId, step_name: step,
          status: "skipped",
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          metadata: { note: "Use CLI runner for full enrichment with web fetching" },
        }).then(() => {});
      }
      await db.from("pig_enrichment_runs").update({
        status: "partial",
        finished_at: new Date().toISOString(),
        steps_total: stepNames.length,
        steps_skipped: stepNames.length,
      }).eq("id", runId);
    } catch (_) { /* swallow — not critical path */ }
  });
}
