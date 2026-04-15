/**
 * No DATABASE_URL required — fetches listing pages / RSS for each source and prints JSON.
 * Use after `npx playwright install chromium` for startups.gallery (Framer).
 *
 *   npx tsx scripts/funding-ingest/smoke-test.ts
 *   INGEST_MAX_ARTICLES_PER_SOURCE=3 npx tsx scripts/funding-ingest/smoke-test.ts
 */
import {
  fetchTechcrunchVenture,
  fetchAlleywatchFunding,
  fetchGeekwireFundings,
  fetchStartupsGalleryNews,
  LISTING_PAGE_URLS,
} from "./sources.js";

function log(s: string) {
  console.log(`[smoke] ${s}`);
}

async function main() {
  const max = Math.max(1, parseInt(process.env.INGEST_MAX_ARTICLES_PER_SOURCE || "4", 10));
  const since = null;
  const out: Record<string, unknown> = { listing_pages: LISTING_PAGE_URLS };

  out.techcrunch = await fetchTechcrunchVenture(since, max, log).catch((e) => ({ error: String(e) }));
  out.alleywatch = await fetchAlleywatchFunding(since, max, log).catch((e) => ({ error: String(e) }));
  out.geekwire = await fetchGeekwireFundings(since, max, log).catch((e) => ({ error: String(e) }));
  out.startups_gallery = await fetchStartupsGalleryNews(since, max, log).catch((e) => ({ error: String(e) }));

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
