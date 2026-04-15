/**
 * SeedTable Scraper — seedtable.com/best-apps-startups
 * =====================================================
 * Scrapes the SeedTable startup directory using Playwright.
 * SeedTable lists startups in an HTML table/card layout with:
 *   - Company name, description, website
 *   - Country/location
 *   - Funding info (total raised, stage)
 *   - Category/sector tags
 *   - Founded year
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-seedtable.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-seedtable.ts
 *   SEEDTABLE_MAX=10 npx tsx scripts/startup-scrapers/scrape-seedtable.ts
 */

import { chromium } from "@playwright/test";
import {
  upsertStartup,
  normalizeDomain,
  ScrapeProgress,
  ScrapeStats,
  sleep,
  type StartupIngestPayload,
} from "../lib/startupScraper";

// Supabase client (REST API — no DATABASE_URL needed)
import { initSupabase } from "../lib/startupScraper";
const sb = initSupabase();

const DRY_RUN = process.env.DRY_RUN === "1";
const MAX_ITEMS = parseInt(process.env.SEEDTABLE_MAX || "0", 10);
const DELAY_MS = parseInt(process.env.SEEDTABLE_DELAY_MS || "2000", 10);
const SOURCE_URL = "https://www.seedtable.com/best-apps-startups";

async function scrape(): Promise<void> {
  const stats = new ScrapeStats("SeedTable");
  const progress = new ScrapeProgress("seedtable");
  const lastPage = progress.get<number>("lastPage", 0);

  console.log(`[seedtable] Starting scrape (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS || "all"})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    // Navigate to the startups list page
    await page.goto(SOURCE_URL, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(2000);

    // SeedTable typically uses a table or card list — extract all company entries
    // First, try to find all company links/cards on the page
    const companies = await page.evaluate(() => {
      const results: Array<{
        name: string;
        url: string | null;
        description: string | null;
        location: string | null;
        funding: string | null;
        category: string | null;
        foundedYear: string | null;
        logoUrl: string | null;
      }> = [];

      // SeedTable uses table rows or structured card elements
      // Try multiple selector strategies
      const rows = document.querySelectorAll(
        "table tbody tr, .company-card, .startup-card, [class*='company'], [class*='startup'], .list-item, article"
      );

      for (const row of rows) {
        // Try to find the company name
        const nameEl =
          row.querySelector("a[href*='/startup/'], a[href*='/company/'], h2, h3, .name, .company-name, td:first-child a") ||
          row.querySelector("a");
        const name = nameEl?.textContent?.trim();
        if (!name || name.length < 2) continue;

        const href = nameEl?.getAttribute("href") || null;
        const url = href && href.startsWith("http") ? href : href ? `https://www.seedtable.com${href}` : null;

        // Description
        const descEl = row.querySelector(".description, .desc, p, td:nth-child(2)");
        const description = descEl?.textContent?.trim() || null;

        // Location
        const locEl = row.querySelector(".location, .country, [class*='location'], [class*='country']");
        const location = locEl?.textContent?.trim() || null;

        // Funding
        const fundEl = row.querySelector(".funding, .raised, [class*='funding'], [class*='raised']");
        const funding = fundEl?.textContent?.trim() || null;

        // Category
        const catEl = row.querySelector(".category, .sector, .tag, [class*='category'], [class*='sector']");
        const category = catEl?.textContent?.trim() || null;

        // Founded year
        const yearEl = row.querySelector(".year, .founded, [class*='year'], [class*='founded']");
        const foundedYear = yearEl?.textContent?.trim() || null;

        // Logo
        const logoEl = row.querySelector("img");
        const logoUrl = logoEl?.getAttribute("src") || null;

        results.push({ name, url, description, location, funding, category, foundedYear, logoUrl });
      }

      // Fallback: if no structured rows, try to extract from link-based lists
      if (results.length === 0) {
        const links = document.querySelectorAll("a[href*='/startup/'], a[href*='/company/']");
        for (const link of links) {
          const name = link.textContent?.trim();
          if (!name || name.length < 2) continue;
          const href = link.getAttribute("href") || "";
          results.push({
            name,
            url: href.startsWith("http") ? href : `https://www.seedtable.com${href}`,
            description: null,
            location: null,
            funding: null,
            category: null,
            foundedYear: null,
            logoUrl: null,
          });
        }
      }

      return results;
    });

    console.log(`[seedtable] Found ${companies.length} companies on page`);

    // Also try to get company detail pages for richer data
    // Check for pagination
    const nextPageLinks = await page.$$eval(
      "a[href*='page='], .pagination a, [class*='next'], a[rel='next']",
      (els) => els.map((a) => a.getAttribute("href")).filter(Boolean)
    );

    let allCompanies = [...companies];
    let pageNum = 1;

    // Follow pagination if available
    for (const nextHref of nextPageLinks) {
      if (MAX_ITEMS && allCompanies.length >= MAX_ITEMS) break;
      pageNum++;
      if (pageNum <= lastPage) continue;

      const nextUrl = nextHref!.startsWith("http")
        ? nextHref!
        : `https://www.seedtable.com${nextHref}`;

      await sleep(DELAY_MS);
      try {
        await page.goto(nextUrl, { waitUntil: "networkidle", timeout: 30000 });
        const pageCompanies = await page.evaluate(() => {
          const results: Array<{
            name: string;
            url: string | null;
            description: string | null;
            location: string | null;
            funding: string | null;
            category: string | null;
            foundedYear: string | null;
            logoUrl: string | null;
          }> = [];

          const rows = document.querySelectorAll(
            "table tbody tr, .company-card, .startup-card, [class*='company'], [class*='startup'], .list-item, article"
          );

          for (const row of rows) {
            const nameEl = row.querySelector("a[href*='/startup/'], a[href*='/company/'], h2, h3, .name, td:first-child a") || row.querySelector("a");
            const name = nameEl?.textContent?.trim();
            if (!name || name.length < 2) continue;

            const href = nameEl?.getAttribute("href") || null;
            results.push({
              name,
              url: href && href.startsWith("http") ? href : href ? `https://www.seedtable.com${href}` : null,
              description: row.querySelector(".description, .desc, p, td:nth-child(2)")?.textContent?.trim() || null,
              location: row.querySelector(".location, .country, [class*='location']")?.textContent?.trim() || null,
              funding: row.querySelector(".funding, .raised, [class*='funding']")?.textContent?.trim() || null,
              category: row.querySelector(".category, .sector, .tag")?.textContent?.trim() || null,
              foundedYear: row.querySelector(".year, .founded")?.textContent?.trim() || null,
              logoUrl: row.querySelector("img")?.getAttribute("src") || null,
            });
          }
          return results;
        });
        allCompanies.push(...pageCompanies);
        progress.set("lastPage", pageNum);
        console.log(`[seedtable] Page ${pageNum}: ${pageCompanies.length} companies (total: ${allCompanies.length})`);
      } catch (err) {
        console.warn(`[seedtable] Failed to load page ${pageNum}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Deduplicate by name
    const seen = new Set<string>();
    const unique = allCompanies.filter((c) => {
      const key = c.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const items = MAX_ITEMS ? unique.slice(0, MAX_ITEMS) : unique;
    console.log(`[seedtable] Processing ${items.length} unique companies`);

    // Parse funding string like "$10M" → number
    function parseFunding(s: string | null): number | null {
      if (!s) return null;
      const m = s.match(/\$?([\d.]+)\s*(B|M|K)?/i);
      if (!m) return null;
      let val = parseFloat(m[1]!);
      const unit = (m[2] || "").toUpperCase();
      if (unit === "B") val *= 1_000_000_000;
      else if (unit === "M") val *= 1_000_000;
      else if (unit === "K") val *= 1_000;
      return val;
    }

    for (const company of items) {
      if (progress.isDone(company.name)) {
        stats.recordSkip();
        continue;
      }

      const payload: StartupIngestPayload = {
        company_name: company.name,
        data_source: "seedtable",
        company_url: company.url,
        domain: normalizeDomain(company.url),
        description_short: company.description,
        logo_url: company.logoUrl,
        hq_country: company.location,
        founded_year: company.foundedYear ? parseInt(company.foundedYear, 10) || null : null,
        total_raised_usd: parseFunding(company.funding),
        market_category: company.category,
        external_ids: { seedtable_url: company.url || "" },
      };

      if (DRY_RUN) {
        console.log(`[seedtable] [DRY] Would upsert: ${company.name}`);
        stats.recordSkip();
      } else {
        try {
          const result = await upsertStartup(sb, payload);
          stats.record(result);
          progress.markDone(company.name);
          if ((stats.created + stats.updated) % 25 === 0) {
            console.log(`[seedtable] Progress: ${stats.created} created, ${stats.updated} updated`);
          }
        } catch (err) {
          console.error(`[seedtable] Error upserting ${company.name}: ${err instanceof Error ? err.message : err}`);
          stats.recordError();
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(stats.summary());
}

scrape()
  .catch((err) => {
    console.error("[seedtable] Fatal:", err);
    process.exit(1);
  })
  // done;
