/**
 * Startups Gallery Scraper — startups.gallery
 * =============================================
 * Scrapes the startups.gallery directory which curates startup listings.
 *
 * Uses Playwright to handle JS rendering.
 *
 * Data typically available:
 *   - Company name, description, website
 *   - Category/tags
 *   - Logo/screenshot
 *   - Pricing info
 *   - Launch date
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-startups-gallery.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-startups-gallery.ts
 *   GALLERY_MAX=50 npx tsx scripts/startup-scrapers/scrape-startups-gallery.ts
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
const MAX_ITEMS = parseInt(process.env.GALLERY_MAX || "0", 10);
const DELAY_MS = parseInt(process.env.GALLERY_DELAY_MS || "2000", 10);
const BASE_URL = "https://startups.gallery";

async function scrape(): Promise<void> {
  const stats = new ScrapeStats("StartupsGallery");
  const progress = new ScrapeProgress("startups-gallery");

  console.log(`[gallery] Starting scrape (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS || "all"})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  // Intercept API responses
  const apiData: any[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/") && response.status() === 200) {
      try {
        const json = await response.json();
        const candidates = [json?.data, json?.startups, json?.items, json?.results, json];
        for (const c of candidates) {
          if (Array.isArray(c) && c.length > 0 && (c[0]?.name || c[0]?.title)) {
            apiData.push(...c);
            break;
          }
        }
      } catch { /* not JSON */ }
    }
  });

  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 45000 });
    await sleep(3000);

    // Scroll to trigger lazy loading
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(800);
    }

    // Click load-more / pagination
    for (let i = 0; i < 20; i++) {
      const btn = await page.$(
        "button:has-text('Load More'), button:has-text('Show More'), button:has-text('Next'), a:has-text('Next'), [class*='load-more'], [class*='pagination'] a:last-child"
      );
      if (!btn) break;
      try {
        await btn.click();
        await sleep(DELAY_MS);
      } catch { break; }
      if (MAX_ITEMS && apiData.length >= MAX_ITEMS) break;
    }

    // Extract from DOM
    const domCompanies = await page.evaluate(() => {
      const results: Array<{
        name: string;
        url: string | null;
        description: string | null;
        category: string | null;
        logoUrl: string | null;
        tags: string[];
      }> = [];

      const cards = document.querySelectorAll(
        "[class*='card'], [class*='startup'], [class*='product'], [class*='item'], article, .grid > div, .gallery > div"
      );

      for (const card of cards) {
        if (card.closest("nav, header, footer")) continue;

        const nameEl = card.querySelector("h2, h3, h4, [class*='name'], [class*='title']");
        const name = nameEl?.textContent?.trim();
        if (!name || name.length < 2 || name.length > 100) continue;

        const linkEl = card.querySelector("a[href*='http'], a[href*='/startup/'], a[href*='/product/']");
        const href = linkEl?.getAttribute("href") || null;

        const tagEls = card.querySelectorAll("[class*='tag'], [class*='badge'], [class*='chip'], [class*='category']");
        const tags = Array.from(tagEls).map((t) => t.textContent?.trim() || "").filter(Boolean);

        results.push({
          name,
          url: href,
          description: card.querySelector("p, [class*='desc'], [class*='summary']")?.textContent?.trim() || null,
          category: tags[0] || card.querySelector("[class*='category']")?.textContent?.trim() || null,
          logoUrl: card.querySelector("img")?.getAttribute("src") || null,
          tags,
        });
      }

      // Fallback: try link-based extraction
      if (results.length === 0) {
        const links = document.querySelectorAll("a[href]");
        for (const link of links) {
          if (link.closest("nav, header, footer")) continue;
          const href = link.getAttribute("href") || "";
          if (!href.includes("/startup/") && !href.includes("/product/")) continue;
          const name = link.textContent?.trim();
          if (!name || name.length < 2 || name.length > 100) continue;
          results.push({
            name,
            url: href.startsWith("http") ? href : `https://startups.gallery${href}`,
            description: null,
            category: null,
            logoUrl: link.querySelector("img")?.getAttribute("src") || null,
            tags: [],
          });
        }
      }

      return results;
    });

    // Also try __NEXT_DATA__
    const nextData = await page.evaluate(() => {
      const el = document.getElementById("__NEXT_DATA__");
      if (!el) return null;
      try { return JSON.parse(el.textContent || ""); } catch { return null; }
    });

    let allCompanies: Array<{
      name: string; url: string | null; description: string | null;
      category: string | null; logoUrl: string | null; tags: string[];
    }>;

    if (apiData.length > 0) {
      console.log(`[gallery] Got ${apiData.length} from API`);
      allCompanies = apiData.map((d: any) => ({
        name: d.name || d.title || "",
        url: d.url || d.website || null,
        description: d.description || d.tagline || null,
        category: d.category || null,
        logoUrl: d.logo || d.image || d.thumbnail || null,
        tags: d.tags || d.categories || [],
      }));
    } else if (nextData?.props?.pageProps) {
      const pp = nextData.props.pageProps;
      const arr = pp.startups || pp.products || pp.data || pp.items || [];
      if (Array.isArray(arr) && arr.length > 0) {
        console.log(`[gallery] Got ${arr.length} from __NEXT_DATA__`);
        allCompanies = arr.map((d: any) => ({
          name: d.name || d.title || "",
          url: d.url || d.website || null,
          description: d.description || null,
          category: d.category || null,
          logoUrl: d.logo || d.image || null,
          tags: d.tags || [],
        }));
      } else {
        allCompanies = domCompanies;
      }
    } else {
      console.log(`[gallery] Got ${domCompanies.length} from DOM`);
      allCompanies = domCompanies;
    }

    // Deduplicate
    const seen = new Set<string>();
    const unique = allCompanies.filter((c) => {
      if (!c.name) return false;
      const key = c.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const items = MAX_ITEMS ? unique.slice(0, MAX_ITEMS) : unique;
    console.log(`[gallery] Processing ${items.length} unique companies`);

    for (const company of items) {
      if (progress.isDone(company.name)) {
        stats.recordSkip();
        continue;
      }

      const payload: StartupIngestPayload = {
        company_name: company.name,
        data_source: "startups_gallery",
        company_url: company.url,
        domain: normalizeDomain(company.url),
        description_short: company.description,
        logo_url: company.logoUrl,
        market_category: company.category,
        secondary_sectors: company.tags,
        external_ids: { startups_gallery_url: company.url || "" },
      };

      if (DRY_RUN) {
        console.log(`[gallery] [DRY] Would upsert: ${company.name}`);
        stats.recordSkip();
      } else {
        try {
          const result = await upsertStartup(sb, payload);
          stats.record(result);
          progress.markDone(company.name);
        } catch (err) {
          console.error(`[gallery] Error upserting ${company.name}: ${err instanceof Error ? err.message : err}`);
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
    console.error("[gallery] Fatal:", err);
    process.exit(1);
  })
  // done;
