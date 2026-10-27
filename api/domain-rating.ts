import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClerkUserIdFromAuthHeader } from "./_clerkFromRequest.js";
import { assertOwnerContextForUser } from "./_ownerContextAccess.js";
import { getSupabaseServiceClient } from "./_supabaseServiceClient.js";
import { ATTRIBUTION, normalizeDomain } from "./_domainRating.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const userId = await getClerkUserIdFromAuthHeader(req.headers.authorization);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const db = getSupabaseServiceClient();
  if (!db) return res.status(503).json({ error: "Backend is not configured" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const ownerContextId = typeof body.ownerContextId === "string" ? body.ownerContextId : "";
  const startupId = typeof body.startupId === "string" ? body.startupId : "";
  if (!(await assertOwnerContextForUser(db, userId, ownerContextId))) return res.status(404).json({ error: "Not found" });
  if (!startupId) return res.status(400).json({ error: "startupId is required" });
  const { data: startup } = await db.from("startups").select("id, company_url").eq("id", startupId).maybeSingle();
  if (!startup) return res.status(404).json({ error: "Not found" });
  const { data: existing } = await db.from("domain_rating_tracking").select("*").eq("owner_context_id", ownerContextId).eq("startup_id", startupId).maybeSingle();
  const action = body.action;
  if (action === "enable" || action === "change") {
    let domain: string;
    try { domain = normalizeDomain(typeof body.domain === "string" ? body.domain : startup.company_url || ""); }
    catch { return res.status(400).json({ error: "A valid public domain is required" }); }
    const now = new Date().toISOString();
    const { data, error } = await db.from("domain_rating_tracking").upsert({ owner_context_id: ownerContextId, startup_id: startupId, domain, provider: "ahrefs", rating_version: process.env.AHREFS_RATING_VERSION || "dr3", enabled: true, refresh_status: "pending", next_eligible_refresh_at: now, sanitized_error: null }, { onConflict: "owner_context_id,startup_id" }).select("*").single();
    if (error) return res.status(500).json({ error: "Could not save tracking configuration" });
    return res.status(200).json({ tracking: data, attribution: ATTRIBUTION, configurationStatus: process.env.AHREFS_API_KEY ? "configured" : "provider_not_configured" });
  }
  if (action === "stop") {
    if (existing) await db.from("domain_rating_tracking").update({ enabled: false, refresh_status: "disabled", next_eligible_refresh_at: null }).eq("id", existing.id);
    return res.status(200).json({ status: "disabled" });
  }
  if (!existing) return res.status(200).json({ domain: null, status: "disabled", attribution: ATTRIBUTION });
  if (action === "refresh") {
    if (existing.next_eligible_refresh_at && new Date(existing.next_eligible_refresh_at).getTime() > Date.now()) return res.status(200).json({ tracking: existing, refreshQueued: false, attribution: ATTRIBUTION });
    const { error } = await db.from("domain_rating_tracking").update({ next_eligible_refresh_at: new Date().toISOString(), refresh_status: "pending" }).eq("id", existing.id);
    if (error) return res.status(500).json({ error: "Could not request refresh" });
  }
  const { data: recent = [], error } = await db.from("domain_rating_observations").select("rating, fetched_at, license_url").eq("domain", existing.domain).eq("rating_version", existing.rating_version).order("fetched_at", { ascending: false }).limit(Math.max(1, Math.min(Number(body.limit) || 90, 365)));
  if (error) return res.status(500).json({ error: "Could not load rating history" });
  const history = recent.reverse();
  const latest = history.at(-1) || null;
  const compare = (days: number) => { if (!latest) return null; const prior = [...history].reverse().find((o: any) => new Date(o.fetched_at).getTime() <= new Date(latest.fetched_at).getTime() - days * 86400000); return prior ? { change: Number(latest.rating) - Number(prior.rating), from: prior.fetched_at, to: latest.fetched_at } : null; };
  const stale = !latest || Date.now() - new Date(latest.fetched_at).getTime() > 26 * 3600000;
  return res.status(200).json({ domain: existing.domain, provider: existing.provider, ratingVersion: existing.rating_version, currentRating: latest ? Number(latest.rating) : null, trackingStartedAt: existing.tracking_started_at, latestFetchedAt: latest?.fetched_at || null, status: existing.enabled ? (latest ? (stale ? "stale" : "ready") : existing.refresh_status) : "disabled", nextEligibleRefreshAt: existing.next_eligible_refresh_at, history, changes: { days7: compare(7), days30: compare(30) }, attribution: ATTRIBUTION, configurationStatus: process.env.AHREFS_API_KEY ? "configured" : "provider_not_configured" });
}
