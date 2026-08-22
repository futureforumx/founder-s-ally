/**
 * Fetch TechCrunch Venture + AlleyWatch Funding RSS once and upsert into
 * raw_source_articles. Both funding-ingest and vc-fund-sync read that table
 * instead of hitting the same feeds independently.
 *
 * Skip HTTP when the source was fetched within INGEST_SHARED_FEEDS_MAX_AGE_HOURS
 * (default 20). Force with INGEST_SHARED_FEEDS_FORCE=1.
 */
import { disconnectPipelinePrisma } from "../lib/pipelineDb.js";
import { syncSharedFeeds } from "./cache.js";

function log(msg: string) {
  console.log(`[ingest-shared-feeds] ${new Date().toISOString()} ${msg}`);
}

async function main() {
  const summary = await syncSharedFeeds(log);
  log(`summary=${JSON.stringify(summary)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPipelinePrisma();
  });
