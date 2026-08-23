import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseServiceClient } from "../_supabaseServiceClient.js";

/**
 * GET /api/cron/update-leaderboard
 * Auth: Authorization: Bearer process.env.CRON_SECRET
 */

function setCors(res: VercelResponse): VercelResponse {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  return res;
}

function authorizeCronRequest(
  authorization: string | string[] | undefined,
  secret = process.env.CRON_SECRET,
): boolean {
  if (!secret) return false;
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  return (header ?? "").trim() === `Bearer ${secret}`;
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
    const loaded = await import("../_trendingIngest.js");
    if (typeof loaded.runTrendingLeaderboardPipeline !== "function") {
      throw new Error(`ingest export missing: ${Object.keys(loaded).join(",")}`);
    }
    const result = await loaded.runTrendingLeaderboardPipeline(client);
    res.status(200).json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : JSON.stringify(error);
    console.error("[update-leaderboard]", message, error);
    res.status(500).json({ error: message || "Leaderboard ingest failed" });
  }
}
