/**
 * admin-update-firm-record
 *
 * GET  ?search=text&firm_type=vc&status=enriched&needs_review=true&limit=25&offset=0
 *        → { rows: FirmRow[], total: number }
 *
 * PATCH ?id=<uuid>   body: Partial<EditableFields>
 *        → { row: FirmRow }
 *
 * Auth: Clerk (or Supabase) JWT whose sub maps to a user_roles row with permission
 *       'admin' or 'god'. Uses service-role key so RLS is bypassed for writes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtSub } from "../_shared/jwt-sub.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-auth",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

// ── Admin check ────────────────────────────────────────────────────────────────

async function assertAdmin(
  req: Request,
  adminClient: ReturnType<typeof createClient>,
): Promise<string | null> {
  // Prefer X-User-Auth (forwarded Clerk JWT from the frontend pattern)
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
  return null;
}

// ── Allowed fields for PATCH ───────────────────────────────────────────────────

const ALLOWED_PATCH_FIELDS = new Set([
  // Identity
  "firm_name", "legal_name", "firm_type", "founded_year",
  // Contact / web
  "website_url", "email", "phone", "contact_page_url",
  "linkedin_url", "crunchbase_url", "angellist_url", "x_url",
  "pitchbook_url", "openvc_url", "vcsheet_url", "wellfound_url",
  "signal_nfx_url", "tracxn_url", "substack_url", "medium_url",
  "blog_url", "firm_blog_url", "beehiiv_url",
  // Profile text
  "description", "elevator_pitch", "tagline", "investment_philosophy",
  // Location
  "hq_city", "hq_state", "hq_country", "hq_region", "address", "location",
  // Focus arrays (stored as text[])
  "sector_focus", "stage_focus", "geo_focus", "thesis_verticals",
  "investment_themes", "strategy_classifications",
  // Fund / AUM
  "aum", "aum_usd", "avg_check_size", "min_check_size", "max_check_size",
  "current_fund_name", "current_fund_size", "current_fund_vintage_year",
  "num_funds", "active_fund_count",
  // Portfolio
  "active_portfolio_count", "general_partner_count", "general_partner_names",
  "partner_names", "lead_partner",
  // Status / workflow
  "enrichment_status", "manual_review_status", "needs_review", "ready_for_live",
  "verification_status", "fund_status",
  // Flags
  "has_fresh_capital", "is_actively_deploying", "underrepresented_founders_focus",
  "ca_sb54_compliant",
  // Logos / media
  "logo_url",
]);

// ── Main handler ────────────────────────────────────────────────────────────────

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

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const search = url.searchParams.get("search")?.trim() ?? "";
    const firmType = url.searchParams.get("firm_type") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const needsReview = url.searchParams.get("needs_review") ?? "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "25"), 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0"), 0);

    let query = adminClient
      .from("firm_records")
      .select(
        "id, firm_name, legal_name, firm_type, website_url, email, " +
        "hq_city, hq_state, hq_country, " +
        "sector_focus, stage_focus, geo_focus, " +
        "enrichment_status, manual_review_status, needs_review, ready_for_live, " +
        "completeness_score, data_confidence_score, " +
        "aum, avg_check_size, " +
        "description, elevator_pitch, logo_url, " +
        "updated_at, created_at, deleted_at",
        { count: "exact" }
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      // ilike on firm_name or website
      query = query.or(`firm_name.ilike.%${search}%,website_url.ilike.%${search}%,legal_name.ilike.%${search}%`);
    }
    if (firmType) {
      query = query.eq("firm_type", firmType);
    }
    if (status) {
      query = query.eq("enrichment_status", status);
    }
    if (needsReview === "true") {
      query = query.eq("needs_review", true);
    } else if (needsReview === "false") {
      query = query.eq("needs_review", false);
    }

    const { data, error, count } = await query;
    if (error) return err(`Query failed: ${error.message}`, 500);

    return json({ rows: data ?? [], total: count ?? 0 });
  }

  // ── PATCH ────────────────────────────────────────────────────────────────────
  if (req.method === "PATCH") {
    const id = url.searchParams.get("id");
    if (!id) return err("Missing ?id= parameter");

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return err("Invalid JSON body");
    }

    // Only keep allowed fields
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_PATCH_FIELDS.has(key)) {
        patch[key] = value;
      }
    }

    if (Object.keys(patch).length === 0) {
      return err("No patchable fields in body");
    }

    patch.updated_at = new Date().toISOString();

    const { data, error } = await adminClient
      .from("firm_records")
      .update(patch)
      .eq("id", id)
      .select(
        "id, firm_name, legal_name, firm_type, website_url, email, " +
        "hq_city, hq_state, hq_country, " +
        "sector_focus, stage_focus, geo_focus, " +
        "enrichment_status, manual_review_status, needs_review, ready_for_live, " +
        "completeness_score, data_confidence_score, " +
        "aum, avg_check_size, " +
        "description, elevator_pitch, logo_url, " +
        "updated_at, created_at"
      )
      .single();

    if (error) return err(`Update failed: ${error.message}`, 500);
    return json({ row: data });
  }

  return err("Method not allowed", 405);
});
