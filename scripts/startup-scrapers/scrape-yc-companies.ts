/**
 * YC Companies Scraper — ycombinator.com/companies
 * ==================================================
 * Scrapes YC company directory. YC's directory is a React app backed by Algolia.
 *
 * Strategy:
 *   1. Fetch company slugs from the sitemap (public, robots-safe)
 *   2. For each slug, fetch the company page and extract structured data
 *      from the embedded JSON/HTML (name, description, batch, status,
 *      founders, location, sector, website, etc.)
 *
 * This complements the existing seed-yc-professionals.ts which focuses
 * on founders; this script captures company-level data.
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-yc-companies.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-yc-companies.ts
 *   YC_COMPANIES_MAX=50 npx tsx scripts/startup-scrapers/scrape-yc-companies.ts
 *   YC_COMPANIES_CONCURRENCY=4 npx tsx scripts/startup-scrapers/scrape-yc-companies.ts
 */

import {
  upsertStartup,
  normalizeDomain,
  ScrapeProgress,
  ScrapeStats,
  sleep,
  type StartupIngestPayload,
  type FounderIngestPayload,
} from "../lib/startupScraper";

import {
  YC_COMPANY_SITEMAP_URL as SITEMAP_URL,
  fetchYcCompanyHtml as fetchText,
  parseSlugsFromYcCompanySitemap as parseSlugsFromSitemap,
  parseYcCompanyPage as parseCompanyPage,
  type YcCompanyPageData as YCCompanyData,
} from "../lib/ycCompanyHtml";

// Supabase client (REST API — no DATABASE_URL needed)
import { initSupabase } from "../lib/startupScraper";
const sb = initSupabase();

const DRY_RUN = process.env.DRY_RUN === "1";
const MAX_ITEMS = parseInt(process.env.YC_COMPANIES_MAX || "0", 10);
const DELAY_MS = parseInt(process.env.YC_COMPANIES_DELAY_MS || "200", 10);
const CONCURRENCY = parseInt(process.env.YC_COMPANIES_CONCURRENCY || "4", 10);

// ---------------------------------------------------------------------------
// Main scrape
// ---------------------------------------------------------------------------

async function scrape(): Promise<void> {
  const stats = new ScrapeStats("YC Companies");
  const progress = new ScrapeProgress("yc-companies");

  console.log(`[yc] Starting scrape (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS || "all"}, CONCURRENCY=${CONCURRENCY})`);

  // Step 1: Fetch sitemap
  console.log("[yc] Fetching sitemap...");
  let slugs: string[];
  try {
    const xml = await fetchText(SITEMAP_URL);
    slugs = parseSlugsFromSitemap(xml);
    console.log(`[yc] Found ${slugs.length} company slugs in sitemap`);
  } catch (err) {
    console.error(`[yc] Failed to fetch sitemap: ${err instanceof Error ? err.message : err}`);
    console.log("[yc] Trying cached slugs from progress file...");
    slugs = progress.get<string[]>("cachedSlugs", []);
    if (slugs.length === 0) {
      console.error("[yc] No cached slugs available. Exiting.");
      return;
    }
  }

  // Cache slugs for resume
  if (slugs.length > 0) {
    progress.set("cachedSlugs", slugs);
  }

  const items = MAX_ITEMS ? slugs.slice(0, MAX_ITEMS) : slugs;
  console.log(`[yc] Will process ${items.length} companies`);

  // Step 2: Fetch each company page with concurrency control
  let processed = 0;
  const pending: Promise<void>[] = [];

  for (const slug of items) {
    if (progress.isDone(slug)) {
      stats.recordSkip();
      processed++;
      continue;
    }

    const task = (async () => {
      await sleep(DELAY_MS);
      const url = `https://www.ycombinator.com/companies/${slug}`;
      try {
        const html = await fetchText(url);
        const company = parseCompanyPage(html, slug);
        if (!company || !company.name) {
          console.warn(`[yc] No data found for slug: ${slug}`);
          stats.recordSkip();
          return;
        }

        const founders: FounderIngestPayload[] = (company.founders || []).map((f) => ({
          full_name: f.name,
          role: f.title || "Founder",
          linkedin_url: f.linkedin,
        }));

        const payload: StartupIngestPayload = {
          company_name: company.name,
          data_source: "yc",
          company_url: company.website,
          domain: normalizeDomain(company.website),
          description_short: company.description,
          description_long: company.longDescription,
          logo_url: company.logoUrl,
          hq_country: company.location,
          headcount: company.teamSize,
          stage: company.batch ? "SEED" : undefined,
          status: company.status === "Active" ? "ACTIVE"
            : company.status === "Acquired" ? "ACQUIRED"
            : company.status === "Inactive" ? "SHUT_DOWN"
            : undefined,
          market_category: company.sector,
          secondary_sectors: company.tags,
          yc_batch: company.batch,
          yc_slug: slug,
          founders: founders.length > 0 ? founders : undefined,
          external_ids: { yc_slug: slug },
        };

        if (DRY_RUN) {
          console.log(`[yc] [DRY] Would upsert: ${company.name} (${slug})`);
          stats.recordSkip();
        } else {
          const result = await upsertStartup(sb, payload);
          stats.record(result);
          progress.markDone(slug);
        }
      } catch (err) {
        console.error(`[yc] Error processing ${slug}: ${err instanceof Error ? err.message : err}`);
        stats.recordError();
      }

      processed++;
      if (processed % 100 === 0) {
        console.log(`[yc] Progress: ${processed}/${items.length} (${stats.created} created, ${stats.updated} updated, ${stats.errors} errors)`);
      }
    })();

    pending.push(task);
    if (pending.length >= CONCURRENCY) {
      await Promise.all(pending);
      pending.length = 0;
    }
  }

  if (pending.length > 0) {
    await Promise.all(pending);
  }

  console.log(stats.summary());
}

scrape()
  .catch((err) => {
    console.error("[yc] Fatal:", err);
    process.exit(1);
  })
  // done;
