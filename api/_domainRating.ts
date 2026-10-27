import type { SupabaseClient } from "@supabase/supabase-js";

export const PROVIDER = "ahrefs";
export const ATTRIBUTION = { text: "Domain Rating by Ahrefs", url: "https://ahrefs.com/" };
export function normalizeDomain(value: string): string {
  const input = value.trim();
  if (!input || /\s|\\/.test(input)) throw new Error("Invalid domain");
  let url: URL;
  try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`); }
  catch { throw new Error("Invalid domain"); }
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) throw new Error("Invalid domain");
  const host = url.hostname.toLowerCase().replace(/\.$/, ""); // URL converts IDNs to ASCII.
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test") || host.endsWith(".invalid") || host.endsWith(".example")) throw new Error("Invalid domain");
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":")) throw new Error("IP addresses are not supported");
  if (host.length > 253 || !host.includes(".") || host.split(".").some(x => !/^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x))) throw new Error("Invalid domain");
  return host; // www and subdomains are preserved; each is a distinct rating history.
}

export async function fetchAhrefs(domain: string, version = process.env.AHREFS_RATING_VERSION || "dr3") {
  const key = process.env.AHREFS_API_KEY?.trim();
  if (!key) throw new Error("provider_not_configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AHREFS_TIMEOUT_MS || 10000));
  try {
    const url = new URL("https://api.ahrefs.com/v3/public/domain-rating-free");
    url.searchParams.set("target", domain); url.searchParams.set("output", "json"); url.searchParams.set("version", version);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal });
    if (!response.ok) {
      const err = new Error(response.status === 401 || response.status === 403 ? "provider_authentication_failed" : response.status === 429 ? "provider_rate_limited" : `provider_http_${response.status}`) as Error & { retryAfter?: string; status?: number };
      err.retryAfter = response.headers.get("retry-after") || undefined; err.status = response.status; throw err;
    }
    const body = await response.json() as { domain_rating?: { domain_rating?: unknown; license?: { url?: unknown }; license_url?: unknown } };
    const rating = body?.domain_rating?.domain_rating;
    if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > 100) throw new Error("provider_invalid_response");
    const license = body.domain_rating.license_url ?? body.domain_rating.license?.url;
    return { rating, licenseUrl: typeof license === "string" ? license : null };
  } finally { clearTimeout(timeout); }
}

export async function recordObservation(db: SupabaseClient, domain: string, version: string, rating: number, licenseUrl: string | null, fetchedAt = new Date().toISOString()) {
  const { data, error } = await db.from("domain_rating_observations").upsert({ domain, provider: PROVIDER, rating_version: version, rating, license_url: licenseUrl, fetched_at: fetchedAt }, { onConflict: "domain,rating_version,fetched_at", ignoreDuplicates: true }).select("*").maybeSingle();
  if (error) throw error;
  if (data) return data;
  const existing = await db.from("domain_rating_observations").select("*").eq("domain", domain).eq("rating_version", version).eq("fetched_at", fetchedAt).maybeSingle();
  if (existing.error || !existing.data) throw existing.error || new Error("observation_write_failed");
  return existing.data;
}
