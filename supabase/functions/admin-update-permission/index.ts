import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autoPermissionForEmail,
  clampGodModeToDesignatedEmail,
  hasAdminConsoleAccess,
  isGodModeEmail,
  type AppPermission,
} from "../_shared/app-admin-email.ts";

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

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin/god
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("permission")
      .eq("user_id", caller.id)
      .maybeSingle();

    const callerPermission = clampGodModeToDesignatedEmail(
      highestPermission(
        asPermission(callerRole?.permission),
        asPermission(caller.user_metadata?.role),
        autoPermissionForEmail(caller.email),
      ),
      caller.email,
    );
    if (!hasAdminConsoleAccess(callerPermission)) throw new Error("Admin access required");

    const { target_user_id, permission } = await req.json();
    if (!target_user_id || !["user", "manager", "admin", "god"].includes(permission)) {
      throw new Error("Invalid payload: need target_user_id and valid permission");
    }

    const { data: targetUserData, error: targetUserError } = await adminClient.auth.admin.getUserById(target_user_id);
    if (targetUserError || !targetUserData?.user) throw new Error("Target user not found");
    const targetEmail = targetUserData.user.email;

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

    // Also update user_metadata for legacy compatibility
    await adminClient.auth.admin.updateUserById(target_user_id, {
      user_metadata: { role: permission === "user" ? "user" : permission },
    });

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
