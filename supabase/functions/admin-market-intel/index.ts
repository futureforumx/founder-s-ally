/**
 * admin-market-intel  v4
 *
 * GET  ?entity=companies|founders|operators|firms|fresh-funds|firm-funds|deals|fi-sources|fc-enrichment-settings|fi-fetch-runs|vc-fund-sync-runs|vc-fund-sync-latest|latest-vc-daily-sync  + filters
 *   → { rows, total }
 *   - firm-funds: **requires** ?firm_id=<firm_records.id> — only vc_funds for that firm (Firm Records admin).
 *   - fresh-funds: global Fund Watch list; optional ?firm_record_id=… to filter one firm.
 *   - fi-sources: Latest Funding ingestion source registry (editable via PATCH entity=fi-sources&id=). Alias: ?entity=fisources
 *   - fc-enrichment-settings: Singleton row for Fund Watch vs Latest Funding operator notes (PATCH without id). Aliases: fcenrichmentsettings, fc-enrichment
 *   - tool-category-page: Editable Tools directory hero for one category slug (GET/PATCH ?slug=ai-agents|…). Aliases: toolcategorypage
 *   - fi-fetch-runs: Recent fi_fetch_runs (merged with source slug/name).
 *   - vc-fund-sync-runs: Recent vc_fund_sync_runs history.
 *   - vc-fund-sync-latest: One row per phase (view vc_fund_sync_latest_runs).
 *   - latest-vc-daily-sync: View v_latest_vc_fund_sync (last successful daily job).
 *
 * PATCH ?entity=<any>&id=<id>  body: { field: value, … }
 *   → { row }   (updated record)
 *
 * POST ?entity=fresh-funds|deals|firms  body: { … }  → { row }  (create)
 *   - firms: requires `firm_name`; optional `website_url`, `slug`, `legal_name`. New rows default to needs-review / not live.
 *
 * DELETE ?entity=fresh-funds|deals&id=<uuid>
 *   → { ok: true }   (fresh-funds: soft-delete vc_funds.deleted_at; deals: hard-delete fi_deals_canonical row)
 *
 * POST ?entity=fresh-funds|deals&id=<uuid>&action=delete  body: {} (optional)
 *   → same as DELETE — **preferred from browsers** when DELETE fails with “Failed to fetch” (CORS/proxy).
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
  "Access-Control-Allow-Methods": "GET, PATCH, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function err(msg: string, status = 400) { return json({ error: msg }, status); }

/** Match `firm_records.id` query params without treating them as a name search. */
function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

/** Max rows pulled from `search_firm_records` before secondary filters + pagination (admin-only). */
const FIRM_SEARCH_RPC_CAP = 25_000;

function searchFirmRecordsWrongRpcShape(error: { message?: string; code?: string; details?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const t = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    t.includes("schema cache") ||
    t.includes("could not find the function") ||
    t.includes("does not exist")
  );
}

async function rpcSearchFirmRecordsCompat(
  db: SupabaseClient,
  payload: { p_limit: number; p_query: string; p_ready_for_live: boolean | null },
) {
  /** Current migrations expose a single `search_firm_records(args jsonb)` — try that first. */
  const jsonbTry = await db.rpc("search_firm_records", { args: payload });
  if (!jsonbTry.error) return jsonbTry;

  const tryLegacy =
    searchFirmRecordsWrongRpcShape(jsonbTry.error) || jsonbTry.error.code === "PGRST202";
  if (!tryLegacy) return jsonbTry;

  const legacyTry = await db.rpc("search_firm_records", payload);
  if (!legacyTry.error) return legacyTry;

  if (searchFirmRecordsWrongRpcShape(legacyTry.error)) return jsonbTry;
  return legacyTry;
}

/** PostgREST `.or()` breaks on commas in values — strip them. Escape `%` / `_` for `ilike`. */
function firmAdminBroadOrClause(raw: string): string | null {
  const t = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (t.length < 2) return null;
  const esc = t.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const pat = `%${esc}%`;
  /** Omit `normalized_name` — some DBs pre-date that column; RPC still fuzzy-matches on normalized_name when present. */
  return `firm_name.ilike.${pat},legal_name.ilike.${pat},slug.ilike.${pat}`;
}

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

/** Columns must exist on `public.startups` (see generated types — no legacy `hq` / `twitter_url`). */
const COMPANY_COLS = [
  "id","company_name","sector","stage","status",
  "hq_city","hq_state","hq_country","location",
  "total_raised_usd","last_round_type","last_round_date","last_round_size_usd",
  "headcount","momentum_score","investor_fit_score",
  "company_url","description_short","description_long","yc_batch",
  "linkedin_url","x_url","founded_year",
  "lead_investor_names","investor_names","logo_url","created_at","updated_at",
].join(", ");

const FOUNDER_COLS = [
  "id","full_name","role","startup_id",
  "is_repeat_founder","has_prior_exit","operator_to_founder",
  "track_record_score","location","domain_expertise",
  "prior_companies","founder_archetype","linkedin_url","email",
  "created_at","updated_at",
].join(", ");

const OPERATOR_COLS = [
  "id","full_name","title","sector_focus","expertise","prior_companies",
  "completeness_score","enrichment_status","is_available","ready_for_live",
  "city","state","country","linkedin_url","email","stage_focus","source","updated_at","created_at",
].join(", ");

const FIRM_COLS = [
  "id","firm_name","legal_name","aliases","alternate_names","slug","tagline","elevator_pitch","description","sentiment_detail",
  "team_people_url",
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
  "id","firm_id","created_at","updated_at","deleted_at",
  "full_name","first_name","last_name","preferred_name","alternate_names","slug","title","seniority","investor_type",
  "email","phone","linkedin_url","x_url","website_url","personal_website","firm_bio_page_url",
  "facebook_url","instagram_url","youtube_url","tiktok_url","medium_url","substack_url","tracxn_url",
  "city","state","country","timezone",
  "avatar_url","headshot_url","avatar_source_url","avatar_source_type","avatar_confidence","avatar_last_verified_at","avatar_needs_review",
  "is_active","is_actively_investing","cold_outreach_ok","warm_intro_preferred","needs_review","ready_for_live",
  "stage_focus","sector_focus","personal_thesis_tags","portfolio_companies","geographic_focus","domain_expertise","investing_themes",
  "current_areas_of_interest","notable_investments","networks","board_seats","prior_firms","prior_firm_associations",
  "stage_concentration","geographic_concentration","thematic_concentration","sub_sectors",
  "short_summary","bio","background_summary","education_summary","founder_background","operator_background","recent_focus",
  "avg_deal_size","check_size_min","check_size_max","sweet_spot","lead_vs_follow","investment_pace","investment_style",
  "total_known_investments","recent_deal_count","last_active_date","last_capital_signal_at","last_enriched_at",
  "match_score","network_strength","reputation_score","responsiveness_score","value_add_score","capital_freshness_boost_score",
  "completeness_score","enrichment_status","source_count","prisma_person_id",
  "articles","blog_posts","interviews","podcasts","past_investments","recent_investments","recent_news",
  "last_3_investments","last_5_investments","co_investors","prior_roles",
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

const FI_SOURCES_COLS = [
  "id","slug","name","base_url","adapter_key","source_type","credibility_score",
  "active","poll_interval_minutes","metadata","last_fetched_at","created_at","updated_at",
].join(", ");

const FI_FETCH_RUN_COLS = [
  "id","source_id","run_mode","status","started_at","completed_at",
  "docs_fetched","docs_parsed","deals_raw","deals_upserted","error_count","error_summary","metadata",
].join(", ");

const VC_FUND_SYNC_RUN_COLS = [
  "id","phase","status","dry_run","scope_firm_id","scope_cluster_key","options","stats",
  "error_message","started_at","completed_at","created_at","updated_at",
].join(", ");

/** Allowed PATCH fields for fi_sources (slug / adapter are immutable here) */
const FI_SOURCES_PATCH_KEYS = new Set([
  "active",
  "poll_interval_minutes",
  "credibility_score",
  "name",
  "metadata",
]);

const FC_ENRICHMENT_SETTINGS_PATCH_KEYS = new Set([
  "fund_watch_source_keys",
  "fund_watch_schedule_note",
  "latest_funding_schedule_note",
  "process_notes",
]);

/** Matches `TOOL_CATEGORY_SLUGS` in app — public /tools/:slug pages */
const TOOL_CATEGORY_PAGE_SLUGS = new Set(["ai-agents", "ai-models", "ai-skills", "startup-tools"]);
const TOOL_CATEGORY_PAGE_PATCH_KEYS = new Set(["title", "description", "meta"]);

// ── Entity param normalization (Unicode hyphens, spaces, zero-width, etc.) ───

/**
 * Canonical form for ?entity= routing. Ensures `firm-investors` matches even when the client
 * sends underscore, unicode dashes (U+2010…U+2015, minus sign), or stray zero-width chars.
 */
function canonicalEntityParam(raw: string | null | undefined): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  s = s.toLowerCase();
  s = s.replace(/\s+/g, "-");
  s = s.replace(/_/g, "-");
  // Hyphen/minus compatibility: treat all dash-like code points as ASCII hyphen
  s = s.replace(/[\u002D\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s.normalize("NFKC");
  s = s.replace(/-+/g, "-");
  return s.trim();
}

// ── Table map ──────────────────────────────────────────────────────────────────

/** Maps canonical ?entity= values to PostgREST table names. */
function resolveEntityTable(entityCanonical: string): string | undefined {
  const n = entityCanonical;
  const map: Record<string, string> = {
    companies: "startups",
    founders: "startup_founders",
    operators: "operator_profiles",
    firms: "firm_records",
    "firm-investors": "firm_investors",
    firminvestors: "firm_investors",
    investors: "firm_investors",
    "firm-portfolio": "firm_recent_deals",
    firmportfolio: "firm_recent_deals",
    deals: "fi_deals_canonical",
  };
  return map[n];
}

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

const VC_FUND_STATUS_ALLOWED = new Set([
  "announced",
  "target",
  "first_close",
  "final_close",
  "inferred_active",
  "historical",
]);

/** Deterministic key fragment for vc_funds.normalized_key (aligned with app normalize helpers). */
function normalizeFundNameKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFundNormalizedKey(firmRecordId: string, fundName: string, vintageYear: number | null | undefined): string {
  const vy =
    vintageYear != null && Number.isFinite(vintageYear)
      ? String(Math.floor(Number(vintageYear)))
      : "unknown";
  return `${firmRecordId}:${normalizeFundNameKey(fundName)}:${vy}`;
}

/** Alternate ?entity= spellings (no hyphen, shortened) — keeps routing stable across proxies/clients */
function normalizeAdminEntity(e: string): string {
  const aliases: Record<string, string> = {
    fisources: "fi-sources",
    fifetchruns: "fi-fetch-runs",
    vcfundsyncruns: "vc-fund-sync-runs",
    vcfundsynclatest: "vc-fund-sync-latest",
    latestvcdailysync: "latest-vc-daily-sync",
    "fresh-capital-enrichment-settings": "fc-enrichment-settings",
    fcenrichmentsettings: "fc-enrichment-settings",
    fcenrichment: "fc-enrichment-settings",
    "fc-enrichment": "fc-enrichment-settings",
    toolcategorypages: "tool-category-page",
    toolcategorypage: "tool-category-page",
  };
  return aliases[e] ?? e;
}

/** Soft-delete fund or hard-delete deal — shared by DELETE and POST ?action=delete */
async function adminDeleteResource(db: SupabaseClient, entity: string, id: string): Promise<Response> {
  const now = new Date().toISOString();
  if (entity === "fresh-funds") {
    const { data, error } = await db
      .from("vc_funds")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) return err(error.message, 500);
    if (!data) return err("Fund not found or already deleted", 404);
    return json({ ok: true });
  }
  if (entity === "deals") {
    const { data, error } = await db.from("fi_deals_canonical").delete().eq("id", id).select("id").maybeSingle();
    if (error) return err(error.message, 500);
    if (!data) return err("Deal not found", 404);
    return json({ ok: true });
  }
  return err(`Delete not supported for entity: ${entity}`, 400);
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
  /** Canonical entity key for routing (empty → default list entity). */
  let entity = (() => {
    const c = canonicalEntityParam(url.searchParams.get("entity"));
    return c.length ? c : "companies";
  })();
  entity = normalizeAdminEntity(entity);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const limit  = Math.min(parseInt(url.searchParams.get("limit")  ?? "30"), 100);
  // Accept both "page" (0-indexed) and "offset" params
  const pageParam   = url.searchParams.get("page");
  const offsetParam = url.searchParams.get("offset");
  const offset = pageParam != null
    ? Math.max(parseInt(pageParam) * limit, 0)
    : Math.max(parseInt(offsetParam ?? "0"), 0);

  // ── DELETE: fund (soft) or deal (hard) ───────────────────────────────────
  if (req.method === "DELETE") {
    const id = url.searchParams.get("id")?.trim() ?? "";
    if (!id) return err("Missing id", 400);
    return adminDeleteResource(db, entity, id);
  }

  // ── POST: create fresh fund, canonical deal, or firm record ────────────────
  if (req.method === "POST") {
    const action = url.searchParams.get("action")?.trim().toLowerCase() ?? "";
    if (action === "delete") {
      const id = url.searchParams.get("id")?.trim() ?? "";
      if (!id) return err("Missing id", 400);
      return adminDeleteResource(db, entity, id);
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    if (entity === "fresh-funds") {
      const firmRecordId = typeof body.firm_record_id === "string" ? body.firm_record_id.trim() : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!firmRecordId) return err("firm_record_id is required", 400);
      if (!name) return err("name (fund name) is required", 400);

      const { data: firmOk, error: firmErr } = await db
        .from("firm_records")
        .select("id")
        .eq("id", firmRecordId)
        .maybeSingle();
      if (firmErr) return err(firmErr.message, 500);
      if (!firmOk) return err("No firm_records row found for firm_record_id", 404);

      const vyRaw = body.vintage_year;
      const vintageYear =
        typeof vyRaw === "number"
          ? vyRaw
          : typeof vyRaw === "string" && vyRaw.trim() !== ""
            ? Number.parseInt(vyRaw, 10)
            : null;
      const vyEffective =
        vintageYear != null && Number.isFinite(vintageYear) ? vintageYear : undefined;

      const normalizedName = normalizeFundNameKey(name);
      const normalizedKey = buildFundNormalizedKey(firmRecordId, name, vyEffective);

      const statusRaw = typeof body.status === "string" ? body.status.trim() : "announced";
      const status = VC_FUND_STATUS_ALLOWED.has(statusRaw) ? statusRaw : "announced";

      const fundInsert: Record<string, unknown> = {
        firm_record_id: firmRecordId,
        name,
        normalized_name: normalizedName,
        normalized_key: normalizedKey,
        currency: typeof body.currency === "string" && body.currency.length === 3 ? body.currency : "USD",
        status,
        source_confidence: typeof body.source_confidence === "number" ? body.source_confidence : 0.95,
        source_count: typeof body.source_count === "number" ? body.source_count : 1,
        freshness_synced_at: new Date().toISOString(),
        manually_verified: true,
        verification_status: "manual_reviewed",
        is_new_fund_signal: true,
        stage_focus: Array.isArray(body.stage_focus) ? body.stage_focus : [],
        sector_focus: Array.isArray(body.sector_focus) ? body.sector_focus : [],
        geography_focus: Array.isArray(body.geography_focus) ? body.geography_focus : [],
        field_confidence: {},
        field_provenance: {},
        metadata: { created_via: "admin_market_intel_post" },
      };

      const optionalScalars = [
        "fund_type",
        "fund_sequence_number",
        "vintage_year",
        "announced_date",
        "close_date",
        "target_size_usd",
        "final_size_usd",
        "announcement_url",
        "announcement_title",
        "likely_actively_deploying",
        "active_deployment_window_start",
        "active_deployment_window_end",
      ] as const;
      for (const k of optionalScalars) {
        if (body[k] !== undefined && body[k] !== "") fundInsert[k] = body[k];
      }

      const { data: inserted, error: insErr } = await db
        .from("vc_funds")
        .insert(fundInsert)
        .select(VCFUND_COLS)
        .single();

      if (insErr) {
        const code = (insErr as { code?: string }).code;
        if (code === "23505") {
          return err("A fund with this normalized key already exists (duplicate vehicle).", 409);
        }
        return err(insErr.message, 500);
      }

      const frId = typeof inserted?.firm_record_id === "string" ? inserted.firm_record_id : null;
      const { data: firmOut } = frId
        ? await db.from("firm_records").select(FIRM_SNAPSHOT_COLS).eq("id", frId).maybeSingle()
        : { data: null };
      return json({
        row: freshFundRow(
          inserted as Record<string, unknown>,
          (firmOut as Record<string, unknown> | null) ?? null,
        ),
      });
    }

    if (entity === "deals") {
      const companyName = typeof body.company_name === "string" ? body.company_name.trim() : "";
      if (!companyName) return err("company_name is required", 400);

      const dealInsert: Record<string, unknown> = {
        company_name: companyName,
        normalized_company_name: normalizeFundNameKey(companyName),
        currency: typeof body.currency === "string" && body.currency.length === 3 ? body.currency : "USD",
        extraction_method: "manual_admin",
        source_type: typeof body.source_type === "string" ? body.source_type : "news",
        confidence_score: typeof body.confidence_score === "number" ? body.confidence_score : 0.95,
        source_count: typeof body.source_count === "number" ? body.source_count : 1,
        needs_review: body.needs_review === true,
        is_rumor: Boolean(body.is_rumor),
        co_investors: Array.isArray(body.co_investors) ? body.co_investors : [],
      };

      const dealOptional = [
        "company_domain",
        "company_website",
        "company_logo_url",
        "company_linkedin_url",
        "company_location",
        "sector_raw",
        "sector_normalized",
        "round_type_raw",
        "round_type_normalized",
        "amount_raw",
        "amount_minor_units",
        "announced_date",
        "lead_investor",
        "lead_investor_normalized",
        "extracted_summary",
        "primary_source_name",
        "primary_source_url",
        "primary_press_url",
        "review_reason",
      ] as const;
      for (const k of dealOptional) {
        if (body[k] !== undefined && body[k] !== "") dealInsert[k] = body[k];
      }

      const { data: dealRow, error: dealErr } = await db
        .from("fi_deals_canonical")
        .insert(dealInsert)
        .select(DEAL_COLS)
        .single();
      if (dealErr) return err(dealErr.message, 500);
      return json({ row: dealRow });
    }

    if (entity === "firms") {
      const firmName = typeof body.firm_name === "string" ? body.firm_name.trim() : "";
      if (!firmName) return err("firm_name is required", 400);

      const websiteRaw = typeof body.website_url === "string" ? body.website_url.trim() : "";
      const slugRaw = typeof body.slug === "string" ? body.slug.trim() : "";
      const legalRaw = typeof body.legal_name === "string" ? body.legal_name.trim() : "";

      const insertRow: Record<string, unknown> = {
        firm_name: firmName,
        enrichment_status: "pending",
        completeness_score: 0,
        needs_review: true,
        ready_for_live: false,
        manual_review_status: "needs_review",
        aliases: [],
        thesis_verticals: [],
        recent_deals: [],
      };

      if (websiteRaw) insertRow.website_url = websiteRaw;
      if (slugRaw) insertRow.slug = slugRaw;
      if (legalRaw) insertRow.legal_name = legalRaw;

      const { data: inserted, error: insErr } = await db
        .from("firm_records")
        .insert(insertRow)
        .select(FIRM_COLS)
        .single();

      if (insErr) {
        const code = (insErr as { code?: string }).code;
        if (code === "23505") {
          return err("A firm with this slug (or other unique field) already exists.", 409);
        }
        return err(insErr.message, 500);
      }
      return json({ row: inserted });
    }

    return err(`POST not supported for entity: ${entity}`, 400);
  }

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

    if (entity === "fc-enrichment-settings") {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body)) {
        if (FC_ENRICHMENT_SETTINGS_PATCH_KEYS.has(k)) patch[k] = v;
      }
      if (!Object.keys(patch).length) return err("No patchable fields");
      patch.updated_at = new Date().toISOString();
      const { data, error } = await db
        .from("fresh_capital_enrichment_settings")
        .update(patch)
        .eq("id", "default")
        .select("*")
        .single();
      if (error) return err(error.message, 500);
      return json({ row: data });
    }

    if (entity === "tool-category-page") {
      const slug = url.searchParams.get("slug")?.trim().toLowerCase() ?? "";
      if (!slug) return err("Missing slug", 400);
      if (!TOOL_CATEGORY_PAGE_SLUGS.has(slug)) return err("Invalid slug", 400);
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const k of TOOL_CATEGORY_PAGE_PATCH_KEYS) {
        if (body[k] === undefined) continue;
        const v = body[k];
        if (v === null || (typeof v === "string" && !v.trim())) patch[k] = null;
        else if (typeof v === "string") patch[k] = v;
      }
      if (!Object.keys(patch).length) return err("No patchable fields");
      patch.updated_at = new Date().toISOString();

      const { data: updated, error: upErr } = await db
        .from("tool_category_page_overrides")
        .update(patch)
        .eq("category_slug", slug)
        .select("*")
        .maybeSingle();
      if (upErr) return err(upErr.message, 500);
      if (updated) return json({ row: updated });

      const insertRow: Record<string, unknown> = {
        category_slug: slug,
        title: null,
        description: null,
        meta: null,
        ...patch,
      };
      const { data: inserted, error: insErr } = await db
        .from("tool_category_page_overrides")
        .insert(insertRow)
        .select("*")
        .single();
      if (insErr) return err(insErr.message, 500);
      return json({ row: inserted });
    }

    if (entity === "fi-sources") {
      if (!id) return err("Missing id");
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body)) {
        if (FI_SOURCES_PATCH_KEYS.has(k)) patch[k] = v;
      }
      if (!Object.keys(patch).length) return err("No patchable fields");
      patch.updated_at = new Date().toISOString();
      const { data, error } = await db.from("fi_sources").update(patch).eq("id", id).select(FI_SOURCES_COLS).single();
      if (error) return err(error.message, 500);
      return json({ row: data });
    }

    const table = resolveEntityTable(entity);
    if (!id) return err("Missing id");
    if (!table) return err(`Unknown entity: ${entity}`);

    const body  = await req.json().catch(() => ({})) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!PROTECTED.has(k)) patch[k] = v;
    }

    // Admin UI legacy field names → real columns (startups table has no `hq` / `twitter_url`).
    if (table === "startups") {
      if ("hq" in patch) {
        patch.location = patch.hq;
        delete patch.hq;
      }
      if ("twitter_url" in patch) {
        patch.x_url = patch.twitter_url;
        delete patch.twitter_url;
      }
      delete patch.needs_enrichment;
      delete patch.enrichment_status;
    }
    if (table === "startup_founders") {
      delete patch.enrichment_status;
    }

    if (!Object.keys(patch).length) return err("No patchable fields");
    patch.updated_at = new Date().toISOString();

    const { data, error } = await db.from(table).update(patch).eq("id", id).select("*").single();
    if (error) return err(error.message, 500);
    return json({ row: data });
  }

  // ── GET ────────────────────────────────────────────────────────────────────

  /** vc_funds rows + firm snapshot for admin list (Fund Watch or firm-scoped) */
  async function loadVcFundsWithFirms(
    queryExecutor: PromiseLike<{ data: unknown; error: { message: string } | null; count: number | null }>,
  ): Promise<Response> {
    const { data, error, count } = await queryExecutor;
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

  /** Firm Records modal — always scoped to one firm; firm_id is mandatory */
  if (entity === "firm-funds") {
    const firmId = url.searchParams.get("firm_id")?.trim() ?? "";
    if (!firmId) return err("firm_id is required", 400);
    let q = db.from("vc_funds").select(VCFUND_COLS, { count: "exact" })
      .is("deleted_at", null)
      .eq("firm_record_id", firmId)
      .order("announced_date", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    if (search) q = q.ilike("name", `%${search}%`);
    return loadVcFundsWithFirms(q);
  }

  if (entity === "fresh-funds") {
    const stage = url.searchParams.get("stage") ?? "";
    const firmRecordId = url.searchParams.get("firm_record_id")?.trim() ?? "";
    let q = db.from("vc_funds").select(VCFUND_COLS, { count: "exact" })
      .is("deleted_at", null)
      .order("announced_date", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    if (firmRecordId) q = q.eq("firm_record_id", firmRecordId);
    if (search) q = q.ilike("name", `%${search}%`);
    if (stage) q = q.contains("stage_focus", [stage]);
    return loadVcFundsWithFirms(q);
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

    const passesSecondaryFirmFilters = (row: Record<string, unknown>): boolean => {
      if (enrichment && String(row.enrichment_status ?? "") !== enrichment) return false;
      if (review === "true" && row.needs_review !== true) return false;
      if (review === "false" && row.needs_review !== false) return false;
      if (live === "true" && row.ready_for_live !== true) return false;
      if (live === "false" && row.ready_for_live !== false) return false;
      if (status && String(row.status ?? "") !== status) return false;
      return true;
    };

    // Primary key paste — avoids mismatch when the live display label differs from `firm_name`.
    if (search && looksLikeUuid(search)) {
      let q = db.from("firm_records").select(FIRM_COLS, { count: "exact" })
        .eq("id", search)
        .is("deleted_at", null)
        .order("completeness_score", { ascending: false })
        .range(offset, offset + limit - 1);
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

    // `search_firm_records` + parallel broad `ilike` (spacing/punctuation edge cases; RPC DB must be migrated).
    if (search) {
      const liveParam: boolean | null = live === "true" ? true : live === "false" ? false : null;
      const broadOr = firmAdminBroadOrClause(search);
      const broadQ = broadOr
        ? (() => {
            let q = db.from("firm_records").select(FIRM_COLS)
              .is("deleted_at", null)
              .or(broadOr)
              .order("completeness_score", { ascending: false })
              .limit(800);
            if (live === "true") q = q.eq("ready_for_live", true);
            if (live === "false") q = q.eq("ready_for_live", false);
            return q;
          })()
        : null;

      const firmRpcPayload = {
        p_limit: FIRM_SEARCH_RPC_CAP,
        p_query: search,
        p_ready_for_live: liveParam,
      };
      const [rpcRes, broadRes] = await Promise.all([
        rpcSearchFirmRecordsCompat(db, firmRpcPayload),
        broadQ ?? Promise.resolve({ data: [] as unknown[], error: null }),
      ]);

      if (rpcRes.error) {
        console.warn("[admin-market-intel] search_firm_records failed — using broad ilike matches only:", rpcRes.error.message);
      }
      if (broadRes.error) return err(broadRes.error.message, 500);

      const rpcRows = rpcRes.error ? [] : (rpcRes.data ?? []);
      const byId = new Map<string, Record<string, unknown>>();
      for (const r of [...rpcRows, ...(broadRes.data ?? [])]) {
        const row = r as Record<string, unknown>;
        const id = typeof row.id === "string" ? row.id : "";
        if (id && !byId.has(id)) byId.set(id, row);
      }
      let merged = [...byId.values()].sort(
        (a, b) => Number(b.completeness_score ?? 0) - Number(a.completeness_score ?? 0),
      );
      merged = merged.filter((r) => passesSecondaryFirmFilters(r));
      const total = merged.length;
      const rows = merged.slice(offset, offset + limit);
      return json({ rows, total });
    }

    let q = db.from("firm_records").select(FIRM_COLS, { count: "exact" })
      .is("deleted_at", null).order("completeness_score", { ascending: false }).range(offset, offset + limit - 1);
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

  if (entity === "firm-investors" || entity === "investors") {
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

  if (entity === "fi-sources") {
    let q = db.from("fi_sources").select(FI_SOURCES_COLS, { count: "exact" })
      .order("slug", { ascending: true })
      .range(offset, offset + limit - 1);
    if (search) q = q.ilike("name", `%${search}%`);
    const { data, error, count } = await q;
    if (error) return err(error.message, 500);
    return json({ rows: data ?? [], total: count ?? 0 });
  }

  if (entity === "fi-fetch-runs") {
    const { data: runs, error } = await db
      .from("fi_fetch_runs")
      .select(FI_FETCH_RUN_COLS)
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return err(error.message, 500);
    const list = (runs ?? []) as Array<{ source_id?: string } & Record<string, unknown>>;
    const ids = [...new Set(list.map((r) => r.source_id).filter((x): x is string => typeof x === "string" && x.length > 0))];
    const sourceMap = new Map<string, { slug: string; name: string }>();
    if (ids.length) {
      const { data: srcs } = await db.from("fi_sources").select("id, slug, name").in("id", ids);
      for (const s of srcs ?? []) {
        const row = s as { id: string; slug: string; name: string };
        sourceMap.set(row.id, { slug: row.slug, name: row.name });
      }
    }
    const rows = list.map((r) => {
      const sid = typeof r.source_id === "string" ? r.source_id : "";
      const meta = sid ? sourceMap.get(sid) : undefined;
      return {
        ...r,
        source_slug: meta?.slug ?? null,
        source_name: meta?.name ?? null,
      };
    });
    return json({ rows, total: rows.length });
  }

  if (entity === "vc-fund-sync-runs") {
    const { data, error, count } = await db
      .from("vc_fund_sync_runs")
      .select(VC_FUND_SYNC_RUN_COLS, { count: "exact" })
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return err(error.message, 500);
    return json({ rows: data ?? [], total: count ?? 0 });
  }

  if (entity === "vc-fund-sync-latest") {
    const { data, error } = await db.from("vc_fund_sync_latest_runs").select("*");
    if (error) return err(error.message, 500);
    const rows = [...(data ?? [])] as Record<string, unknown>[];
    rows.sort((a, b) => String(a.phase ?? "").localeCompare(String(b.phase ?? "")));
    return json({ rows, total: rows.length });
  }

  if (entity === "latest-vc-daily-sync") {
    const { data, error } = await db.from("v_latest_vc_fund_sync").select("*").maybeSingle();
    if (error) return err(error.message, 500);
    return json({ row: data ?? null });
  }

  if (entity === "fc-enrichment-settings") {
    const { data, error } = await db.from("fresh_capital_enrichment_settings").select("*").eq("id", "default").maybeSingle();
    if (error) return err(error.message, 500);
    return json({ row: data ?? null });
  }

  if (entity === "tool-category-page") {
    const slug = url.searchParams.get("slug")?.trim().toLowerCase() ?? "";
    if (!slug) return err("Missing slug", 400);
    if (!TOOL_CATEGORY_PAGE_SLUGS.has(slug)) return err("Invalid slug", 400);
    const { data, error } = await db
      .from("tool_category_page_overrides")
      .select("*")
      .eq("category_slug", slug)
      .maybeSingle();
    if (error) return err(error.message, 500);
    return json({ row: data ?? null });
  }

  return err(`Unknown entity: ${entity}`);
});
