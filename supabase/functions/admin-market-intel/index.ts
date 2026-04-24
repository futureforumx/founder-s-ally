/**
 * admin-market-intel  v4
 *
 * GET  ?entity=companies|founders|operators|firms|deals  + filters
 *   → { rows, total }
 *
 * PATCH ?entity=<any>&id=<id>  body: { field: value, … }
 *   → { row }   (updated record)
 *
 * Auth: anon key in Authorization, WorkOS JWT in X-User-Auth.
 *       X-User-Auth may be sent with or without "Bearer " prefix.
 *       Service-role key used for all DB ops — RLS bypassed.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-auth",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function err(msg: string, status = 400) { return json({ error: msg }, status); }

/** Extract `sub` from a JWT. Accepts with or without "Bearer " prefix. */
function jwtSub(h: string | null): string | null {
  if (!h) return null;
  // Strip optional "Bearer " prefix (case-insensitive)
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : h.trim();
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const rem = b64.length % 4; if (rem) b64 += "=".repeat(4 - rem);
    const p = JSON.parse(atob(b64)) as Record<string, unknown>;
    const s = p?.sub;
    if (typeof s === "string" && s.trim()) return s.trim();
    if (typeof s === "number" && Number.isFinite(s)) return String(s);
  } catch { /* empty */ }
  return null;
}

async function assertAdmin(req: Request, db: ReturnType<typeof createClient>): Promise<string | null> {
  // X-User-Auth carries the signed-in user's JWT (WorkOS / Clerk)
  const xua = req.headers.get("X-User-Auth") ?? req.headers.get("x-user-auth") ?? "";
  const sub = jwtSub(xua) ?? jwtSub(req.headers.get("Authorization"));
  if (!sub) return "Missing or invalid bearer token";
  const { data, error } = await db.from("user_roles").select("permission").eq("user_id", sub).in("permission", ["admin", "god"]);
  if (error) return `Role lookup failed: ${error.message}`;
  if (!data?.length) return "Caller is not an admin";
  return null;
}

// ── Column sets ────────────────────────────────────────────────────────────────

const COMPANY_COLS = [
  "id","company_name","sector","stage","status",
  "hq","hq_city","hq_state","hq_country",
  "total_raised_usd","last_round_type","last_round_date","last_round_size_usd",
  "headcount","momentum_score","investor_fit_score",
  "company_url","description_short","description_long","yc_batch",
  "linkedin_url","twitter_url","founded_year",
  "needs_enrichment","enrichment_status",
  "lead_investor_names","investor_names","logo_url","created_at","updated_at",
].join(", ");

const FOUNDER_COLS = [
  "id","full_name","role","startup_id",
  "is_repeat_founder","has_prior_exit","operator_to_founder",
  "track_record_score","location","domain_expertise",
  "prior_companies","founder_archetype","linkedin_url","email",
  "enrichment_status","created_at","updated_at",
].join(", ");

const OPERATOR_COLS = [
  "id","full_name","title","sector_focus","expertise","prior_companies",
  "completeness_score","enrichment_status","is_available","ready_for_live",
  "city","state","country","linkedin_url","email","stage_focus","source","updated_at","created_at",
].join(", ");

const FIRM_COLS = [
  "id","firm_name","slug","tagline","elevator_pitch","description",
  "hq_city","hq_state","hq_country",
  "website_url","logo_url","linkedin_url","email","phone",
  "aum_usd","founded_year","current_fund_name","lead_or_follow",
  "stage_focus","thesis_verticals",
  "enrichment_status","completeness_score",
  "needs_review","ready_for_live","manual_review_status","updated_at",
].join(", ");

const DEAL_COLS = [
  "id","company_name","company_domain","company_logo_url",
  "sector_normalized","round_type_normalized",
  "amount_minor_units","currency","announced_date",
  "lead_investor_normalized","co_investors",
  "needs_review","review_reason","is_rumor",
  "confidence_score","source_count",
  "primary_source_url","primary_press_url",
  "extracted_summary","created_at",
].join(", ");

// ── Table map ──────────────────────────────────────────────────────────────────

const TABLE: Record<string, string> = {
  companies: "startups",
  founders:  "startup_founders",
  operators: "operator_profiles",
  firms:     "firm_records",
  deals:     "fi_deals_canonical",
};

const PROTECTED = new Set(["id","created_at","deleted_at","sector_embedding","updated_at"]);

// ── Main ───────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const authErr = await assertAdmin(req, db);
  if (authErr) return err(authErr, 403);

  const url    = new URL(req.url);
  const entity = url.searchParams.get("entity") ?? "companies";
  const search = url.searchParams.get("search")?.trim() ?? "";
  const limit  = Math.min(parseInt(url.searchParams.get("limit")  ?? "30"), 100);
  // Accept both "page" (0-indexed) and "offset" params
  const pageParam   = url.searchParams.get("page");
  const offsetParam = url.searchParams.get("offset");
  const offset = pageParam != null
    ? Math.max(parseInt(pageParam) * limit, 0)
    : Math.max(parseInt(offsetParam ?? "0"), 0);

  // ── PATCH: universal update ────────────────────────────────────────────────
  if (req.method === "PATCH") {
    const id    = url.searchParams.get("id");
    const table = TABLE[entity];
    if (!id)    return err("Missing id");
    if (!table) return err(`Unknown entity: ${entity}`);

    const body  = await req.json().catch(() => ({})) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!PROTECTED.has(k)) patch[k] = v;
    }
    if (!Object.keys(patch).length) return err("No patchable fields");
    patch.updated_at = new Date().toISOString();

    const { data, error } = await db.from(table).update(patch).eq("id", id).select("*").single();
    if (error) return err(error.message, 500);
    return json({ row: data });
  }

  // ── GET ────────────────────────────────────────────────────────────────────

  if (entity === "companies") {
    const stage  = url.searchParams.get("stage")  ?? "";
    const status = url.searchParams.get("status") ?? "";
    let q = db.from("startups").select(COMPANY_COLS, { count: "exact" })
      .is("deleted_at", null).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (search) q = q.ilike("company_name", `%${search}%`);
    if (stage)  q = q.eq("stage",  stage);
    if (status) q = q.eq("status", status);
    const { data, error, count } = await q;
    if (error) return err(error.message, 500);
    return json({ rows: data ?? [], total: count ?? 0 });
  }

  if (entity === "founders") {
    const repeat = url.searchParams.get("repeat") ?? "";
    const exit   = url.searchParams.get("exit")   ?? "";
    let q = db.from("startup_founders").select(FOUNDER_COLS, { count: "exact" })
      .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (search)             q = q.ilike("full_name", `%${search}%`);
    if (repeat === "true")  q = q.eq("is_repeat_founder", true);
    if (repeat === "false") q = q.eq("is_repeat_founder", false);
    if (exit   === "true")  q = q.eq("has_prior_exit", true);
    if (exit   === "false") q = q.eq("has_prior_exit", false);
    const { data, error, count } = await q;
    if (error) return err(error.message, 500);
    return json({ rows: data ?? [], total: count ?? 0 });
  }

  if (entity === "operators") {
    const available  = url.searchParams.get("available")  ?? "";
    const enrichment = url.searchParams.get("enrichment") ?? "";
    let q = db.from("operator_profiles").select(OPERATOR_COLS, { count: "exact" })
      .is("deleted_at", null).order("completeness_score", { ascending: false }).range(offset, offset + limit - 1);
    if (search)               q = q.ilike("full_name", `%${search}%`);
    if (available === "true")  q = q.eq("is_available", true);
    if (available === "false") q = q.eq("is_available", false);
    if (enrichment)            q = q.eq("enrichment_status", enrichment);
    const { data, error, count } = await q;
    if (error) return err(error.message, 500);
    return json({ rows: data ?? [], total: count ?? 0 });
  }

  if (entity === "firms") {
    const enrichment = url.searchParams.get("enrichment")     ?? "";
    const review     = url.searchParams.get("needs_review")   ?? "";
    const live       = url.searchParams.get("ready_for_live")  ?? "";
    let q = db.from("firm_records").select(FIRM_COLS, { count: "exact" })
      .is("deleted_at", null).order("completeness_score", { ascending: false }).range(offset, offset + limit - 1);
    if (search)             q = q.ilike("firm_name", `%${search}%`);
    if (enrichment)         q = q.eq("enrichment_status", enrichment);
    if (review === "true")  q = q.eq("needs_review", true);
    if (review === "false") q = q.eq("needs_review", false);
    if (live   === "true")  q = q.eq("ready_for_live", true);
    if (live   === "false") q = q.eq("ready_for_live", false);
    const { data, error, count } = await q;
    if (error) return err(error.message, 500);
    return json({ rows: data ?? [], total: count ?? 0 });
  }

  if (entity === "deals") {
    const needs_review = url.searchParams.get("needs_review") ?? "";
    const round_type   = url.searchParams.get("round_type")   ?? "";
    const is_rumor     = url.searchParams.get("is_rumor")     ?? "";
    let q = db.from("fi_deals_canonical").select(DEAL_COLS, { count: "exact" })
      .order("announced_date", { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);
    if (search)                   q = q.ilike("company_name", `%${search}%`);
    if (needs_review === "true")  q = q.eq("needs_review", true);
    if (needs_review === "false") q = q.eq("needs_review", false);
    if (is_rumor     === "true")  q = q.eq("is_rumor", true);
    if (is_rumor     === "false") q = q.eq("is_rumor", false);
    if (round_type)               q = q.eq("round_type_normalized", round_type);
    const { data, error, count } = await q;
    if (error) return err(error.message, 500);
    return json({ rows: data ?? [], total: count ?? 0 });
  }

  return err(`Unknown entity: ${entity}`);
});
