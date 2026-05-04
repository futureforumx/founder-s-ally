/**
 * admin-market-intel  v4
 *
 * GET  ?entity=companies|founders|operators|firms|deals  + filters
 *   → { rows, total }
 *
 * PATCH ?entity=<any>&id=<id>  body: { field: value, … }
 *   → { row }   (updated record)
 *
 * Auth: anon key in Authorization, signed-in user JWT in X-User-Auth.
 *       X-User-Auth may be sent with or without "Bearer " prefix.
 *       Service-role key used for all DB ops — RLS bypassed.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autoPermissionForEmail,
  clampGodModeToDesignatedEmail,
  hasAdminConsoleAccess,
  type AppPermission,
} from "../_shared/app-admin-email.ts";
import { resolveAdminCaller } from "../_shared/admin-resolve-caller.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-auth",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function err(msg: string, status = 400) { return json({ error: msg }, status); }

function asPermission(v: unknown): AppPermission | null {
  const p = String(v ?? "").toLowerCase();
  if (p === "user" || p === "manager" || p === "admin" || p === "god") return p as AppPermission;
  return null;
}

function highestPermission(...candidates: Array<AppPermission | null>): AppPermission {
  const rank: Record<AppPermission, number> = { user: 0, manager: 1, admin: 2, god: 3 };
  let best: AppPermission = "user";
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (rank[candidate] > rank[best]) best = candidate;
  }
  return best;
}

/** When `firm_records.domain` is missing (older DBs), mirror RPC behavior from `website_url`. */
function firmDomainFromWebsiteUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim();
  try {
    const u = s.includes("://") ? new URL(s) : new URL(`https://${s}`);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

function bearerize(authHeader: string | null): string | null {
  const h = authHeader?.trim();
  if (!h) return null;
  return h.toLowerCase().startsWith("bearer ") ? h : `Bearer ${h}`;
}

async function assertAdmin(
  req: Request,
  db: SupabaseClient,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<string | null> {
  const authHeader =
    bearerize(req.headers.get("X-User-Auth") ?? req.headers.get("x-user-auth")) ??
    bearerize(req.headers.get("Authorization"));
  if (!authHeader) return "Missing authorization";

  const resolved = await resolveAdminCaller(authHeader, supabaseUrl, supabaseAnonKey);
  if ("error" in resolved) return resolved.error;

  const roleIds = resolved.identityUserIds.length ? resolved.identityUserIds : [resolved.id];
  const { data: roleRows, error } = await db.from("user_roles").select("permission").in("user_id", roleIds);
  if (error) return `Role lookup failed: ${error.message}`;

  let roleFromDb: AppPermission | null = null;
  for (const row of roleRows ?? []) {
    roleFromDb = highestPermission(roleFromDb, asPermission(row.permission));
  }

  const callerPermission = clampGodModeToDesignatedEmail(
    highestPermission(
      roleFromDb,
      asPermission(resolved.user_metadata?.role),
      autoPermissionForEmail(resolved.email),
    ),
    resolved.email,
  );

  if (!hasAdminConsoleAccess(callerPermission)) return "Caller is not an admin";
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
  "id","firm_name","legal_name","aliases","alternate_names","slug","tagline","elevator_pitch","description","sentiment_detail",
  "location","address","hq_city","hq_state","hq_zip_code","hq_country","locations",
  "website_url","contact_page_url","logo_url","favicon_url","linkedin_url","x_url",
  "facebook_url","instagram_url","youtube_url","substack_url","medium_url","email","phone",
  "crunchbase_url","signal_nfx_url","cb_insights_url","openvc_url","pitchbook_url","vcsheet_url",
  "aum","aum_usd","founded_year","current_fund_name","lead_partner","lead_or_follow",
  "preferred_stage","stage_focus","thesis_verticals","strategy_classifications",
  "firm_type","entity_type","min_check_size","max_check_size","total_headcount",
  "market_sentiment","recent_deals","is_actively_deploying",
  "enrichment_status","completeness_score",
  "status","needs_review","ready_for_live","manual_review_status","updated_at",
].join(", ");

const FIRM_INVESTOR_COLS = [
  "id","firm_id","full_name","title","email","linkedin_url","x_url","website_url",
  "city","state","country","is_active","is_actively_investing",
  "stage_focus","sector_focus","personal_thesis_tags","portfolio_companies",
  "short_summary","bio","needs_review","ready_for_live","updated_at",
].join(", ");

const FIRM_PORTFOLIO_COLS = [
  "id","firm_id","company_name","normalized_company_name","amount","stage","date_announced",
  "investment_status","is_notable","portfolio_company_website","portfolio_company_linkedin",
  "source_name","source_url","source_confidence","updated_at",
].join(", ");

const DEAL_COLS = [
  "id","company_name","company_domain","company_website","company_logo_url",
  "company_linkedin_url","company_location",
  "sector_raw","sector_normalized","round_type_raw","round_type_normalized",
  "amount_raw","amount_minor_units","currency","announced_date",
  "lead_investor","lead_investor_normalized","co_investors",
  "needs_review","review_reason","is_rumor",
  "confidence_score","source_count",
  "primary_source_name","primary_source_url","primary_press_url","source_type",
  "extracted_summary","extraction_method","created_at","updated_at",
].join(", ");

// ── Table map ──────────────────────────────────────────────────────────────────

const TABLE: Record<string, string> = {
  companies: "startups",
  founders:  "startup_founders",
  operators: "operator_profiles",
  firms:     "firm_records",
  "firm-investors": "firm_investors",
  "firm-portfolio": "firm_recent_deals",
  deals:     "fi_deals_canonical",
};

const PROTECTED = new Set(["id","created_at","deleted_at","sector_embedding","updated_at"]);

/** Plain `vc_funds` columns — no PostgREST embed (see `firm_records.latest_verified_vc_fund_id` ↔ `vc_funds.id`). */
const VCFUND_COLS = [
  "id", "firm_record_id", "name", "fund_type", "fund_sequence_number", "vintage_year",
  "announced_date", "close_date", "target_size_usd", "final_size_usd", "currency", "status",
  "source_confidence", "source_count", "announcement_url", "announcement_title",
  "stage_focus", "sector_focus", "geography_focus", "likely_actively_deploying",
  "active_deployment_window_start", "active_deployment_window_end",
  "manually_verified", "verification_status", "created_at", "updated_at",
].join(", ");

/** Omit `domain`: not present on all deployed DBs (added in migration 20260418150000). Derive in `freshFundRow`. */
const FIRM_SNAPSHOT_COLS = [
  "id", "firm_name", "website_url", "logo_url", "location", "hq_city", "hq_state", "hq_country",
  "aum", "aum_usd", "has_fresh_capital", "fresh_capital_priority_score",
].join(", ");

async function loadFirmMap(
  client: SupabaseClient,
  firmRecordIds: string[],
): Promise<{ map: Map<string, Record<string, unknown>>; error: string | null }> {
  const unique = [...new Set(firmRecordIds.filter((id) => typeof id === "string" && id.length > 0))];
  const map = new Map<string, Record<string, unknown>>();
  if (!unique.length) return { map, error: null };
  const { data, error } = await client.from("firm_records").select(FIRM_SNAPSHOT_COLS).in("id", unique);
  if (error) return { map, error: error.message };
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    if (typeof r.id === "string") map.set(r.id, r);
  }
  return { map, error: null };
}

function freshFundRow(fund: Record<string, unknown>, firm: Record<string, unknown> | null) {
  return {
    id: fund.id,
    firm_record_id: fund.firm_record_id,
    firm_name: firm?.firm_name ?? null,
    firm_website_url: firm?.website_url ?? null,
    firm_logo_url: firm?.logo_url ?? null,
    firm_domain:
      (typeof firm?.domain === "string" && firm.domain.trim()
        ? firm.domain.trim()
        : firmDomainFromWebsiteUrl(firm?.website_url)),
    firm_location: firm?.location ?? null,
    firm_hq_city: firm?.hq_city ?? null,
    firm_hq_state: firm?.hq_state ?? null,
    firm_hq_country: firm?.hq_country ?? null,
    firm_aum: firm?.aum ?? null,
    firm_aum_usd: firm?.aum_usd ?? null,
    has_fresh_capital: firm?.has_fresh_capital ?? null,
    fresh_capital_priority_score: firm?.fresh_capital_priority_score ?? null,
    fund_name: fund.name,
    fund_type: fund.fund_type,
    fund_sequence_number: fund.fund_sequence_number,
    vintage_year: fund.vintage_year,
    announced_date: fund.announced_date,
    close_date: fund.close_date,
    target_size_usd: fund.target_size_usd,
    final_size_usd: fund.final_size_usd,
    currency: fund.currency,
    status: fund.status,
    source_confidence: fund.source_confidence,
    source_count: fund.source_count,
    announcement_url: fund.announcement_url,
    announcement_title: fund.announcement_title,
    stage_focus: fund.stage_focus,
    sector_focus: fund.sector_focus,
    geography_focus: fund.geography_focus,
    likely_actively_deploying: fund.likely_actively_deploying,
    active_deployment_window_start: fund.active_deployment_window_start,
    active_deployment_window_end: fund.active_deployment_window_end,
    manually_verified: fund.manually_verified,
    verification_status: fund.verification_status,
    created_at: fund.created_at,
    updated_at: fund.updated_at,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const authErr = await assertAdmin(req, db, supabaseUrl, supabaseAnonKey);
  if (authErr) return err(authErr, 403);

  const url = new URL(req.url);
  /** Normalize so PATCH/GET match even if clients send `fresh_funds` or different casing. */
  const entity = (() => {
    const raw = url.searchParams.get("entity")?.trim() ?? "";
    if (!raw) return "companies";
    return raw.toLowerCase().replace(/_/g, "-");
  })();
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
    if (entity === "fresh-funds") {
      if (!id) return err("Missing id");
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;

      const fundKeys = new Set([
        "name","fund_type","fund_sequence_number","vintage_year",
        "announced_date","close_date","target_size_usd","final_size_usd","currency","status",
        "source_confidence","source_count","announcement_url","announcement_title",
        "stage_focus","sector_focus","geography_focus","likely_actively_deploying",
        "active_deployment_window_start","active_deployment_window_end",
        "manually_verified","verification_status",
      ]);
      const firmKeys = new Set([
        "firm_name","website_url","logo_url","location","hq_city","hq_state","hq_country",
        "aum","aum_usd","has_fresh_capital","fresh_capital_priority_score",
      ]);

      const fundPatch: Record<string, unknown> = {};
      const firmPatch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body)) {
        if (fundKeys.has(k)) fundPatch[k] = v;
        if (firmKeys.has(k)) firmPatch[k] = v;
      }

      const { data: fundRef, error: refErr } = await db
        .from("vc_funds")
        .select("firm_record_id")
        .eq("id", id)
        .single();
      if (refErr || !fundRef) return err(refErr?.message ?? "Fund not found", 404);

      if (Object.keys(fundPatch).length) {
        fundPatch.updated_at = new Date().toISOString();
        const { error } = await db.from("vc_funds").update(fundPatch).eq("id", id);
        if (error) return err(error.message, 500);
      }

      if (Object.keys(firmPatch).length) {
        firmPatch.updated_at = new Date().toISOString();
        const { error } = await db.from("firm_records").update(firmPatch).eq("id", fundRef.firm_record_id);
        if (error) return err(error.message, 500);
      }

      const { data: fundOut, error: outErr } = await db
        .from("vc_funds")
        .select(VCFUND_COLS)
        .eq("id", id)
        .single();
      if (outErr || !fundOut) return err(outErr?.message ?? "Fund not found", 500);
      const frId = typeof fundOut.firm_record_id === "string" ? fundOut.firm_record_id : null;
      const { data: firmOut } = frId
        ? await db.from("firm_records").select(FIRM_SNAPSHOT_COLS).eq("id", frId).maybeSingle()
        : { data: null };
      return json({
        row: freshFundRow(
          fundOut as Record<string, unknown>,
          (firmOut as Record<string, unknown> | null) ?? null,
        ),
      });
    }

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

  if (entity === "fresh-funds") {
    const stage = url.searchParams.get("stage") ?? "";
    let q = db.from("vc_funds").select(VCFUND_COLS, { count: "exact" })
      .is("deleted_at", null)
      .order("announced_date", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    if (search) q = q.ilike("name", `%${search}%`);
    if (stage) q = q.contains("stage_focus", [stage]);
    const { data, error, count } = await q;
    if (error) return err(error.message, 500);
    const fundRows = (data ?? []) as Record<string, unknown>[];
    const firmIds = fundRows
      .map((r) => (typeof r.firm_record_id === "string" ? r.firm_record_id : null))
      .filter((x): x is string => x != null && x.length > 0);
    const { map: firmMap, error: firmErr } = await loadFirmMap(db, firmIds);
    if (firmErr) return err(firmErr, 500);
    const rows = fundRows.map((f) =>
      freshFundRow(f, firmMap.get(String(f.firm_record_id)) ?? null),
    );
    return json({ rows, total: count ?? 0 });
  }

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
    const status     = url.searchParams.get("status")          ?? "";
    let q = db.from("firm_records").select(FIRM_COLS, { count: "exact" })
      .is("deleted_at", null).order("completeness_score", { ascending: false }).range(offset, offset + limit - 1);
    if (search)             q = q.ilike("firm_name", `%${search}%`);
    if (enrichment)         q = q.eq("enrichment_status", enrichment);
    if (review === "true")  q = q.eq("needs_review", true);
    if (review === "false") q = q.eq("needs_review", false);
    if (live   === "true")  q = q.eq("ready_for_live", true);
    if (live   === "false") q = q.eq("ready_for_live", false);
    if (status)             q = q.eq("status", status);
    const { data, error, count } = await q;
    if (error) return err(error.message, 500);
    return json({ rows: data ?? [], total: count ?? 0 });
  }

  if (entity === "firm-investors") {
    const firmId = url.searchParams.get("firm_id")?.trim() ?? "";
    if (!firmId) return err("Missing firm_id");
    let q = db.from("firm_investors").select(FIRM_INVESTOR_COLS, { count: "exact" })
      .eq("firm_id", firmId)
      .is("deleted_at", null)
      .order("full_name", { ascending: true })
      .range(offset, offset + limit - 1);
    if (search) q = q.ilike("full_name", `%${search}%`);
    const { data, error, count } = await q;
    if (error) return err(error.message, 500);
    return json({ rows: data ?? [], total: count ?? 0 });
  }

  if (entity === "firm-portfolio") {
    const firmId = url.searchParams.get("firm_id")?.trim() ?? "";
    if (!firmId) return err("Missing firm_id");
    let q = db.from("firm_recent_deals").select(FIRM_PORTFOLIO_COLS, { count: "exact" })
      .eq("firm_id", firmId)
      .order("date_announced", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    if (search) q = q.ilike("company_name", `%${search}%`);
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
