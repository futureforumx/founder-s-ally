/** Decode Clerk (or any JWT) payload `sub` without verifying signature — edge-only, after gateway trust. */
export function jwtSub(authHeader: string | null): string | null {
  const p = jwtPayload(authHeader);
  const s = p?.sub;
  if (typeof s === "string" && s.trim()) return s.trim();
  if (typeof s === "number" && Number.isFinite(s)) return String(s);
  return null;
}

/** Raw JWT payload (unverified). */
export function jwtPayload(authHeader: string | null): Record<string, unknown> | null {
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const rem = b64.length % 4;
    if (rem) b64 += "=".repeat(4 - rem);
    const json = atob(b64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * True if `userId` matches a caller identity claim on the JWT.
 * Clerk session tokens use `sub` = Clerk user id. Clerk “supabase” templates sometimes use a different `sub`
 * but may include the Clerk user id in other claims — we accept common shapes so DB user_id (Clerk id) lines up.
 */
export function jwtSubjectMatchesUser(authHeader: string | null, userId: string): boolean {
  if (!userId.trim()) return false;
  const p = jwtPayload(authHeader);
  if (!p) return false;
  const candidates = new Set<string>();
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) candidates.add(v.trim());
    if (typeof v === "number" && Number.isFinite(v)) candidates.add(String(v));
  };
  push(p.sub);
  push(p.user_id);
  push(p.external_id);
  push(p.clerk_user_id);
  const meta = p.user_metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const m = meta as Record<string, unknown>;
    push(m.clerk_user_id);
    push(m.sub);
    push(m.user_id);
  }
  const app = p.app_metadata;
  if (app && typeof app === "object" && !Array.isArray(app)) {
    const a = app as Record<string, unknown>;
    push(a.sub);
    push(a.user_id);
    push(a.provider_id);
  }
  for (const [k, v] of Object.entries(p)) {
    if (k.startsWith("https://")) push(v);
  }
  return candidates.has(userId.trim());
}

/**
 * DB `user_id` for founder tables is the Clerk id from the app when provided.
 * If the JWT `sub` is a Supabase UUID but the payload also carries the Clerk id (common misconfigured templates),
 * we still accept `bodyUserId` when it appears anywhere in identity claims.
 */
export function resolveEdgeUserId(
  authHeader: string | null,
  bodyUserId: string | undefined | null,
): { ok: true; userId: string } | { ok: false; status: number; error: string } {
  const trimmed = typeof bodyUserId === "string" ? bodyUserId.trim() : "";
  if (trimmed) {
    if (!jwtSubjectMatchesUser(authHeader, trimmed)) {
      return {
        ok: false,
        status: 403,
        error:
          "JWT does not identify this user. Send a Clerk session token, or set your Clerk \"supabase\" JWT template so your Clerk user id appears in JWT claims (recommended: sub: {{user.id}}).",
      };
    }
    return { ok: true, userId: trimmed };
  }
  const sub = jwtSub(authHeader);
  if (!sub) {
    return {
      ok: false,
      status: 401,
      error: "Missing or invalid bearer token (need JWT with sub).",
    };
  }
  return { ok: true, userId: sub };
}
