import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseServiceClient } from "../_supabaseServiceClient.js";
import { authorizeCronRequest, runTrendingLeaderboardPipeline } from "../_trendingStartups/ingest.js";

/**
 * GET /api/cron/update-leaderboard
 * Vercel Cron analog of Next.js `app/api/cron/update-leaderboard/route.ts`.
 * Auth: Authorization: Bearer process.env.CRON_SECRET
 */

function setCors(res: VercelResponse): VercelResponse {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
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

  if (!authorizeCronRequest(req.headers.authorization)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const client = getSupabaseServiceClient();
  if (!client) {
    res.status(503).json({ error: "Supabase service client is not configured" });
    return;
  }

  try {
    const result = await runTrendingLeaderboardPipeline(client);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Leaderboard ingest failed";
    res.status(500).json({ error: message });
  }
}
