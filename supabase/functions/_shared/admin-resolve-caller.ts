import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload, type JWTVerifyOptions } from "https://esm.sh/jose@5.9.6";
import { clerkGetUser, clerkPrimaryEmail } from "./clerk-backend.ts";

export type ResolvedAdminCaller = {
  /** Canonical id for Clerk-keyed rows (prefer `user_…`). */
  id: string;
  /** All ids to match against `user_roles.user_id` (`sub` may be a Supabase UUID while the row uses `user_…`). */
  identityUserIds: string[];
  email: string | null;
  user_metadata: Record<string, unknown>;
};

/** Collect possible user ids from a verified Clerk JWT (session vs `supabase` template). */
export function collectIdentityUserIdsFromPayload(payload: JWTPayload): string[] {
  const out = new Set<string>();
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.add(v.trim());
    if (typeof v === "number" && Number.isFinite(v)) out.add(String(v));
  };
  const p = payload as Record<string, unknown>;
  push(p.sub);
  push(p.clerk_user_id);
  push(p.user_id);
  push(p.external_id);
  const um = p.user_metadata;
  if (um && typeof um === "object" && !Array.isArray(um)) {
    const m = um as Record<string, unknown>;
    push(m.clerk_user_id);
    push(m.sub);
    push(m.user_id);
  }
  const am = p.app_metadata;
  if (am && typeof am === "object" && !Array.isArray(am)) {
    const a = am as Record<string, unknown>;
    push(a.sub);
    push(a.user_id);
    push(a.provider_id);
  }
  return [...out];
}

function bearerToken(authHeader: string | null): string | null {
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;
  const t = authHeader.slice(7).trim();
  return t || null;
}

function isLikelyClerkIssuer(iss: string): boolean {
  try {
    const h = new URL(iss).hostname;
    return h.includes("clerk") || h.endsWith("accounts.dev");
  } catch {
    return false;
  }
}

function audienceOption(dec: ReturnType<typeof decodeJwt>): JWTVerifyOptions["audience"] {
  const aud = dec.aud;
  if (typeof aud === "string") return aud;
  if (Array.isArray(aud) && aud.every((x) => typeof x === "string")) return aud as string[];
  return undefined;
}

/** Best-effort email from Clerk session JWT claims (shape varies by Clerk version / template). */
function emailFromClerkPayload(payload: Record<string, unknown>): string | null {
  const direct = payload.email;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const pea = payload.primary_email_address;
  if (typeof pea === "string" && pea.trim()) return pea.trim();
  if (pea && typeof pea === "object" && pea !== null && !Array.isArray(pea)) {
    const ea = (pea as Record<string, unknown>).email_address;
    if (typeof ea === "string" && ea.trim()) return ea.trim();
  }

  const addrs = payload.email_addresses;
  if (Array.isArray(addrs) && addrs.length > 0) {
    const first = addrs[0];
    if (first && typeof first === "object" && first !== null) {
      const ea = (first as Record<string, unknown>).email_address;
      if (typeof ea === "string" && ea.trim()) return ea.trim();
    }
  }
  return null;
}

/** Verify Clerk-issued session / template JWT via Clerk JWKS (no Supabase third-party auth required). */
async function verifyClerkJwt(
  token: string,
): Promise<{
  identityUserIds: string[];
  canonicalId: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
}> {
  const dec = decodeJwt(token);
  const issRaw = dec.iss;
  if (typeof issRaw !== "string" || !issRaw.trim()) throw new Error("JWT missing iss");
  const iss = issRaw.replace(/\/$/, "");
  if (!isLikelyClerkIssuer(iss)) throw new Error("Not a Clerk issuer");

  const jwks = createRemoteJWKSet(new URL(`${iss}/.well-known/jwks.json`));
  const opts: JWTVerifyOptions = { issuer: iss, clockTolerance: 120 };
  const aud = audienceOption(dec);
  if (aud !== undefined) opts.audience = aud;

  const { payload } = await jwtVerify(token, jwks, opts);
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw new Error("JWT missing sub");

  let identityUserIds = collectIdentityUserIdsFromPayload(payload);
  if (!identityUserIds.length) identityUserIds = [sub];

  const clerkLikeId = identityUserIds.find((id) => id.startsWith("user_")) ?? null;
  const canonicalId = clerkLikeId ?? sub;

  const asRecord = payload as Record<string, unknown>;
  let email = emailFromClerkPayload(asRecord);
  const user_metadata: Record<string, unknown> = {};

  const clerkSecret = Deno.env.get("CLERK_SECRET_KEY")?.trim() ?? "";
  if (clerkSecret) {
    const fetchClerkId = clerkLikeId ?? (sub.startsWith("user_") ? sub : null);
    if (fetchClerkId) {
      try {
        const u = await clerkGetUser(clerkSecret, fetchClerkId);
        if (u) {
          const fromApi = clerkPrimaryEmail(u);
          if (fromApi.trim()) email = fromApi.trim();
          const meta = u.public_metadata;
          if (meta && typeof meta === "object" && !Array.isArray(meta) && typeof (meta as Record<string, unknown>).role === "string") {
            user_metadata.role = (meta as { role: string }).role;
          }
        }
      } catch (e) {
        console.warn("[verifyClerkJwt] clerkGetUser:", (e as Error).message);
      }
    }
  }

  return { identityUserIds, canonicalId, email, user_metadata };
}

/**
 * Resolve the signed-in user for admin edge functions.
 * - Prefers Clerk JWT verification (session or template) so `auth.getUser()` is not required.
 * - Falls back to `supabase.auth.getUser()` for native Supabase sessions.
 */
export async function resolveAdminCaller(
  authHeader: string | null,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<ResolvedAdminCaller | { error: string }> {
  const token = bearerToken(authHeader);
  if (!token) return { error: "Missing authorization" };

  try {
    const { identityUserIds, canonicalId, email, user_metadata } = await verifyClerkJwt(token);
    return { id: canonicalId, identityUserIds, email, user_metadata };
  } catch {
    /* fall through */
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader! } },
  });
  const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
  if (authError || !caller) return { error: "Unauthorized" };

  return {
    id: caller.id,
    identityUserIds: [caller.id],
    email: caller.email ?? null,
    user_metadata: (caller.user_metadata ?? {}) as Record<string, unknown>,
  };
}
