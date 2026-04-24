/**
 * admin-manage-user — Invite or delete a user via WorkOS Management API.
 *
 * Auth: WorkOS JWT in X-User-Auth (anon key in Authorization to pass gateway).
 *
 * POST body:
 *   { action: "invite", email: string, permission?: "god" | "admin" | "member" }
 *   { action: "delete", user_id: string }
 *
 * Env required:
 *   WORKOS_API_KEY   — WorkOS Management API key
 *   WORKOS_ORG_ID    — (optional) sets org + role on invite
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-auth",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_EMAIL_DOMAINS = ["vekta.so", "tryvekta.com"];
const VALID_PERMISSIONS = ["god", "admin", "member"] as const;

// ── JWT helpers ───────────────────────────────────────────────────────────────

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

  const role = jwtRole(payload);
  if (role === "god" || role === "admin") return { ok: true };

  const email = jwtEmail(payload);
  if (isAdminEmail(email)) return { ok: true };

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

// ── WorkOS helpers ────────────────────────────────────────────────────────────

async function workosRequest(
  apiKey: string,
  method: "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  let reqBody: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    reqBody = JSON.stringify(body);
  }
  const res = await fetch(`https://api.workos.com${path}`, { method, headers, body: reqBody });
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return { ok: res.ok, status: res.status };
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (json as { message?: string }).message ??
      (json as { error?: string }).error ??
      `WorkOS ${res.status}`;
    return { ok: false, status: res.status, error: msg };
  }
  return { ok: true, status: res.status, data: json };
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const workosKey = Deno.env.get("WORKOS_API_KEY")?.trim() ?? "";
  const workosOrgId = Deno.env.get("WORKOS_ORG_ID")?.trim() ?? "";

  const adminClient = createClient(supabaseUrl, serviceKey);

  const authResult = await assertAdmin(req, adminClient);
  if (!authResult.ok) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: 403,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: { action?: string; email?: string; permission?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { action } = body;

  // ── INVITE ──────────────────────────────────────────────────────────────────
  if (action === "invite") {
    const email = body.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!workosKey) {
      return new Response(JSON.stringify({ error: "WORKOS_API_KEY not configured on server" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const permission = (VALID_PERMISSIONS as readonly string[]).includes(body.permission ?? "")
      ? body.permission!
      : "member";

    const inviteBody: Record<string, unknown> = { email };
    if (workosOrgId) {
      inviteBody.organization_id = workosOrgId;
      inviteBody.role_slug = permission;
    }

    const result = await workosRequest(workosKey, "POST", "/user_management/invitations", inviteBody);
    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, invitation: result.data }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────
  if (action === "delete") {
    const userId = body.user_id?.trim();
    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Delete from WorkOS (404 = already gone, which is fine)
    if (workosKey) {
      const result = await workosRequest(workosKey, "DELETE", `/user_management/users/${userId}`);
      if (!result.ok && result.status !== 404) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
    }

    // Cleanup DB records regardless of WorkOS result
    await Promise.all([
      adminClient.from("user_roles").delete().eq("user_id", userId),
      adminClient.from("profiles").delete().eq("user_id", userId),
    ]);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: `Unknown action: ${String(action)}` }), {
    status: 400,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
