/**
 * NextPlay Scraper — nextplay.so/companies
 * ==========================================
 * NextPlay is a company directory focused on tech companies, with employee
 * data, compensation info, and company profiles.
 *
 * Uses Playwright — the site is a JS-rendered SPA (likely Next.js).
 *
 * Data available:
 *   - Company name, description, website
 *   - Industry/sector
 *   - Headcount, location (HQ)
 *   - Funding stage, total raised
 *   - Founded year
 *   - Company type (startup, public, etc.)
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-nextplay.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-nextplay.ts
 *   NEXTPLAY_MAX=50 npx tsx scripts/startup-scrapers/scrape-nextplay.ts
 */

import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loadDatabaseUrl } from "../lib/loadDatabaseUrl";
import {
  upsertStartup,
  normalizeDomain,
  ScrapeProgress,
  ScrapeStats,
  sleep,
  type StartupIngestPayload,
} from "../lib/startupScraper";

loadDatabaseUrl();
const prisma = new PrismaClient();

const DRY_RUN = process.env.DRY_RUN === "1";
const MAX_ITEMS = parseInt(process.env.NEXTPLAY_MAX || "0", 10);
const DELAY_MS = parseInt(process.env.NEXTPLAY_DELAY_MS || "3000", 10);
const BASE_URL = "https://nextplay.so/companies";

async function scrape(): Promise<void> {
  const stats = new ScrapeStats("NextPlay");
  const progress = new ScrapeProgress("nextplay");

  console.log(`[nextplay] Starting scrape (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS || "all"})`);

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
    if (
      (url.includes("/api/") || url.includes("supabase") || url.includes("graphql")) &&
      response.status() === 200
    ) {
      try {
        const json = await response.json();
        const candidates = [
          json?.data?.companies,
          json?.companies,
          json?.data,
          json?.results,
          json,
        ];
        for (const c of candidates) {
          if (Array.isArray(c) && c.length > 0 && c[0]?.name) {
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
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(800);
    }

    // Click pagination / load-more
    for (let i = 0; i < 30; i++) {
      const btn = await page.$(
        "button:has-text('Load More'), button:has-text('Show More'), button:has-text('Next'), [class*='load-more'], [aria-label='Next']"
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
        location: string | null;
        headcount: string | null;
        funding: string | null;
        stage: string | null;
        industry: string | null;
        foundedYear: string | null;
        logoUrl: string | null;
      }> = [];

      const cards = document.querySelectorAll(
        "[class*='card'], [class*='company'], [class*='row'], article, tr, a[href*='/companies/']"
      );

      for (const card of cards) {
        if (card.closest("nav, header, footer")) continue;

        const nameEl = card.querySelector("h2, h3, h4, [class*='name'], [class*='title']") || card;
        const name = nameEl?.textContent?.trim();
        if (!name || name.length < 2 || name.length > 100) continue;

        const linkEl = card.tagName === "A" ? card : card.querySelector("a[href*='/companies/'], a[href*='http']");
        const href = linkEl?.getAttribute("href") || null;

        results.push({
          name,
          url: href,
          description: card.querySelector("p, [class*='desc']")?.textContent?.trim() || null,
          location: card.querySelector("[class*='location'], [class*='city']")?.textContent?.trim() || null,
          headcount: card.querySelector("[class*='employee'], [class*='size'], [class*='headcount']")?.textContent?.trim() || null,
          funding: card.querySelector("[class*='fund'], [class*='raised']")?.textContent?.trim() || null,
          stage: card.querySelector("[class*='stage']")?.textContent?.trim() || null,
          industry: card.querySelector("[class*='industry'], [class*='sector']")?.textContent?.trim() || null,
          foundedYear: card.querySelector("[class*='year'], [class*='founded']")?.textContent?.trim() || null,
          logoUrl: card.querySelector("img")?.getAttribute("src") || null,
        });
      }
      return results;
    });

    // Check __NEXT_DATA__
    const nextData = await page.evaluate(() => {
      const el = document.getElementById("__NEXT_DATA__");
      if (!el) return null;
      try { return JSON.parse(el.textContent || ""); } catch { return null; }
    });

    let allCompanies: Array<{
      name: string; url: string | null; description: string | null;
      location: string | null; headcount: string | null; funding: string | null;
      stage: string | null; industry: string | null; foundedYear: string | null;
      logoUrl: string | null;
    }>;

    if (apiData.length > 0) {
      console.log(`[nextplay] Got ${apiData.length} companies from API`);
      allCompanies = apiData.map((d: any) => ({
        name: d.name || d.company_name || "",
        url: d.website || d.url || d.domain || null,
        description: d.description || d.tagline || null,
        location: d.location || d.hq || d.headquarters || null,
        headcount: String(d.headcount || d.employee_count || d.team_size || ""),
        funding: String(d.funding || d.total_raised || d.total_funding || ""),
        stage: d.stage || d.funding_stage || null,
        industry: d.industry || d.sector || d.category || null,
        foundedYear: String(d.founded_year || d.founded || d.year_founded || ""),
        logoUrl: d.logo_url || d.logo || d.image_url || null,
      }));
    } else if (nextData?.props?.pageProps) {
      const pp = nextData.props.pageProps;
      const arr = pp.companies || pp.data || pp.results || [];
      if (Array.isArray(arr) && arr.length > 0) {
        console.log(`[nextplay] Got ${arr.length} companies from __NEXT_DATA__`);
        allCompanies = arr.map((d: any) => ({
          name: d.name || "",
          url: d.website || d.url || null,
          description: d.description || null,
          location: d.location || d.hq || null,
          headcount: String(d.headcount || d.employee_count || ""),
          funding: String(d.total_raised || d.funding || ""),
          stage: d.stage || null,
          industry: d.industry || d.sector || null,
          foundedYear: String(d.founded_year || d.founded || ""),
          logoUrl: d.logo_url || d.logo || null,
        }));
      } else {
        allCompanies = domCompanies;
      }
    } else {
      console.log(`[nextplay] Got ${domCompanies.length} companies from DOM`);
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
    console.log(`[nextplay] Processing ${items.length} unique companies`);

    function parseFunding(s: string | null): number | null {
      if (!s) return null;
      const m = String(s).match(/\$?([\d.]+)\s*(B|M|K)?/i);
      if (!m) return null;
      let val = parseFloat(m[1]!);
      const unit = (m[2] || "").toUpperCase();
      if (unit === "B") val *= 1_000_000_000;
      else if (unit === "M") val *= 1_000_000;
      else if (unit === "K") val *= 1_000;
      return val;
    }

    function parseHeadcount(s: string | null): number | null {
      if (!s) return null;
      const range = String(s).match(/(\d+)\s*[-–]\s*(\d+)/);
      if (range) return Math.round((parseInt(range[1]!) + parseInt(range[2]!)) / 2);
      const num = String(s).match(/(\d+)/);
      return num ? parseInt(num[1]!, 10) : null;
    }

    for (const company of items) {
      if (progress.isDone(company.name)) {
        stats.recordSkip();
        continue;
      }

      // Parse location into city/country
      let hqCity: string | null = null;
      let hqCountry: string | null = null;
      if (company.location) {
        const parts = company.location.split(",").map((s) => s.trim());
        hqCity = parts[0] || null;
        hqCountry = parts[parts.length - 1] || null;
      }

      const payload: StartupIngestPayload = {
        company_name: company.name,
        data_source: "nextplay",
        company_url: company.url,
        domain: normalizeDomain(company.url),
        description_short: company.description,
        logo_url: company.logoUrl,
        hq_city: hqCity,
        hq_country: hqCountry,
        headcount: parseHeadcount(company.headcount),
        total_raised_usd: parseFunding(company.funding),
        stage: company.stage,
        founded_year: company.foundedYear ? parseInt(company.foundedYear, 10) || null : null,
        market_category: company.industry,
        external_ids: { nextplay_url: `${BASE_URL}` },
      };

      if (DRY_RUN) {
        console.log(`[nextplay] [DRY] Would upsert: ${company.name}`);
        stats.recordSkip();
      } else {
        try {
          const result = await upsertStartup(prisma, payload);
          stats.record(result);
          progress.markDone(company.name);
        } catch (err) {
          console.error(`[nextplay] Error upserting ${company.name}: ${err instanceof Error ? err.message : err}`);
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
    console.error("[nextplay] Fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
