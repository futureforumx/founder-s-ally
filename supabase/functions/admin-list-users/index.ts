import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autoPermissionForEmail,
  clampGodModeToDesignatedEmail,
  hasAdminConsoleAccess,
  type AppPermission,
} from "../_shared/app-admin-email.ts";
import { resolveAdminCaller } from "../_shared/admin-resolve-caller.ts";
import { clerkListAllUsers, clerkUserToListedAuthFields, clerkGetUser, clerkPrimaryEmail } from "../_shared/clerk-backend.ts";

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
          console.log("[admin-list-users] resolved caller email:", callerEmail, "for id:", resolved.id);
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

    // Clerk (third-party) users are not in auth.users — listUsers is often empty. Use profiles as source of truth.
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("user_id, full_name, title, avatar_url, user_type, linkedin_url, twitter_url, location, created_at");

    const { data: roles } = await adminClient
      .from("user_roles")
      .select("user_id, permission");

    const { data: activity } = await adminClient
      .from("user_activity")
      .select("user_id, total_time_seconds, api_calls_count, last_active_at");

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    const roleMap = new Map((roles || []).map((r) => [r.user_id, r.permission]));
    const activityMap = new Map((activity || []).map((a) => [a.user_id, a]));

    const clerkSecret = Deno.env.get("CLERK_SECRET_KEY")?.trim() ?? "";

    type ListedUser = {
      id: string;
      email?: string | null;
      last_sign_in_at?: string | null;
      created_at?: string;
      user_metadata?: Record<string, unknown>;
      image_url?: string | null;
    };

    let authUsers: ListedUser[] = [];

    if (clerkSecret) {
      try {
        const clerkUsers = await clerkListAllUsers(clerkSecret);
        authUsers = clerkUsers.map(clerkUserToListedAuthFields);
      } catch (e) {
        console.error("[admin-list-users] Clerk list:", (e as Error).message);
        throw new Error(
          "Failed to list users from Clerk. Check CLERK_SECRET_KEY matches your Clerk instance (test vs live).",
        );
      }
    } else {
      console.warn(
        "[admin-list-users] CLERK_SECRET_KEY unset — falling back to Supabase auth.users + profiles (empty when using Clerk-only auth).",
      );
      const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (listError) {
        console.error("[admin-list-users] auth.admin.listUsers:", listError.message);
      } else {
        authUsers = (listData?.users ?? []) as ListedUser[];
      }
    }

    const authById = new Map(authUsers.map((u) => [u.id, u]));

    const idSet = new Set<string>();
    if (clerkSecret) {
      for (const u of authUsers) idSet.add(u.id);
    } else {
      for (const p of profiles || []) idSet.add(p.user_id);
      for (const u of authUsers) idSet.add(u.id);
    }

    const enrichedUsers = [...idSet].map((id) => {
      const profile = profileMap.get(id);
      const u = authById.get(id);
      const act = activityMap.get(id);
      const meta = u?.user_metadata as { full_name?: string } | undefined;
      return {
        id,
        email: u?.email ?? "",
        last_sign_in_at: u?.last_sign_in_at ?? null,
        created_at: u?.created_at ?? profile?.created_at ?? new Date(0).toISOString(),
        full_name: profile?.full_name || meta?.full_name || "",
        avatar_url: profile?.avatar_url ?? u?.image_url ?? null,
        user_type: profile?.user_type ?? "founder",
        title: profile?.title ?? null,
        linkedin_url: profile?.linkedin_url ?? null,
        twitter_url: profile?.twitter_url ?? null,
        location: profile?.location ?? null,
        permission: clampGodModeToDesignatedEmail(
          highestPermission(
            asPermission(roleMap.get(id)),
            asPermission(u?.user_metadata?.role),
            autoPermissionForEmail(u?.email),
          ),
          u?.email,
        ),
        total_time_seconds: act?.total_time_seconds ?? 0,
        api_calls_count: act?.api_calls_count ?? 0,
        last_active_at: act?.last_active_at ?? null,
      };
    });

    enrichedUsers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return new Response(JSON.stringify({ users: enrichedUsers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
