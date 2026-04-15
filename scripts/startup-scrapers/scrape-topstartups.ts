/**
 * TopStartups.io Scraper
 * =======================
 * Scrapes topstartups.io which is a React/Next.js SPA.
 * Uses Playwright to render JS and extract startup data.
 *
 * Data available per company:
 *   - Name, description, website/domain
 *   - Category tags, location
 *   - Funding stage, total raised
 *   - Team size, founded year
 *   - Logo
 *
 * The site may use an internal API — we intercept network requests.
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-topstartups.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-topstartups.ts
 *   TOPSTARTUPS_MAX=50 npx tsx scripts/startup-scrapers/scrape-topstartups.ts
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
const MAX_ITEMS = parseInt(process.env.TOPSTARTUPS_MAX || "0", 10);
const DELAY_MS = parseInt(process.env.TOPSTARTUPS_DELAY_MS || "3000", 10);
const BASE_URL = "https://topstartups.io";

type RawCompany = {
  name: string;
  url: string | null;
  description: string | null;
  location: string | null;
  funding: string | null;
  stage: string | null;
  teamSize: string | null;
  category: string | null;
  foundedYear: string | null;
  logoUrl: string | null;
  tags: string[];
};

async function scrape(): Promise<void> {
  const stats = new ScrapeStats("TopStartups");
  const progress = new ScrapeProgress("topstartups");

  console.log(`[topstartups] Starting scrape (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS || "all"})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  // Intercept API responses for structured data
  const apiData: any[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (
      url.includes("/api/") &&
      (url.includes("startup") || url.includes("compan")) &&
      response.status() === 200
    ) {
      try {
        const json = await response.json();
        if (Array.isArray(json)) apiData.push(...json);
        else if (json?.data && Array.isArray(json.data)) apiData.push(...json.data);
        else if (json?.startups && Array.isArray(json.startups)) apiData.push(...json.startups);
        else if (json?.results && Array.isArray(json.results)) apiData.push(...json.results);
      } catch { /* not JSON */ }
    }
  });

  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 45000 });
    await sleep(3000);

    // Scroll to trigger lazy loading
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(1000);
    }

    // Try to click "Load More" / "Show More" buttons
    for (let i = 0; i < 20; i++) {
      const loadMoreBtn = await page.$(
        "button:has-text('Load More'), button:has-text('Show More'), button:has-text('View More'), [class*='load-more'], [class*='show-more']"
      );
      if (!loadMoreBtn) break;
      await loadMoreBtn.click();
      await sleep(DELAY_MS);
      if (MAX_ITEMS && apiData.length >= MAX_ITEMS) break;
    }

    // Extract from DOM if API interception didn't catch data
    const domCompanies = await page.evaluate((): RawCompany[] => {
      const results: RawCompany[] = [];
      // TopStartups typically uses cards in a grid
      const cards = document.querySelectorAll(
        "[class*='card'], [class*='startup'], [class*='company'], article, .grid > div, main > div > div > div"
      );

      for (const card of cards) {
        // Skip navigation, header, footer elements
        if (card.closest("nav, header, footer")) continue;

        const nameEl = card.querySelector("h2, h3, h4, [class*='name'], [class*='title'] a, a[href*='/startup/']");
        const name = nameEl?.textContent?.trim();
        if (!name || name.length < 2 || name.length > 100) continue;

        const linkEl = card.querySelector("a[href*='http'], a[href*='/startup/'], a[href*='/company/']");
        const href = linkEl?.getAttribute("href") || null;

        const descEl = card.querySelector("p, [class*='desc'], [class*='summary']");
        const description = descEl?.textContent?.trim() || null;

        const locEl = card.querySelector("[class*='location'], [class*='country'], [class*='city']");
        const location = locEl?.textContent?.trim() || null;

        const fundEl = card.querySelector("[class*='fund'], [class*='raised'], [class*='money']");
        const funding = fundEl?.textContent?.trim() || null;

        const stageEl = card.querySelector("[class*='stage'], [class*='round']");
        const stage = stageEl?.textContent?.trim() || null;

        const sizeEl = card.querySelector("[class*='team'], [class*='employee'], [class*='size']");
        const teamSize = sizeEl?.textContent?.trim() || null;

        const catEl = card.querySelector("[class*='category'], [class*='sector'], [class*='industry']");
        const category = catEl?.textContent?.trim() || null;

        const yearEl = card.querySelector("[class*='year'], [class*='founded']");
        const foundedYear = yearEl?.textContent?.trim() || null;

        const logoEl = card.querySelector("img");
        const logoUrl = logoEl?.getAttribute("src") || null;

        const tagEls = card.querySelectorAll("[class*='tag'], [class*='badge'], [class*='chip']");
        const tags = Array.from(tagEls).map((t) => t.textContent?.trim() || "").filter(Boolean);

        results.push({
          name, url: href, description, location, funding, stage, teamSize,
          category, foundedYear, logoUrl, tags,
        });
      }
      return results;
    });

    // Prefer API data if available; fallback to DOM
    let allCompanies: RawCompany[];
    if (apiData.length > 0) {
      console.log(`[topstartups] Got ${apiData.length} companies from API interception`);
      allCompanies = apiData.map((d: any) => ({
        name: d.name || d.company_name || d.title || "",
        url: d.url || d.website || d.domain || null,
        description: d.description || d.tagline || d.summary || null,
        location: d.location || d.hq || d.city || null,
        funding: d.funding || d.total_raised || d.raised || null,
        stage: d.stage || d.funding_stage || null,
        teamSize: d.team_size || d.employees || d.headcount || null,
        category: d.category || d.industry || d.sector || null,
        foundedYear: d.founded_year || d.founded || d.year || null,
        logoUrl: d.logo || d.logo_url || d.image || null,
        tags: d.tags || d.categories || [],
      }));
    } else {
      console.log(`[topstartups] Got ${domCompanies.length} companies from DOM`);
      allCompanies = domCompanies;
    }

    // Also try extracting from __NEXT_DATA__ if it's a Next.js site
    if (allCompanies.length === 0) {
      const nextData = await page.evaluate(() => {
        const el = document.getElementById("__NEXT_DATA__");
        if (!el) return null;
        try { return JSON.parse(el.textContent || ""); } catch { return null; }
      });
      if (nextData?.props?.pageProps) {
        const pp = nextData.props.pageProps;
        const arr = pp.startups || pp.companies || pp.data || pp.items || [];
        if (Array.isArray(arr) && arr.length > 0) {
          console.log(`[topstartups] Got ${arr.length} companies from __NEXT_DATA__`);
          allCompanies = arr.map((d: any) => ({
            name: d.name || d.company_name || "",
            url: d.url || d.website || null,
            description: d.description || d.tagline || null,
            location: d.location || d.hq || null,
            funding: d.funding || d.total_raised || null,
            stage: d.stage || null,
            teamSize: d.team_size || d.employees || null,
            category: d.category || d.industry || null,
            foundedYear: d.founded_year || d.founded || null,
            logoUrl: d.logo || d.logo_url || null,
            tags: d.tags || [],
          }));
        }
      }
    }

    // Deduplicate by name
    const seen = new Set<string>();
    const unique = allCompanies.filter((c) => {
      if (!c.name) return false;
      const key = c.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const items = MAX_ITEMS ? unique.slice(0, MAX_ITEMS) : unique;
    console.log(`[topstartups] Processing ${items.length} unique companies`);

    function parseFunding(s: string | null): number | null {
      if (!s) return null;
      if (typeof s === "number") return s;
      const str = String(s);
      const m = str.match(/\$?([\d.]+)\s*(B|M|K)?/i);
      if (!m) return null;
      let val = parseFloat(m[1]!);
      const unit = (m[2] || "").toUpperCase();
      if (unit === "B") val *= 1_000_000_000;
      else if (unit === "M") val *= 1_000_000;
      else if (unit === "K") val *= 1_000;
      return val;
    }

    function parseTeamSize(s: string | null): number | null {
      if (!s) return null;
      if (typeof s === "number") return s;
      // "11-50" → take midpoint, or first number
      const range = String(s).match(/(\d+)\s*[-–]\s*(\d+)/);
      if (range) return Math.round((parseInt(range[1]!) + parseInt(range[2]!)) / 2);
      const single = String(s).match(/(\d+)/);
      return single ? parseInt(single[1]!, 10) : null;
    }

    for (const company of items) {
      if (progress.isDone(company.name)) {
        stats.recordSkip();
        continue;
      }

      const payload: StartupIngestPayload = {
        company_name: company.name,
        data_source: "topstartups",
        company_url: company.url,
        domain: normalizeDomain(company.url),
        description_short: company.description,
        logo_url: company.logoUrl,
        hq_country: company.location,
        founded_year: company.foundedYear ? parseInt(String(company.foundedYear), 10) || null : null,
        total_raised_usd: parseFunding(company.funding),
        stage: company.stage,
        headcount: parseTeamSize(company.teamSize),
        market_category: company.category,
        secondary_sectors: company.tags,
        external_ids: { topstartups_url: `${BASE_URL}` },
      };

      if (DRY_RUN) {
        console.log(`[topstartups] [DRY] Would upsert: ${company.name}`);
        stats.recordSkip();
      } else {
        try {
          const result = await upsertStartup(sb, payload);
          stats.record(result);
          progress.markDone(company.name);
        } catch (err) {
          console.error(`[topstartups] Error upserting ${company.name}: ${err instanceof Error ? err.message : err}`);
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
    console.error("[topstartups] Fatal:", err);
    process.exit(1);
  })
  // done;
