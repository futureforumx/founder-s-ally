import { createRemoteJWKSet, jwtVerify } from "jose";
import { getWorkOSUserIdFromAccessToken } from "../src/lib/workosAuth.js";

function clerkJwks() {
  const clerkDomain = process.env.VITE_CLERK_PUBLISHABLE_KEY
    ? decodeClerkDomain(process.env.VITE_CLERK_PUBLISHABLE_KEY)
    : null;
  const jwksUrl = clerkDomain
    ? `https://${clerkDomain}/.well-known/jwks.json`
    : "https://api.clerk.com/v1/jwks";
  return createRemoteJWKSet(new URL(jwksUrl));
}

function decodeClerkDomain(pk: string): string | null {
  try {
    const b64 = pk.replace(/^pk_(live|test)_/, "");
    const decoded = Buffer.from(b64, "base64").toString("utf8").replace(/\0/g, "").trim();
    return decoded.replace(/^https?:\/\//, "").replace(/\$$/, "").trim() || null;
  } catch {
    return null;
  }
}

/** Extract the current auth user id from Authorization: Bearer JWT. Supports WorkOS and Clerk. */
export async function getAuthUserIdFromAuthHeader(authHeader: string | undefined): Promise<string | null> {
  const raw = authHeader ?? "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
  if (!token) return null;

  const workosSub = await getWorkOSUserIdFromAccessToken(token);
  if (workosSub) return workosSub;

  try {
    const { payload } = await jwtVerify(token, clerkJwks());
    const sub = payload.sub;
    if (sub && typeof sub === "string") return sub;
  } catch {
    /* fall through */
  }

  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      const pl = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as { sub?: string };
      if (typeof pl.sub === "string" && /^user_[A-Za-z0-9]{20,}$/.test(pl.sub)) return pl.sub;
    }
  } catch {
    /* ok */
  }
  return null;
}

export const getClerkUserIdFromAuthHeader = getAuthUserIdFromAuthHeader;
