import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autoPermissionForEmail,
  clampGodModeToDesignatedEmail,
  hasAdminConsoleAccess,
  isGodModeEmail,
  type AppPermission,
} from "../_shared/app-admin-email.ts";
import { resolveAdminCaller } from "../_shared/admin-resolve-caller.ts";
import { clerkGetUser, clerkPrimaryEmail } from "../_shared/clerk-backend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const resolved = await resolveAdminCaller(authHeader, supabaseUrl, supabaseKey);
    if ("error" in resolved) throw new Error(resolved.error);

    const adminClient = createClient(supabaseUrl, serviceKey);

    const roleIds = resolved.identityUserIds.length ? resolved.identityUserIds : [resolved.id];
    const { data: roleRows } = await adminClient.from("user_roles").select("permission").in("user_id", roleIds);
    let roleFromDb: AppPermission | null = null;
    for (const row of roleRows ?? []) {
      roleFromDb = highestPermission(roleFromDb, asPermission(row.permission));
    }

    // If email wasn't in the JWT, resolve it via the Clerk API before checking permissions.
    let callerEmail = resolved.email;
    if (!callerEmail && resolved.id.startsWith("user_")) {
      const clerkSecret = Deno.env.get("CLERK_SECRET_KEY")?.trim() ?? "";
      if (clerkSecret) {
        try {
          const u = await clerkGetUser(clerkSecret, resolved.id);
          callerEmail = u ? (clerkPrimaryEmail(u) || null) : null;
        } catch (emailErr) {
          throw new Error(
            `Admin access denied: Clerk API returned an error resolving caller identity ` +
            `(${(emailErr as Error).message}). ` +
            `Ensure CLERK_SECRET_KEY is a live key (sk_live_...) matching your Clerk instance.`,
          );
        }
      }
    }

    const callerPermission = clampGodModeToDesignatedEmail(
      highestPermission(
        roleFromDb,
        asPermission(resolved.user_metadata?.role),
        autoPermissionForEmail(callerEmail),
      ),
      callerEmail,
    );
    if (!hasAdminConsoleAccess(callerPermission)) throw new Error("Admin access required");

    const { target_user_id, permission } = await req.json();
    if (!target_user_id || !["user", "manager", "admin", "god"].includes(permission)) {
      throw new Error("Invalid payload: need target_user_id and valid permission");
    }

    const { data: targetUserData, error: targetUserError } = await adminClient.auth.admin.getUserById(target_user_id);
    let targetEmail: string | null = targetUserData?.user?.email ?? null;
    if (targetUserError || !targetEmail) {
      const clerkSecret = Deno.env.get("CLERK_SECRET_KEY")?.trim() ?? "";
      if (!clerkSecret) {
        throw new Error("Target user not found (set CLERK_SECRET_KEY to manage Clerk users)");
      }
      const clerkUser = await clerkGetUser(clerkSecret, target_user_id);
      if (!clerkUser) throw new Error("Target user not found");
      targetEmail = clerkPrimaryEmail(clerkUser);
      if (!targetEmail) throw new Error("Target user has no email in Clerk");
    }

    // GOD MODE is reserved for one user.
    if (permission === "god" && !isGodModeEmail(targetEmail)) {
      throw new Error("GOD MODE can only be assigned to matt@vekta.so");
    }
    if (isGodModeEmail(targetEmail) && permission !== "god") {
      throw new Error("matt@vekta.so must retain GOD MODE");
    }

    // Only GOD can assign GOD.
    if (permission === "god" && callerPermission !== "god") {
      throw new Error("Only GOD-level admins can assign GOD permission");
    }

    // Upsert role
    const { error: upsertError } = await adminClient
      .from("user_roles")
      .upsert({ user_id: target_user_id, permission, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

    if (upsertError) throw upsertError;

    // Supabase Auth row (legacy); skip when the ID is Clerk-only.
    if (!targetUserError && targetUserData?.user) {
      await adminClient.auth.admin.updateUserById(target_user_id, {
        user_metadata: { role: permission === "user" ? "user" : permission },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
