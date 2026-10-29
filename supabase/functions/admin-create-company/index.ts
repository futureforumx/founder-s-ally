/**
 * admin-create-company
 *
 * Creates a name-only company for the admin Market Intel picker.
 * Auth matches admin-market-intel: anon key in Authorization, user JWT in X-User-Auth.
 * New rows are always status UNKNOWN and record_status needs_review. Live
 * companies use status ACTIVE, so a name-only company does not count as live.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function bearerize(authHeader: string | null): string | null {
  const h = authHeader?.trim();
  if (!h) return null;
  return h.toLowerCase().startsWith("bearer ") ? h : `Bearer ${h}`;
}

function asPermission(v: unknown): AppPermission | null {
  const p = String(v ?? "").toLowerCase();
  if (p === "user" || p === "manager" || p === "admin" || p === "god") return p;
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

async function assertAdmin(
  req: Request,
  db: ReturnType<typeof createClient>,
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

function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return err("Method not allowed", 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseAnonKey || !serviceKey) return err("Server is missing Supabase credentials", 500);

  const db = createClient(supabaseUrl, serviceKey);
  const authErr = await assertAdmin(req, db, supabaseUrl, supabaseAnonKey);
  if (authErr) return err(authErr, 403);

  const body = await req.json().catch(() => ({})) as { company_name?: unknown };
  const trimmed = typeof body.company_name === "string" ? body.company_name.trim() : "";
  if (!trimmed) return err("Enter a company name.", 400);
  if (trimmed.length > 300) return err("Company name is too long.", 400);

  const { data: existing, error: lookupErr } = await db
    .from("startups")
    .select("id, company_name, status")
    .ilike("company_name", escapeIlike(trimmed))
    .limit(8);
  if (lookupErr) return err(lookupErr.message, 500);

  const match = (existing ?? []).find((row) =>
    String(row.company_name ?? "").toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return json({ row: match });

  const id = `cs_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await db
    .from("startups")
    .insert({
      id,
      company_name: trimmed,
      status: "UNKNOWN",
      stage: "UNKNOWN",
      record_status: "needs_review",
    })
    .select("id, company_name, status, record_status")
    .single();

  if (error || !data) {
    if ((error as { code?: string } | null)?.code === "23505") {
      return err("A company with that name already exists.", 409);
    }
    return err(error?.message ?? "Could not add company.", 500);
  }

  if (String(data.status ?? "").trim().toLowerCase() === "active") {
    await db.from("startups").delete().eq("id", data.id);
    return err("New companies cannot be created as live.", 500);
  }

  return json({ row: data });
});
