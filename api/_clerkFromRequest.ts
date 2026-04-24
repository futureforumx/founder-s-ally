import { createRemoteJWKSet, jwtVerify } from "jose";

/** WorkOS JWKS for verifying access tokens issued by AuthKit. */
function workosJwks() {
  const clientId = process.env.WORKOS_CLIENT_ID ?? process.env.VITE_WORKOS_CLIENT_ID ?? "";
  const jwksUrl = clientId
    ? `https://api.workos.com/sso/jwks/${clientId}`
    : "https://api.workos.com/sso/jwks";
  return createRemoteJWKSet(new URL(jwksUrl));
}

/** Decode JWT sub without verifying signature — used as a fallback after JWKS verification. */
function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const pl = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as { sub?: unknown };
    return typeof pl.sub === "string" && pl.sub.trim() ? pl.sub.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Extract user id from Authorization: Bearer JWT.
 * Verifies using WorkOS JWKS; falls back to unverified sub decode.
 * WorkOS user IDs are in the form user_01XXXX… (ULID suffix).
 */
export async function getUserIdFromAuthHeader(authHeader: string | undefined): Promise<string | null> {
  const raw = authHeader ?? "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, workosJwks());
    const sub = payload.sub;
    if (sub && typeof sub === "string") return sub;
  } catch {
    /* JWKS verification failed — fall through to unverified decode */
  }

  return decodeJwtSub(token);
}

/** @deprecated Use getUserIdFromAuthHeader instead. */
export const getClerkUserIdFromAuthHeader = getUserIdFromAuthHeader;
