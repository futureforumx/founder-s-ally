/**
 * admin-market-intel
 *
 * GET ?entity=companies|founders|operators
 *     &search=text
 *     &stage=seed          (companies only)
 *     &status=active       (companies only)
 *     &repeat=true|false   (founders only)
 *     &exit=true|false     (founders only)
 *     &available=true|false (operators only)
 *     &enrichment=enriched  (operators only)
 *     &limit=30&offset=0
 *   → { rows: Row[], total: number }
 *
 * Auth: anon key in Authorization, WorkOS JWT in X-User-Auth.
 *       Uses service-role key so RLS is bypassed.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-auth",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

// ── JWT sub extraction ────────────────────────────────────────────────────────

function jwtSub(authHeader: string | null): string | null {
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const rem = b64.length % 4;
    if (rem) b64 += "=".repeat(4 - rem);
    const payload = JSON.parse(atob(b64)) as Record<string, unknown>;
    const s = payload?.sub;
    if (typeof s === "string" && s.trim()) return s.trim();
    if (typeof s === "number" && Number.isFinite(s)) return String(s);
  } catch { /* empty */ }
  return null;
}

// ── Admin guard ────────────────────────────────────────────────────────────────

async function assertAdmin(
  req: Request,
  adminClient: ReturnType<typeof createClient>,
): Promise<string | null> {
  const xUserAuth = req.headers.get("X-User-Auth") ?? req.headers.get("x-user-auth");
  const authHeader = xUserAuth ?? req.headers.get("Authorization");
  const sub = jwtSub(authHeader);
  if (!sub) return "Missing or invalid bearer token";

  const { data, error } = await adminClient
    .from("user_roles")
    .select("permission")
    .eq("user_id", sub)
    .in("permission", ["admin", "god"]);

  if (error) return `Role lookup failed: ${error.message}`;
  if (!data?.length) return "Caller is not an admin";
  return null;
}

// ── Column sets ───────────────────────────────────────────────────────────────

const COMPANY_COLS =
  "id, company_name, sector, stage, status, " +
  "hq_city, hq_state, hq_country, " +
  "total_raised_usd, last_round_type, last_round_date, last_round_size_usd, " +
  "headcount, momentum_score, investor_fit_score, " +
  "company_url, description_short, yc_batch, " +
  "lead_investor_names, investor_names, created_at, updated_at";

const FOUNDER_COLS =
  "id, full_name, role, startup_id, " +
  "is_repeat_founder, has_prior_exit, operator_to_founder, " +
  "track_record_score, location, domain_expertise, " +
  "prior_companies, founder_archetype, linkedin_url, email, created_at";

const OPERATOR_COLS =
  "id, full_name, title, sector_focus, expertise, prior_companies, " +
  "completeness_score, enrichment_status, is_available, ready_for_live, " +
  "city, state, country, linkedin_url, email, stage_focus, source, updated_at";

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const authErr = await assertAdmin(req, adminClient);
  if (authErr) return err(authErr, 403);

  const url    = new URL(req.url);
  const entity = url.searchParams.get("entity") ?? "companies";
  const search = url.searchParams.get("search")?.trim() ?? "";
  const limit  = Math.min(parseInt(url.searchParams.get("limit")  ?? "30"), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"),   0);

  // ── Companies ──────────────────────────────────────────────────────────────
  if (entity === "companies") {
    const stage  = url.searchParams.get("stage")  ?? "";
    const status = url.searchParams.get("status") ?? "";

    let q = adminClient
      .from("startups")
      .select(COMPANY_COLS, { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) q = q.ilike("company_name", `%${search}%`);
    if (stage)  q = q.eq("stage",  stage);
    if (status) q = q.eq("status", status);

    const { data, error, count } = await q;
    if (error) return err(error.message, 500);
    return json({ rows: data ?? [], total: count ?? 0 });
  }

  // ── Founders ───────────────────────────────────────────────────────────────
  if (entity === "founders") {
    const repeat = url.searchParams.get("repeat") ?? "";
    const exit   = url.searchParams.get("exit")   ?? "";

    let q = adminClient
      .from("startup_founders")
      .select(FOUNDER_COLS, { count: "exact" })
      .order("track_record_score", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (search)        q = q.ilike("full_name", `%${search}%`);
    if (repeat === "true")  q = q.eq("is_repeat_founder", true);
    if (repeat === "false") q = q.eq("is_repeat_founder", false);
    if (exit === "true")    q = q.eq("has_prior_exit", true);
    if (exit === "false")   q = q.eq("has_prior_exit", false);

    const { data, error, count } = await q;
    if (error) return err(error.message, 500);
    return json({ rows: data ?? [], total: count ?? 0 });
  }

  // ── Operators ──────────────────────────────────────────────────────────────
  if (entity === "operators") {
    const available  = url.searchParams.get("available")  ?? "";
    const enrichment = url.searchParams.get("enrichment") ?? "";

    let q = adminClient
      .from("operator_profiles")
      .select(OPERATOR_COLS, { count: "exact" })
      .is("deleted_at", null)
      .order("completeness_score", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search)              q = q.ilike("full_name", `%${search}%`);
    if (available === "true")  q = q.eq("is_available", true);
    if (available === "false") q = q.eq("is_available", false);
    if (enrichment)            q = q.eq("enrichment_status", enrichment);

    const { data, error, count } = await q;
    if (error) return err(error.message, 500);
    return json({ rows: data ?? [], total: count ?? 0 });
  }

  return err(`Unknown entity: ${entity}`);
});
