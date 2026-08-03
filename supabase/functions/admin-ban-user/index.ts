import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autoPermissionForEmail,
  clampGodModeToDesignatedEmail,
  hasAdminConsoleAccess,
  type AppPermission,
} from "../_shared/app-admin-email.ts";
import { resolveAdminCaller } from "../_shared/admin-resolve-caller.ts";
import { clerkBanUser, clerkGetUser, clerkGetUserSessionIps, clerkPrimaryEmail } from "../_shared/clerk-backend.ts";

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
    const clerkSecret = Deno.env.get("CLERK_SECRET_KEY")?.trim() ?? "";

    const resolved = await resolveAdminCaller(authHeader, supabaseUrl, supabaseKey);
    if ("error" in resolved) throw new Error(resolved.error);

    const adminClient = createClient(supabaseUrl, serviceKey);

    // ── Verify caller is an admin ──────────────────────────────────────────
    const roleIds = resolved.identityUserIds.length ? resolved.identityUserIds : [resolved.id];
    const { data: roleRows } = await adminClient.from("user_roles").select("permission").in("user_id", roleIds);
    let roleFromDb: AppPermission | null = null;
    for (const row of roleRows ?? []) {
      roleFromDb = highestPermission(roleFromDb, asPermission(row.permission));
    }

    let callerEmail = resolved.email;
    if (!callerEmail && resolved.id.startsWith("user_") && clerkSecret) {
      try {
        const u = await clerkGetUser(clerkSecret, resolved.id);
        callerEmail = u ? (clerkPrimaryEmail(u) || null) : null;
      } catch (emailErr) {
        throw new Error(`Admin access denied: could not resolve caller identity (${(emailErr as Error).message}).`);
      }
    }

    const callerPermission = clampGodModeToDesignatedEmail(
      highestPermission(roleFromDb, asPermission(resolved.user_metadata?.role), autoPermissionForEmail(callerEmail)),
      callerEmail,
    );
    if (!hasAdminConsoleAccess(callerPermission)) throw new Error("Admin access required");

    // ── Payload ────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const targetUserId: string = String(body.target_user_id ?? "").trim();
    const providedEmail: string | null =
      typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
    const providedIps: string[] = Array.isArray(body.ip_addresses)
      ? body.ip_addresses.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    const reason: string | null = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

    if (!targetUserId) throw new Error("Invalid payload: target_user_id is required");
    if (targetUserId === resolved.id || resolved.identityUserIds.includes(targetUserId)) {
      throw new Error("You cannot ban your own account");
    }

    // ── Resolve target email + guard against banning other admins ──────────
    let targetEmail: string | null = providedEmail;
    if (!targetEmail && clerkSecret) {
      try {
        const clerkUser = await clerkGetUser(clerkSecret, targetUserId);
        targetEmail = clerkUser ? clerkPrimaryEmail(clerkUser) || null : null;
      } catch (_e) {
        /* best-effort */
      }
    }

    const { data: targetRoleRows } = await adminClient
      .from("user_roles")
      .select("permission")
      .eq("user_id", targetUserId);
    let targetRole: AppPermission | null = null;
    for (const row of targetRoleRows ?? []) targetRole = highestPermission(targetRole, asPermission(row.permission));
    const targetPermission = highestPermission(targetRole, autoPermissionForEmail(targetEmail));
    if (targetPermission === "admin" || targetPermission === "god") {
      throw new Error("Admins and GOD-level users cannot be banned");
    }

    // ── Collect IPs: client-provided + logged + best-effort Clerk sessions ──
    const ipSet = new Set<string>(providedIps);
    const { data: loggedIps } = await adminClient
      .from("user_ip_log")
      .select("ip_address")
      .eq("user_id", targetUserId);
    for (const row of loggedIps ?? []) {
      if (row.ip_address) ipSet.add(row.ip_address);
    }
    if (clerkSecret) {
      const sessionIps = await clerkGetUserSessionIps(clerkSecret, targetUserId);
      for (const ip of sessionIps) ipSet.add(ip);
    }
    const ips = [...ipSet];

    // ── Record ban rows (email + each IP) ──────────────────────────────────
    const rows: Array<Record<string, unknown>> = [];
    if (targetEmail) {
      rows.push({
        kind: "email",
        value: targetEmail.toLowerCase(),
        banned_user_id: targetUserId,
        email: targetEmail,
        reason,
        banned_by: resolved.id,
      });
    }
    for (const ip of ips) {
      rows.push({
        kind: "ip",
        value: ip,
        banned_user_id: targetUserId,
        email: targetEmail,
        reason,
        banned_by: resolved.id,
      });
    }

    if (rows.length === 0) {
      throw new Error("Nothing to ban: no email or IP address is on record for this user");
    }

    const { error: insertError } = await adminClient
      .from("banned_identities")
      .upsert(rows, { onConflict: "kind,value" });
    if (insertError) throw insertError;

    // ── Block the account itself (Clerk) so the email can't sign in ────────
    let accountBlocked = false;
    if (clerkSecret && targetUserId.startsWith("user_")) {
      try {
        await clerkBanUser(clerkSecret, targetUserId);
        accountBlocked = true;
      } catch (e) {
        console.error("[admin-ban-user] clerk ban failed:", (e as Error).message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        banned_email: targetEmail,
        banned_ips: ips,
        account_blocked: accountBlocked,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
