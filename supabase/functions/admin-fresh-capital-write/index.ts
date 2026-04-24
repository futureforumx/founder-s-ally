/**
 * admin-fresh-capital-write  — Admin CRUD + run observability for Fresh Capital
 *
 * Auth: Any JWT whose `sub` is present in `user_roles` with permission in
 *       ('admin', 'god'). WorkOS JWT subs (user_xxxxx) and legacy UUIDs both work.
 *
 * Methods:
 *   GET    ?table=vc_funds|fi_deals_canonical|pipeline_source_config|vc_fund_sync_runs|fi_fetch_runs&limit=N&search=text
 *   POST   ?table=...   body: record object → INSERT, returns inserted row
 *   POST   ?table=fi_fetch_runs&action=run body:{limit?,source?} → proxy manual latest-funding ingest
 *   PATCH  ?table=...&id=uuid                body: partial update → UPDATE, returns updated row
 *   DELETE ?table=...&id=uuid                → soft-delete (sets deleted_at) or hard delete for fi_deals_canonical
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtSub } from "../_shared/jwt-sub.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-auth",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const ALLOWED_TABLES = [
  "vc_funds",
  "fi_deals_canonical",
  "pipeline_source_config",
  "vc_fund_sync_runs",
  "fi_fetch_runs",
] as const;
type AllowedTable = (typeof ALLOWED_TABLES)[number];
const SOURCE_TABLES = new Set<AllowedTable>(["pipeline_source_config"]);
const RUN_TABLES = new Set<AllowedTable>(["vc_fund_sync_runs", "fi_fetch_runs"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

async function assertAdmin(
  req: Request,
  adminClient: ReturnType<typeof createClient>,
): Promise<string | null> {
  const xUserAuth = req.headers.get("X-User-Auth") ?? req.headers.get("x-user-auth");
  const authHeader = xUserAuth ?? req.headers.get("Authorization");
  const sub = jwtSub(authHeader);
  if (!sub) return "Missing or invalid bearer token";

  const { data: roleRows, error } = await adminClient
    .from("user_roles")
    .select("permission")
    .eq("user_id", sub)
    .in("permission", ["admin", "god"]);

  if (error) return `Role lookup failed: ${error.message}`;
  if (!roleRows?.length) return "Caller is not an admin";
  return null; // OK
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const authErr = await assertAdmin(req, adminClient);
  if (authErr) return err(authErr, 403);

  const url = new URL(req.url);
  const tableParam = url.searchParams.get("table") as AllowedTable | null;

  if (!tableParam || !ALLOWED_TABLES.includes(tableParam)) {
    return err(`table must be one of: ${ALLOWED_TABLES.join(", ")}`);
  }

  const table = tableParam;
  const id = url.searchParams.get("id");
  const action = url.searchParams.get("action")?.trim() ?? "";

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "80"), 200);
    const search = url.searchParams.get("search")?.trim() ?? "";

    if (table === "vc_funds") {
      let q = adminClient
        .from("vc_funds")
        .select(`
          id,
          firm_record_id,
          name,
          fund_type,
          fund_sequence_number,
          vintage_year,
          announced_date,
          close_date,
          target_size_usd,
          final_size_usd,
          status,
          stage_focus,
          sector_focus,
          geography_focus,
          announcement_url,
          announcement_title,
          manually_verified,
          verification_status,
          likely_actively_deploying,
          source_confidence,
          created_at,
          updated_at,
          firm_records!inner(firm_name, website_url, location, logo_url, hq_city, hq_country)
        `)
        .is("deleted_at", null)
        .order("announced_date", { ascending: false })
        .limit(limit);

      if (search) {
        q = q.ilike("name", `%${search}%`);
      }

      const { data, error } = await q;
      if (error) return err(error.message, 500);
      return json({ rows: data ?? [] });
    }

    if (table === "pipeline_source_config") {
      const pipeline = url.searchParams.get("pipeline");
      let q = adminClient
        .from("pipeline_source_config")
        .select("*")
        .order("pipeline")
        .order("name");
      if (pipeline) q = (q as ReturnType<typeof adminClient.from>).eq("pipeline", pipeline);
      const { data, error } = await q;
      if (error) return err(error.message, 500);
      return json({ rows: data ?? [] });
    }

    if (table === "fi_deals_canonical") {
      let q = adminClient
        .from("fi_deals_canonical")
        .select(`
          id,
          company_name,
          company_domain,
          company_website,
          company_location,
          sector_normalized,
          round_type_normalized,
          amount_raw,
          amount_minor_units,
          currency,
          announced_date,
          lead_investor,
          co_investors,
          primary_source_url,
          primary_press_url,
          source_type,
          is_rumor,
          confidence_score,
          needs_review,
          review_reason,
          created_at,
          updated_at
        `)
        .order("announced_date", { ascending: false, nullsFirst: false })
        .limit(limit);

      if (search) {
        q = q.ilike("company_name", `%${search}%`);
      }

      const { data, error } = await q;
      if (error) return err(error.message, 500);
      return json({ rows: data ?? [] });
    }

    if (table === "vc_fund_sync_runs") {
      const phase = url.searchParams.get("phase")?.trim();
      let q = adminClient
        .from("vc_fund_sync_runs")
        .select(`
          id,
          phase,
          status,
          dry_run,
          scope_firm_id,
          scope_cluster_key,
          options,
          stats,
          error_message,
          started_at,
          completed_at,
          updated_at
        `)
        .order("started_at", { ascending: false })
        .limit(limit);

      if (phase) q = q.eq("phase", phase);

      const { data, error } = await q;
      if (error) return err(error.message, 500);
      return json({ rows: data ?? [] });
    }

    if (table === "fi_fetch_runs") {
      const status = url.searchParams.get("status")?.trim();
      const sourceSlug = url.searchParams.get("source")?.trim();
      let q = adminClient
        .from("fi_fetch_runs")
        .select(`
          id,
          source_id,
          run_mode,
          status,
          started_at,
          completed_at,
          docs_fetched,
          docs_parsed,
          deals_raw,
          deals_upserted,
          error_count,
          error_summary,
          metadata,
          fi_sources!inner(
            slug,
            name,
            base_url,
            source_type,
            last_fetched_at
          )
        `)
        .order("started_at", { ascending: false })
        .limit(limit);

      if (status) q = q.eq("status", status);
      if (sourceSlug) q = q.eq("fi_sources.slug", sourceSlug);

      const { data, error } = await q;
      if (error) return err(error.message, 500);
      return json({ rows: data ?? [] });
    }
  }

  // ── POST (insert) ─────────────────────────────────────────────────────────
  if (req.method === "POST") {
    if (table === "fi_fetch_runs" && action === "run") {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        body = {};
      }

      const source = typeof body.source === "string" && body.source.trim() ? body.source.trim() : null;
      const limitRaw = typeof body.limit === "number" ? body.limit : parseInt(String(body.limit ?? "30"), 10);
      const limitValue = Number.isFinite(limitRaw) ? Math.max(1, Math.min(80, limitRaw)) : 30;

      const fnRes = await fetch(`${supabaseUrl}/functions/v1/funding-ingest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: source ? "single" : "run",
          ...(source ? { source } : {}),
          limit: limitValue,
        }),
      });

      const payload = await fnRes.json().catch(() => ({}));
      if (!fnRes.ok) {
        const message = (payload as { error?: string; message?: string }).error
          ?? (payload as { message?: string }).message
          ?? `Funding ingest failed with HTTP ${fnRes.status}`;
        return err(message, fnRes.status);
      }
      return json(payload);
    }

    if (RUN_TABLES.has(table)) {
      return err("Run rows are system-managed. Use GET to inspect them.", 400);
    }
    if (SOURCE_TABLES.has(table)) return err("Source rows are seeded — use PATCH to update them.", 400);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return err("Invalid JSON body");
    }

    if (table === "vc_funds") {
      // If firm_record_id not supplied, create a firm_records row first.
      let firmId = typeof body.firm_record_id === "string" ? body.firm_record_id.trim() : "";
      if (!firmId) {
        const firmName = String(body.firm_name ?? "").trim();
        if (!firmName) return err("firm_record_id or firm_name is required");
        const { data: newFirm, error: firmErr } = await adminClient
          .from("firm_records")
          .insert({ firm_name: firmName, website_url: body.firm_website_url ?? null })
          .select("id")
          .single();
        if (firmErr) return err(`Failed to create firm: ${firmErr.message}`, 500);
        firmId = newFirm.id;
      }

      const fundName = String(body.name ?? "").trim();
      if (!fundName) return err("name (fund name) is required");

      const { firm_record_id: _fid, firm_name: _fn, firm_website_url: _fwu, ...rest } = body;
      const { data, error } = await adminClient
        .from("vc_funds")
        .insert({
          firm_record_id: firmId,
          name: fundName,
          normalized_name: fundName.toLowerCase(),
          normalized_key: `${firmId}__${fundName.toLowerCase().replace(/\s+/g, "_")}`,
          ...rest,
        })
        .select()
        .single();

      if (error) return err(error.message, 500);
      return json({ row: data }, 201);
    }

    if (table === "fi_deals_canonical") {
      const companyName = String(body.company_name ?? "").trim();
      if (!companyName) return err("company_name is required");

      const { data, error } = await adminClient
        .from("fi_deals_canonical")
        .insert({
          company_name: companyName,
          normalized_company_name: companyName.toLowerCase(),
          extraction_method: "admin_manual",
          ...body,
        })
        .select()
        .single();

      if (error) return err(error.message, 500);
      return json({ row: data }, 201);
    }
  }

  // ── PATCH (update) ────────────────────────────────────────────────────────
  if (req.method === "PATCH") {
    if (RUN_TABLES.has(table)) return err("Run rows are system-managed and cannot be edited here.", 400);
    if (!id) return err("id query param is required for PATCH");

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return err("Invalid JSON body");
    }

    const { data, error } = await adminClient
      .from(table)
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) return err(error.message, 500);
    return json({ row: data });
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    if (RUN_TABLES.has(table)) return err("Run rows are system-managed and cannot be deleted here.", 400);
    if (SOURCE_TABLES.has(table)) return err("Sources cannot be deleted. Use PATCH to disable them.", 400);
    if (!id) return err("id query param is required for DELETE");

    if (table === "vc_funds") {
      // Soft delete
      const { error } = await adminClient
        .from("vc_funds")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return err(error.message, 500);
    } else {
      const { error } = await adminClient.from(table).delete().eq("id", id);
      if (error) return err(error.message, 500);
    }

    return json({ ok: true });
  }

  return err("Method not allowed", 405);
});
