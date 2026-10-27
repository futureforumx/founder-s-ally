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

type SubscriptionPlan = "free" | "basic" | "premium" | "elite";

const PLAN_RANK: Record<SubscriptionPlan, number> = { free: 0, basic: 1, premium: 2, elite: 3 };
const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

function preferPlan(current: SubscriptionPlan | undefined, next: SubscriptionPlan): SubscriptionPlan {
  if (!current || PLAN_RANK[next] > PLAN_RANK[current]) return next;
  return current;
}

function planForProduct(productId: string | null | undefined): Exclude<SubscriptionPlan, "free"> | null {
  const basic = Deno.env.get("STRIPE_BASIC_PRODUCT_ID") || "prod_UDOE8xN0c0nLJ9";
  const premium = Deno.env.get("STRIPE_PREMIUM_PRODUCT_ID") || "prod_UDOEvx0txmJqg4";
  const elite = Deno.env.get("STRIPE_ELITE_PRODUCT_ID") || "prod_V6Tlx8ZSJTA9Q8";
  if (productId === elite) return "elite";
  if (productId === premium) return "premium";
  if (productId === basic) return "basic";
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

    const { error: requestCountError } = await adminClient.rpc("record_user_api_request_for_user", {
      _user_id: resolved.id,
    });
    if (requestCountError) {
      console.error("[admin-list-users] Could not record admin list request:", requestCountError.message);
    }

    // Clerk (third-party) users are not in auth.users — listUsers is often empty. Use profiles as source of truth.
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("user_id, full_name, title, avatar_url, user_type, linkedin_url, twitter_url, location, created_at");

    // App users table (email / display name) — used to enrich + as a fallback identity source
    // so the list is never empty even when the Clerk directory can't be read.
    const { data: appUsers } = await adminClient
      .from("users")
      .select("id, email, display_name, avatar_url, created_at");

    const { data: roles } = await adminClient
      .from("user_roles")
      .select("user_id, permission");

    const { data: ipRows } = await adminClient
      .from("user_ip_log")
      .select("user_id, ip_address, last_seen_at")
      .order("last_seen_at", { ascending: false });

    const { data: bannedRows } = await adminClient
      .from("banned_identities")
      .select("kind, value, banned_user_id");

    // Registration names (first/last captured on /register) — fallback identity
    // so users show a name in the admin list even before onboarding completes.
    const { data: waitlistRows } = await adminClient
      .from("waitlist_users")
      .select("email, name, metadata");
    const waitlistNameByEmail = new Map<string, string>();
    for (const row of waitlistRows || []) {
      const wlEmail = String(row.email ?? "").trim().toLowerCase();
      if (!wlEmail) continue;
      const md = (row.metadata ?? {}) as Record<string, unknown>;
      const first = typeof md.first_name === "string" ? md.first_name.trim() : "";
      const last = typeof md.last_name === "string" ? md.last_name.trim() : "";
      const derived = [first, last].filter(Boolean).join(" ") ||
        (typeof row.name === "string" ? row.name.trim() : "");
      if (derived) waitlistNameByEmail.set(wlEmail, derived);
    }

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    const appUserMap = new Map((appUsers || []).map((u) => [u.id, u]));
    const roleMap = new Map((roles || []).map((r) => [r.user_id, r.permission]));

    // Newest-first IPs per user (query is already ordered by last_seen_at desc).
    const ipMap = new Map<string, string[]>();
    for (const row of ipRows || []) {
      const list = ipMap.get(row.user_id) ?? [];
      if (row.ip_address && !list.includes(row.ip_address)) list.push(row.ip_address);
      ipMap.set(row.user_id, list);
    }

    const bannedUserIds = new Set<string>();
    const bannedEmails = new Set<string>();
    const bannedIps = new Set<string>();
    for (const row of bannedRows || []) {
      if (row.banned_user_id) bannedUserIds.add(row.banned_user_id);
      if (row.kind === "email" && row.value) bannedEmails.add(String(row.value).toLowerCase());
      if (row.kind === "ip" && row.value) bannedIps.add(String(row.value));
    }

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

    // Always union every identity source so the list is resilient: Clerk directory,
    // the app `users` table, and `profiles`. If Clerk can't be read, DB users still show.
    const planByUserId = new Map<string, SubscriptionPlan>();
    const planByEmail = new Map<string, SubscriptionPlan>();
    const rememberPlan = (userId: string | null | undefined, email: string | null | undefined, plan: SubscriptionPlan) => {
      if (userId) planByUserId.set(userId, preferPlan(planByUserId.get(userId), plan));
      const normalized = email?.trim().toLowerCase();
      if (normalized) planByEmail.set(normalized, preferPlan(planByEmail.get(normalized), plan));
    };

    const { data: subscriptionRows, error: subscriptionError } = await adminClient
      .from("stripe_subscriptions")
      .select("user_id, stripe_product_id, status");

    if (!subscriptionError) {
      for (const row of subscriptionRows ?? []) {
        if (!ENTITLED_STATUSES.has(String(row.status))) continue;
        const plan = planForProduct(row.stripe_product_id);
        if (plan) rememberPlan(row.user_id, null, plan);
      }
    } else {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim() ?? "";
      if (!stripeKey) {
        console.warn("[admin-list-users] Stripe subscriptions unavailable:", subscriptionError.message);
      } else {
        try {
          const Stripe = (await import("npm:stripe@22.5.0")).default;
          const stripe = new Stripe(stripeKey);
          for (const status of ["active", "trialing", "past_due"] as const) {
            let startingAfter: string | undefined;
            for (let page = 0; page < 10; page += 1) {
              const listed = await stripe.subscriptions.list({
                status,
                limit: 100,
                expand: ["data.customer"],
                ...(startingAfter ? { starting_after: startingAfter } : {}),
              });
              for (const subscription of listed.data) {
                const price = subscription.items.data[0]?.price;
                const product = price?.product;
                const productId = typeof product === "string" ? product : product?.id;
                const plan = planForProduct(productId);
                if (!plan) continue;
                const customer = subscription.customer;
                const customerRecord = typeof customer === "object" && customer && !("deleted" in customer && customer.deleted)
                  ? customer
                  : null;
                rememberPlan(
                  subscription.metadata?.supabase_user_id || customerRecord?.metadata?.supabase_user_id,
                  customerRecord?.email,
                  plan,
                );
              }
              if (!listed.has_more) break;
              startingAfter = listed.data.at(-1)?.id;
              if (!startingAfter) break;
            }
          }
        } catch (stripeError) {
          console.error("[admin-list-users] Stripe subscription lookup:", (stripeError as Error).message);
        }
      }
    }

    const idSet = new Set<string>();
    for (const u of authUsers) idSet.add(u.id);
    for (const u of appUsers || []) idSet.add(u.id);
    for (const p of profiles || []) idSet.add(p.user_id);

    const { data: activity } = await adminClient
      .from("user_activity")
      .select("user_id, total_time_seconds, api_calls_count, last_active_at");
    const activityMap = new Map((activity || []).map((a) => [a.user_id, a]));

    const userIds = [...idSet];
    const { data: storageUsage, error: storageUsageError } = await adminClient
      .rpc("admin_user_storage_usage", { _user_ids: userIds });
    if (storageUsageError) {
      console.error("[admin-list-users] Storage usage lookup:", storageUsageError.message);
    }
    const storageBytesByUserId = new Map<string, number>(
      (storageUsage ?? []).map((row: { user_id: string; storage_bytes: number | string }) => [
        row.user_id,
        Number(row.storage_bytes) || 0,
      ]),
    );

    const enrichedUsers = userIds.map((id) => {
      const profile = profileMap.get(id);
      const u = authById.get(id);
      const appUser = appUserMap.get(id);
      const act = activityMap.get(id);
      const meta = u?.user_metadata as { full_name?: string } | undefined;
      const ipAddresses = ipMap.get(id) ?? [];
      const email = u?.email || appUser?.email || "";
      const emailLower = email.toLowerCase();
      const banned =
        bannedUserIds.has(id) ||
        (!!emailLower && bannedEmails.has(emailLower)) ||
        ipAddresses.some((ip) => bannedIps.has(ip));
      return {
        id,
        email,
        last_sign_in_at: u?.last_sign_in_at ?? null,
        created_at: u?.created_at ?? profile?.created_at ?? appUser?.created_at ?? new Date(0).toISOString(),
        full_name: profile?.full_name || meta?.full_name || appUser?.display_name || (emailLower ? waitlistNameByEmail.get(emailLower) : "") || "",
        avatar_url: profile?.avatar_url ?? u?.image_url ?? appUser?.avatar_url ?? null,
        user_type: profile?.user_type ?? "founder",
        title: profile?.title ?? null,
        linkedin_url: profile?.linkedin_url ?? null,
        twitter_url: profile?.twitter_url ?? null,
        location: profile?.location ?? null,
        permission: clampGodModeToDesignatedEmail(
          highestPermission(
            asPermission(roleMap.get(id)),
            asPermission(u?.user_metadata?.role),
            autoPermissionForEmail(email),
          ),
          email,
        ),
        total_time_seconds: act?.total_time_seconds ?? 0,
        api_calls_count: act?.api_calls_count ?? 0,
        storage_bytes: storageBytesByUserId.get(id) ?? 0,
        last_active_at: act?.last_active_at ?? null,
        ip_addresses: ipAddresses,
        last_ip: ipAddresses[0] ?? null,
        banned,
        subscription: planByUserId.get(id) ?? (emailLower ? planByEmail.get(emailLower) : undefined) ?? "free",
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
