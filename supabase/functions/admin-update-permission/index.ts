/**
 * admin-update-permission — Upsert a user's permission in user_roles.
 *
 * Auth: WorkOS JWT in X-User-Auth (anon key in Authorization to pass gateway).
 * Body: { target_user_id: string, permission: "god" | "admin" | "member" }
 *
 * WorkOS roles: GOD | ADMIN | MEMBER
 * "member" is stored as "member" in user_roles (replaces legacy "user" / "manager").
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-auth",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_EMAIL_DOMAINS = ["vekta.so", "tryvekta.com"];
const VALID_PERMISSIONS = ["god", "admin", "member"] as const;
type Permission = (typeof VALID_PERMISSIONS)[number];

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

async function assertAdmin(
  req: Request,
  adminClient: ReturnType<typeof createClient>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userAuthHeader = req.headers.get("X-User-Auth") ?? req.headers.get("Authorization");
  const payload = jwtPayload(userAuthHeader);
  if (!payload) return { ok: false, error: "Missing or invalid user token" };

  // 1. WorkOS role claim
  const role = jwtRole(payload);
  if (role === "god" || role === "admin") return { ok: true };

  // 2. Email domain
  const email = jwtEmail(payload);
  if (isAdminEmail(email)) return { ok: true };

  // 3. DB lookup
  const sub = jwtSub(payload);
  if (sub) {
    const { data, error } = await adminClient
      .from("user_roles")
      .select("permission")
      .eq("user_id", sub)
      .in("permission", ["admin", "god"]);
    if (!error && data?.length) return { ok: true };
  }

  return { ok: false, error: "Not authorized" };
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

  let body: { target_user_id?: string; permission?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { target_user_id, permission } = body;
  if (!target_user_id?.trim()) {
    return new Response(JSON.stringify({ error: "target_user_id is required" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!permission || !(VALID_PERMISSIONS as readonly string[]).includes(permission)) {
    return new Response(
      JSON.stringify({ error: `permission must be one of: ${VALID_PERMISSIONS.join(", ")}` }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const { error } = await adminClient
    .from("user_roles")
    .upsert(
      { user_id: target_user_id.trim(), permission: permission as Permission },
      { onConflict: "user_id" },
    );

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
