/**
 * admin-list-users — WorkOS-compatible user listing for the admin console.
 *
 * Auth priority (first match wins):
 *   1. WorkOS `role` claim in JWT ("god" or "admin" → granted)
 *   2. Email domain check (@vekta.so / @tryvekta.com)
 *   3. user_roles DB lookup
 *
 * Calling convention: anon key in Authorization (passes Supabase gateway),
 * WorkOS JWT in X-User-Auth (used for identity here).
 *
 * WorkOS roles: GOD → "god" | ADMIN → "admin" | MEMBER → "member"
 * (stored in user_roles; "user" treated as "member" for backwards compat)
 *
 * Optional env secrets:
 *   WORKOS_API_KEY  — fetches real emails + last_sign_in via WorkOS Users API
 *   WORKOS_ORG_ID   — also fetches org-membership roles from WorkOS
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-auth",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ADMIN_EMAIL_DOMAINS = ["vekta.so", "tryvekta.com"];
const GOD_MODE_EMAIL = "matt@vekta.so";

type AppPermission = "god" | "admin" | "member";
const PERM_RANK: Record<AppPermission, number> = { member: 0, admin: 1, god: 2 };

function highest(...candidates: Array<AppPermission | null>): AppPermission {
  let best: AppPermission = "member";
  for (const c of candidates) {
    if (c && PERM_RANK[c] > PERM_RANK[best]) best = c;
  }
  return best;
}

function normalisePermission(raw: unknown): AppPermission {
  const s = String(raw ?? "").toLowerCase();
  if (s === "god") return "god";
  if (s === "admin") return "admin";
  return "member"; // "user", "manager", "member" → member
}

// ── Inline JWT helpers ────────────────────────────────────────────────────────

function jwtPayload(authHeader: string | null): Record<string, unknown> | null {
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;
  const parts = authHeader.slice(7).trim().split(".");
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const rem = b64.length % 4;
    if (rem) b64 += "=".repeat(4 - rem);
    return JSON.parse(atob(b64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function jwtSub(p: Record<string, unknown>): string | null {
  const s = p.sub;
  if (typeof s === "string" && s.trim()) return s.trim();
  if (typeof s === "number" && Number.isFinite(s)) return String(s);
  return null;
}

function jwtEmail(p: Record<string, unknown>): string | null {
  for (const key of ["email", "primary_email_address"]) {
    const v = p[key];
    if (typeof v === "string" && v.includes("@")) return v.toLowerCase().trim();
  }
  return null;
}

function jwtRole(p: Record<string, unknown>): string | null {
  const r = p.role;
  return typeof r === "string" && r.trim() ? r.trim().toLowerCase() : null;
}

function isAdminEmail(email: string | null): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return ADMIN_EMAIL_DOMAINS.includes(domain);
}

function autoPermForEmail(email: string | null): AppPermission | null {
  if (!email) return null;
  const norm = email.toLowerCase().trim();
  if (norm === GOD_MODE_EMAIL) return "god";
  if (isAdminEmail(norm)) return "admin";
  return null;
}

function clampGod(perm: AppPermission, email: string | null): AppPermission {
  if (perm !== "god") return perm;
  return email?.toLowerCase().trim() === GOD_MODE_EMAIL ? "god" : "admin";
}

async function assertAdmin(
  req: Request,
  adminClient: ReturnType<typeof createClient>,
): Promise<{ ok: true; sub: string | null; email: string | null } | { ok: false; error: string }> {
  const userAuthHeader = req.headers.get("X-User-Auth") ?? req.headers.get("Authorization");
  const payload = jwtPayload(userAuthHeader);
  if (!payload) return { ok: false, error: "Missing or invalid user token" };

  const sub = jwtSub(payload);
  const email = jwtEmail(payload);
  const role = jwtRole(payload);

  // 1. WorkOS role claim (fastest — no DB round-trip)
  if (role === "god" || role === "admin") return { ok: true, sub, email };

  // 2. Email domain
  if (isAdminEmail(email)) return { ok: true, sub, email };

  // 3. DB lookup
  if (sub) {
    const { data, error } = await adminClient
      .from("user_roles")
      .select("permission")
      .eq("user_id", sub)
      .in("permission", ["admin", "god"]);
    if (!error && data?.length) return { ok: true, sub, email };
  }

  return { ok: false, error: `Not authorized. role=${role ?? "none"} email=${email ?? "none"} sub=${sub ?? "none"}` };
}

// ── WorkOS Management API ─────────────────────────────────────────────────────

type WorkOSUser = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  profile_picture_url: string | null;
};

type WorkOSOrgMembership = {
  user_id: string;
  role: { slug: string };
  status: string;
};

async function fetchAllPages<T>(
  apiKey: string,
  url: string,
): Promise<T[]> {
  const results: T[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (after) qs.set("after", after);
    const res = await fetch(`${url}?${qs}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`WorkOS API ${res.status}: ${await res.text()}`);
    const json = await res.json() as { data: T[]; list_metadata: { after: string | null } };
    results.push(...json.data);
    after = json.list_metadata?.after ?? null;
    if (!after) break;
  }
  return results;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const authResult = await assertAdmin(req, adminClient);
  if (!authResult.ok) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: 403,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const [profilesResult, rolesResult, activityResult] = await Promise.all([
      adminClient
        .from("profiles")
        .select("user_id, full_name, title, avatar_url, user_type, linkedin_url, twitter_url, location, created_at"),
      adminClient.from("user_roles").select("user_id, permission"),
      adminClient.from("user_activity").select("user_id, total_time_seconds, api_calls_count, last_active_at"),
    ]);

    const profileMap = new Map((profilesResult.data ?? []).map((p) => [p.user_id, p]));
    const dbRoleMap = new Map(
      (rolesResult.data ?? []).map((r) => [r.user_id, normalisePermission(r.permission)]),
    );
    const activityMap = new Map((activityResult.data ?? []).map((a) => [a.user_id, a]));

    // Optional WorkOS data
    let workosUserMap = new Map<string, WorkOSUser>();
    let workosRoleMap = new Map<string, AppPermission>();
    const workosKey = Deno.env.get("WORKOS_API_KEY")?.trim() ?? "";
    const workosOrgId = Deno.env.get("WORKOS_ORG_ID")?.trim() ?? "";

    if (workosKey) {
      try {
        const wUsers = await fetchAllPages<WorkOSUser>(
          workosKey,
          "https://api.workos.com/user_management/users",
        );
        workosUserMap = new Map(wUsers.map((u) => [u.id, u]));

        if (workosOrgId) {
          const memberships = await fetchAllPages<WorkOSOrgMembership>(
            workosKey,
            `https://api.workos.com/user_management/organization_memberships`,
          );
          for (const m of memberships) {
            if (m.status === "active") {
              workosRoleMap.set(m.user_id, normalisePermission(m.role.slug));
            }
          }
        }
      } catch (e) {
        console.warn("[admin-list-users] WorkOS fetch failed:", (e as Error).message);
      }
    }

    // Union of all known user IDs
    const idSet = new Set<string>();
    for (const p of profilesResult.data ?? []) idSet.add(p.user_id);
    for (const r of rolesResult.data ?? []) idSet.add(r.user_id);
    for (const [id] of workosUserMap) idSet.add(id);

    const users = [...idSet].map((id) => {
      const profile = profileMap.get(id);
      const workos = workosUserMap.get(id);
      const act = activityMap.get(id);
      const dbPerm = dbRoleMap.get(id) ?? null;
      const wosPerm = workosRoleMap.get(id) ?? null;
      const email = workos?.email ?? null;

      const finalPerm = clampGod(
        highest(wosPerm, dbPerm, autoPermForEmail(email)),
        email,
      );

      return {
        id,
        email: email ?? "",
        last_sign_in_at: workos?.last_sign_in_at ?? null,
        created_at: workos?.created_at ?? profile?.created_at ?? new Date(0).toISOString(),
        full_name:
          profile?.full_name ||
          [workos?.first_name, workos?.last_name].filter(Boolean).join(" ") ||
          "",
        avatar_url: profile?.avatar_url ?? workos?.profile_picture_url ?? null,
        user_type: profile?.user_type ?? "founder",
        title: profile?.title ?? null,
        linkedin_url: profile?.linkedin_url ?? null,
        twitter_url: profile?.twitter_url ?? null,
        location: profile?.location ?? null,
        permission: finalPerm,
        total_time_seconds: act?.total_time_seconds ?? 0,
        api_calls_count: act?.api_calls_count ?? 0,
        last_active_at: act?.last_active_at ?? null,
      };
    });

    users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return new Response(JSON.stringify({ users }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[admin-list-users] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
