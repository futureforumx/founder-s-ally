/**
 * admin-enrichment-report
 *
 * GET ?since_days=30  ->  aggregated Alexandria enrichment report (admin only)
 *
 * Returns counts, completeness before/after, fields updated, confidence distribution, credits by
 * provider/entity/run, provider performance, review/conflict counts, failed + retry-eligible records and
 * recent runs. The payload comes from the SQL function public.alexandria_enrichment_report, which
 * aggregates only: it never returns raw provider payloads, contact values or free-text field values.
 *
 * Auth: same contract as admin-market-intel (anon key in Authorization, signed-in user JWT in
 * X-User-Auth). Service-role key is used server-side only.
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
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function bearerize(h: string | null): string | null {
  const t = h?.trim();
  if (!t) return null;
  return t.toLowerCase().startsWith("bearer ") ? t : `Bearer ${t}`;
}

function asPermission(v: unknown): AppPermission | null {
  const p = String(v ?? "").toLowerCase();
  return p === "user" || p === "manager" || p === "admin" || p === "god" ? (p as AppPermission) : null;
}

function highestPermission(...candidates: Array<AppPermission | null>): AppPermission {
  const rank: Record<AppPermission, number> = { user: 0, manager: 1, admin: 2, god: 3 };
  let best: AppPermission = "user";
  for (const c of candidates) if (c && rank[c] > rank[best]) best = c;
  return best;
}

async function assertAdmin(req: Request, db: SupabaseClient, supabaseUrl: string, anonKey: string): Promise<string | null> {
  const authHeader = bearerize(req.headers.get("X-User-Auth") ?? req.headers.get("x-user-auth")) ?? bearerize(req.headers.get("Authorization"));
  if (!authHeader) return "Missing authorization";
  const resolved = await resolveAdminCaller(authHeader, supabaseUrl, anonKey);
  if ("error" in resolved) return resolved.error;

  const roleIds = resolved.identityUserIds.length ? resolved.identityUserIds : [resolved.id];
  const { data: roleRows, error } = await db.from("user_roles").select("permission").in("user_id", roleIds);
  if (error) return `Role lookup failed: ${error.message}`;

  let fromDb: AppPermission | null = null;
  for (const row of roleRows ?? []) fromDb = highestPermission(fromDb, asPermission(row.permission));
  const permission = clampGodModeToDesignatedEmail(
    highestPermission(fromDb, asPermission(resolved.user_metadata?.role), autoPermissionForEmail(resolved.email)),
    resolved.email,
  );
  return hasAdminConsoleAccess(permission) ? null : "Caller is not an admin";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured" }, 500);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const denied = await assertAdmin(req, db, supabaseUrl, anonKey);
  if (denied) return json({ error: denied }, denied === "Caller is not an admin" ? 403 : 401);

  const days = Math.min(365, Math.max(1, Number.parseInt(new URL(req.url).searchParams.get("since_days") ?? "30", 10) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await db.rpc("alexandria_enrichment_report", { p_since: since });
  if (error) return json({ error: `Report unavailable: ${error.message}` }, 500);
  return json({ report: data });
});
