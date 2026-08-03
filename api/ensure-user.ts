/**
 * Vercel serverless function: ensure a users row + default profiles row exist.
 *
 * Called by the browser after a successful Supabase auth session is available.
 * Uses the service-role key so the default app rows exist before onboarding.
 *
 * POST /api/ensure-user
 * Body: { _uid: string, email?: string, display_name?: string, avatar_url?: string }
 *
 * Required environment variables:
 *   SUPABASE_URL or VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { ensureAppUserRows } from "./_ensureAppUser.js";

function setCors(res: VercelResponse): VercelResponse {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}

/** Best-effort public IP of the caller from proxy headers (Vercel sets x-forwarded-for). */
function extractClientIp(req: VercelRequest): string | null {
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (typeof raw === "string" && raw.trim()) {
    const first = raw.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers["x-real-ip"];
  const real = Array.isArray(realIp) ? realIp[0] : realIp;
  if (typeof real === "string" && real.trim()) return real.trim();
  return null;
}

function extractUserIdFromToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const pl = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    if (typeof pl.sub === "string" && pl.sub.length > 0) return pl.sub;
    return null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    return setCors(res).status(200).end();
  }

  if (req.method !== "POST") {
    return setCors(res).status(405).json({ error: "Method not allowed" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  } catch {
    return setCors(res).status(400).json({ error: "Invalid JSON body" });
  }

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  let userId: string | null = token ? extractUserIdFromToken(token) : null;

  if (!userId) {
    const hint = typeof body._uid === "string" ? body._uid.trim() : "";
    if (hint.length > 0) userId = hint;
  }

  if (!userId) {
    return setCors(res).status(401).json({ error: "Missing bearer token or valid user ID" });
  }

  const email = typeof body.email === "string" ? body.email.trim() : null;
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : null;
  const avatarUrl = typeof body.avatar_url === "string" ? body.avatar_url.trim() : null;

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

  const clientIp = extractClientIp(req);
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;

  // Block banned emails / IPs before provisioning any app rows.
  try {
    const { data: banned } = await admin.rpc("is_identity_banned", {
      _email: email,
      _ip: clientIp,
    });
    if (banned === true) {
      return setCors(res).status(403).json({ error: "This account has been banned." });
    }
  } catch (e) {
    console.error("[ensure-user] ban check failed:", (e as Error).message);
  }

  const result = await ensureAppUserRows(admin, {
    userId,
    email,
    displayName,
    avatarUrl,
  });

  if (result.ok === false) {
    return setCors(res).status(result.status).json({ error: result.error });
  }

  // Record the caller IP so it can later be reviewed / banned by admins.
  if (clientIp) {
    try {
      const nowIso = new Date().toISOString();
      const { error: ipError } = await admin.from("user_ip_log").upsert(
        {
          user_id: userId,
          ip_address: clientIp,
          user_agent: userAgent,
          last_seen_at: nowIso,
        },
        { onConflict: "user_id,ip_address", ignoreDuplicates: false },
      );
      if (ipError) console.error("[ensure-user] ip log upsert failed:", ipError.message);
    } catch (e) {
      console.error("[ensure-user] ip log upsert threw:", (e as Error).message);
    }
  }

  return setCors(res).status(200).json({ ok: true, profile: result.profile });
}
