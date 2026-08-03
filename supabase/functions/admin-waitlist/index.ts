import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autoPermissionForEmail,
  clampGodModeToDesignatedEmail,
  hasAdminConsoleAccess,
  type AppPermission,
} from "../_shared/app-admin-email.ts";
import { resolveAdminCaller } from "../_shared/admin-resolve-caller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const reviewStatuses = new Set(["pending", "approved", "rejected"]);

function asPermission(value: unknown): AppPermission | null {
  const permission = String(value ?? "").toLowerCase();
  return permission === "user" || permission === "manager" || permission === "admin" || permission === "god"
    ? permission as AppPermission
    : null;
}

function highestPermission(...candidates: Array<AppPermission | null>): AppPermission {
  const rank: Record<AppPermission, number> = { user: 0, manager: 1, admin: 2, god: 3 };
  return candidates.reduce<AppPermission>(
    (best, next) => next && rank[next] > rank[best] ? next : best,
    "user",
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") throw new Error("Method not allowed");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resolved = await resolveAdminCaller(
      req.headers.get("Authorization"),
      supabaseUrl,
      supabaseAnonKey,
    );
    if ("error" in resolved) throw new Error(resolved.error);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const roleIds = resolved.identityUserIds.length ? resolved.identityUserIds : [resolved.id];
    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("permission")
      .in("user_id", roleIds);
    if (roleError) throw roleError;

    const rolePermission = (roleRows ?? []).reduce<AppPermission | null>(
      (best, row) => highestPermission(best, asPermission(row.permission)),
      null,
    );
    const callerPermission = clampGodModeToDesignatedEmail(
      highestPermission(rolePermission, autoPermissionForEmail(resolved.email)),
      resolved.email,
    );
    if (!hasAdminConsoleAccess(callerPermission)) throw new Error("Admin access required");

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "list");

    if (action === "list") {
      const { data, error } = await adminClient
        .from("waitlist_users")
        .select(
          "id, created_at, updated_at, email, name, role, company_name, linkedin_url, source, status, priority_access, referral_count, total_score, waitlist_position, reviewed_at, reviewed_by, reviewed_by_email",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;

      const applicants = data ?? [];
      const counts = applicants.reduce<Record<string, number>>(
        (acc, applicant) => {
          const status = String(applicant.status ?? "pending");
          acc[status] = (acc[status] ?? 0) + 1;
          return acc;
        },
        { all: applicants.length, pending: 0, approved: 0, rejected: 0 },
      );

      return new Response(JSON.stringify({ applicants, counts }), { headers: jsonHeaders });
    }

    if (action === "update_status") {
      const id = String(body.id ?? "").trim();
      const status = String(body.status ?? "").trim().toLowerCase();
      if (!id || !reviewStatuses.has(status)) {
        throw new Error("Invalid payload: id and a supported status are required");
      }

      const { data, error } = await adminClient.rpc("admin_update_waitlist_status", {
        p_waitlist_user_id: id,
        p_status: status,
        p_reviewed_by: resolved.id,
        p_reviewed_by_email: resolved.email,
      });
      if (error) throw error;

      return new Response(JSON.stringify({ applicant: data }), { headers: jsonHeaders });
    }

    throw new Error("Unsupported action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Method not allowed" ? 405 : 400;
    return new Response(JSON.stringify({ error: message }), { status, headers: jsonHeaders });
  }
});
