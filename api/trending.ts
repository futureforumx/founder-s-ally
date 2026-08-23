import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseServiceClient } from "./_supabaseServiceClient.js";
import { readTrendingCache, trendingCacheControlHeader } from "../_trendingCache.js";
import { emptyTrendingCatalog, findTrendingStartup } from "../_trendingCatalog.js";
import { TRENDING_PAGE_LIMIT } from "../_trendingConstants.js";

/** GET /api/trending — read-only `trending_cache`. No scoring or source APIs on page load. */

function setCors(res: VercelResponse): VercelResponse {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  return res;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const needle = typeof id === "string" && id.trim() ? id.trim() : undefined;

  const client = getSupabaseServiceClient();
  const catalog = client
    ? await readTrendingCache(client, needle ? { id: needle } : { limit: TRENDING_PAGE_LIMIT })
    : emptyTrendingCatalog(new Date().toISOString());

  res.setHeader("Cache-Control", trendingCacheControlHeader());

  if (needle) {
    const startup = catalog.startups[0] ?? findTrendingStartup(needle, catalog);
    if (!startup) {
      res.status(404).json({ error: "Startup not found", generatedAt: catalog.generatedAt });
      return;
    }
    res.status(200).json({ ...catalog, startups: [startup] });
    return;
  }

  res.status(200).json(catalog);
}
