import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseServiceClient } from "../_supabaseServiceClient.js";
import { fetchAhrefs, recordObservation } from "../_domainRating.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "Unauthorized" });
  const db = getSupabaseServiceClient();
  if (!db) return res.status(503).json({ error: "Backend is not configured" });
  if (!process.env.AHREFS_API_KEY || process.env.AHREFS_TRACKING_ENABLED === "false") return res.status(200).json({ skipped: "provider_not_configured_or_disabled" });
  const budget = Math.max(0, Number(process.env.AHREFS_REQUEST_BUDGET_PER_RUN || 50));
  const interval = Math.max(1, Number(process.env.AHREFS_REFRESH_INTERVAL_HOURS || 24));
  const concurrency = Math.max(1, Math.min(8, Number(process.env.AHREFS_CONCURRENCY || 2)));
  const now = new Date().toISOString();
  const { data: rows, error } = await db.from("domain_rating_tracking").select("*").eq("enabled", true).lte("next_eligible_refresh_at", now).order("next_eligible_refresh_at").limit(budget);
  if (error) return res.status(500).json({ error: "Could not load due ratings" });
  let cursor = 0, refreshed = 0, failed = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, rows?.length || 0) }, async () => {
    while (cursor < (rows?.length || 0)) {
      const row = rows![cursor++];
      const due = row.next_eligible_refresh_at;
      const next = new Date(Date.now() + interval * 3600000).toISOString();
      const claim = await db.from("domain_rating_tracking").update({ last_attempt_at: now, next_eligible_refresh_at: next, refresh_status: "pending", sanitized_error: null }).eq("id", row.id).eq("enabled", true).eq("next_eligible_refresh_at", due).select("id").maybeSingle();
      if (claim.error || !claim.data) continue; // another worker claimed it
      try {
        const cacheCutoff = new Date(Date.now() - interval * 3600000).toISOString();
        const cached = await db.from("domain_rating_observations").select("fetched_at").eq("domain", row.domain).eq("rating_version", row.rating_version).gte("fetched_at", cacheCutoff).order("fetched_at", { ascending: false }).limit(1).maybeSingle();
        let fetchedAt: string;
        if (cached.data) {
          fetchedAt = cached.data.fetched_at;
        } else {
          let result: Awaited<ReturnType<typeof fetchAhrefs>> | null = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try { result = await fetchAhrefs(row.domain, row.rating_version); break; }
            catch (error) {
              const err = error as Error & { retryAfter?: string };
              const permanent = ["provider_authentication_failed", "provider_invalid_response", "provider_not_configured"].includes(err.message);
              if (permanent || attempt === 2) throw err;
              const retryMs = err.retryAfter ? Math.min(60000, Math.max(1000, (Number(err.retryAfter) || 1) * 1000)) : (500 * 2 ** attempt + Math.random() * 500);
              await new Promise(resolve => setTimeout(resolve, retryMs));
            }
          }
          if (!result) throw new Error("provider_request_failed");
          fetchedAt = new Date().toISOString();
          await recordObservation(db, row.domain, row.rating_version, result.rating, result.licenseUrl, fetchedAt);
        }
        await db.from("domain_rating_tracking").update({ last_success_at: fetchedAt, refresh_status: "ready", sanitized_error: null }).eq("id", row.id);
        refreshed++;
      } catch (e) {
        failed++;
        const err = e as Error & { retryAfter?: string; status?: number };
        const authFailure = err.message === "provider_authentication_failed";
        const retrySecs = err.retryAfter ? Math.min(86400, Math.max(60, Number(err.retryAfter) || 0)) : 0;
        const delayMs = authFailure ? interval * 3600000 : retrySecs ? retrySecs * 1000 : Math.min(6 * 3600000, 5 * 60000 + Math.random() * 60000);
        const { data: prior } = await db.from("domain_rating_observations").select("id").eq("domain", row.domain).eq("rating_version", row.rating_version).limit(1);
        await db.from("domain_rating_tracking").update({ refresh_status: prior?.length ? "stale" : "error", sanitized_error: err.message === "provider_not_configured" ? err.message : authFailure ? "provider_authentication_failed" : err.message === "provider_rate_limited" ? "provider_rate_limited" : "provider_request_failed", next_eligible_refresh_at: new Date(Date.now() + delayMs).toISOString() }).eq("id", row.id);
      }
    }
  }));
  return res.status(200).json({ attempted: refreshed + failed, refreshed, failed, budget, concurrency });
}
