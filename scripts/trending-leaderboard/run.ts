/**
 * Refresh public.trending_cache (the /trending-startups leaderboard).
 *
 *   pnpm run trending:leaderboard
 *
 * Requires VITE_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
 */
import { getSupabaseServiceClient } from "../../api/_supabaseServiceClient.js";
import { runTrendingLeaderboardPipeline } from "../../api/_trendingIngest.js";
import { loadEnvFiles } from "../lib/loadEnvFiles.js";

loadEnvFiles([".env", ".env.local"]);

async function main() {
  const client = getSupabaseServiceClient();
  if (!client) {
    throw new Error(
      "VITE_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required to refresh trending_cache",
    );
  }
  const result = await runTrendingLeaderboardPipeline(client);
  console.log(`[trending-leaderboard] ${JSON.stringify(result)}`);
}

main().catch((error) => {
  console.error("[trending-leaderboard]", error instanceof Error ? error.message : error);
  process.exit(1);
});
