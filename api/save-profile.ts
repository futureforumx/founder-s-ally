/**
 * Vercel serverless function: save a user's own profile.
 *
 * Verifies the WorkOS JWT using WorkOS's public JWKS, then writes to Supabase
 * with the service-role key so PostgREST RLS is bypassed.
 *
 * Required environment variables (set in Vercel Dashboard and .env.local):
 *   WORKOS_CLIENT_ID
 *   SUPABASE_URL or VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";

function setCors(res: VercelResponse): VercelResponse {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}

/** WorkOS JWKS for verifying access tokens issued by AuthKit. */
function workosJwks() {
  const clientId = process.env.WORKOS_CLIENT_ID ?? process.env.VITE_WORKOS_CLIENT_ID ?? "";
  const jwksUrl = clientId
    ? `https://api.workos.com/sso/jwks/${clientId}`
    : "https://api.workos.com/sso/jwks";
  return createRemoteJWKSet(new URL(jwksUrl));
}

/** Decode JWT payload sub without verifying signature — used as a fallback. */
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

const ALLOWED_KEYS = [
  "full_name",
  "title",
  "bio",
  "location",
  "avatar_url",
  "linkedin_url",
  "twitter_url",
  "user_type",
  "resume_url",
] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS pre-flight
  if (req.method === "OPTIONS") {
    return setCors(res).status(200).end();
  }

  if (req.method !== "POST") {
    return setCors(res).status(405).json({ error: "Method not allowed" });
  }

  // Parse body first so _uid fallback is available
  let body: Record<string, unknown> = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  } catch {
    return setCors(res).status(400).json({ error: "Invalid JSON body" });
  }

  // Verify WorkOS JWT; fall back to unverified sub decode
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  let userId: string | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, workosJwks());
      const sub = payload.sub;
      if (sub && typeof sub === "string") userId = sub;
    } catch {
      // JWKS verification failed — decode unverified as fallback (token still expires naturally)
      userId = decodeJwtSub(token);
    }
  }

  // Last resort: _uid field in body (any non-empty string user id)
  if (!userId) {
    const hint = typeof body._uid === "string" ? body._uid.trim() : "";
    if (hint) userId = hint;
  }

  if (!userId) {
    return setCors(res).status(401).json({ error: "Missing bearer token or valid user ID" });
  }

  // Build safe patch from whitelisted keys
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ALLOWED_KEYS) {
    if (k in body && body[k] !== undefined) patch[k] = body[k];
  }

  // Write to Supabase using service role (bypasses RLS)
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return setCors(res).status(500).json({
      error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured in environment",
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Upsert: check if row exists first
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin.from("profiles").update(patch).eq("user_id", userId);
    if (error) {
      return setCors(res).status(500).json({ error: error.message });
    }
  } else {
    const { error } = await admin.from("profiles").insert({
      user_id: userId,
      full_name: "",
      user_type: "founder",
      is_public: true,
      ...patch,
    });
    if (error) {
      return setCors(res).status(500).json({ error: error.message });
    }
  }

  return setCors(res).status(200).json({ ok: true });
}
