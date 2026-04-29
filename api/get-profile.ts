/**
 * Vercel serverless function: read a user's own profile.
 *
 * Extracts user identity from a signed-in JWT sub, or falls back to the _uid
 * query-param/body field. Reads via service-role key so
 * PostgREST RLS is bypassed and no Supabase JWT config is needed.
 *
 * GET  /api/get-profile           (Authorization: Bearer <jwt>)
 * POST /api/get-profile           (Authorization: Bearer <jwt> or body._uid)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function setCors(res: VercelResponse): VercelResponse {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return res;
}

function extractUserIdFromToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const pl = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    if (typeof pl.sub === "string" && /^user_[A-Za-z0-9]{20,}$/.test(pl.sub)) {
      return pl.sub;
    }
    // Also accept plain UUID subs (Supabase native auth)
    if (typeof pl.sub === "string" && pl.sub.length > 0) {
      return pl.sub;
    }
    return null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    return setCors(res).status(200).end();
  }

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  let userId: string | null = extractUserIdFromToken(token);

  // Fallback: _uid query param or body field (POST)
  if (!userId) {
    const uidHint =
      (req.query._uid as string | undefined)?.trim() ||
      (typeof req.body === "object" && req.body !== null
        ? (req.body._uid as string | undefined)?.trim()
        : undefined) ||
      "";
    if (/^user_[A-Za-z0-9]{20,}$/.test(uidHint)) userId = uidHint;
    else if (uidHint.length > 0) userId = uidHint; // accept UUIDs too
  }

  if (!userId) {
    return setCors(res).status(401).json({ error: "Missing bearer token or valid user ID" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return setCors(res)
      .status(500)
      .json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return setCors(res).status(500).json({ error: error.message });
  }

  return setCors(res).status(200).json({ ok: true, profile: data });
}
