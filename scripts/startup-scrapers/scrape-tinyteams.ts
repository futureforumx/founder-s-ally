/**
 * TinyTeams Scraper — tinyteams.xyz
 * ===================================
 * Scrapes tinyteams.xyz which lists small, profitable startups.
 * The site is relatively simple — lists companies with:
 *   - Name, website
 *   - Description / tagline
 *   - Team size (the core data point — small teams)
 *   - Revenue / MRR / ARR info
 *   - Category
 *   - Founder info
 *
 * Uses Playwright since the site may use JS rendering.
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-tinyteams.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-tinyteams.ts
 *   TINYTEAMS_MAX=20 npx tsx scripts/startup-scrapers/scrape-tinyteams.ts
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
  type FounderIngestPayload,
} from "../lib/startupScraper";

loadDatabaseUrl();
const prisma = new PrismaClient();

const DRY_RUN = process.env.DRY_RUN === "1";
const MAX_ITEMS = parseInt(process.env.TINYTEAMS_MAX || "0", 10);
const DELAY_MS = parseInt(process.env.TINYTEAMS_DELAY_MS || "2000", 10);
const BASE_URL = "https://tinyteams.xyz";

type RawCompany = {
  name: string;
  url: string | null;
  description: string | null;
  teamSize: string | null;
  revenue: string | null;
  category: string | null;
  founder: string | null;
  logoUrl: string | null;
};

async function scrape(): Promise<void> {
  const stats = new ScrapeStats("TinyTeams");
  const progress = new ScrapeProgress("tinyteams");

  console.log(`[tinyteams] Starting scrape (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS || "all"})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  // Intercept API calls
  const apiData: any[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/") && response.status() === 200) {
      try {
        const json = await response.json();
        if (Array.isArray(json)) apiData.push(...json);
        else if (json?.companies) apiData.push(...json.companies);
        else if (json?.data) apiData.push(...(Array.isArray(json.data) ? json.data : []));
      } catch { /* not JSON */ }
    }
  });

  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(3000);

    // Scroll to load all content
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(800);
    }

    // Click load-more buttons
    for (let i = 0; i < 10; i++) {
      const btn = await page.$(
        "button:has-text('Load'), button:has-text('More'), button:has-text('Show'), [class*='load-more']"
      );
      if (!btn) break;
      try {
        await btn.click();
        await sleep(DELAY_MS);
      } catch { break; }
    }

    // Extract companies from DOM
    const domCompanies = await page.evaluate((): RawCompany[] => {
      const results: RawCompany[] = [];

      // TinyTeams likely uses cards or table rows
      const cards = document.querySelectorAll(
        "[class*='card'], [class*='company'], [class*='team'], [class*='startup'], article, .grid > div, tr, li"
      );

      for (const card of cards) {
        if (card.closest("nav, header, footer")) continue;

        const nameEl = card.querySelector("h2, h3, h4, [class*='name'], [class*='title'], a[href*='http']");
        const name = nameEl?.textContent?.trim();
        if (!name || name.length < 2 || name.length > 100) continue;

        const linkEl = card.querySelector("a[href*='http']");
        const url = linkEl?.getAttribute("href") || null;

        results.push({
          name,
          url,
          description: card.querySelector("p, [class*='desc'], [class*='tagline']")?.textContent?.trim() || null,
          teamSize: card.querySelector("[class*='team'], [class*='size'], [class*='employee'], [class*='people']")?.textContent?.trim() || null,
          revenue: card.querySelector("[class*='revenue'], [class*='arr'], [class*='mrr'], [class*='money']")?.textContent?.trim() || null,
          category: card.querySelector("[class*='category'], [class*='tag'], [class*='sector']")?.textContent?.trim() || null,
          founder: card.querySelector("[class*='founder'], [class*='maker'], [class*='creator']")?.textContent?.trim() || null,
          logoUrl: card.querySelector("img")?.getAttribute("src") || null,
        });
      }
      return results;
    });

    // Also check __NEXT_DATA__ for Next.js SSR data
    const nextData = await page.evaluate(() => {
      const el = document.getElementById("__NEXT_DATA__");
      if (!el) return null;
      try { return JSON.parse(el.textContent || ""); } catch { return null; }
    });

    let allCompanies: RawCompany[];

    if (apiData.length > 0) {
      console.log(`[tinyteams] Got ${apiData.length} companies from API`);
      allCompanies = apiData.map((d: any) => ({
        name: d.name || d.company || "",
        url: d.url || d.website || null,
        description: d.description || d.tagline || null,
        teamSize: String(d.team_size || d.teamSize || d.employees || ""),
        revenue: d.revenue || d.arr || d.mrr || null,
        category: d.category || d.industry || null,
        founder: d.founder || d.maker || null,
        logoUrl: d.logo || d.image || null,
      }));
    } else if (nextData?.props?.pageProps) {
      const pp = nextData.props.pageProps;
      const arr = pp.companies || pp.startups || pp.teams || pp.data || [];
      if (Array.isArray(arr) && arr.length > 0) {
        console.log(`[tinyteams] Got ${arr.length} companies from __NEXT_DATA__`);
        allCompanies = arr.map((d: any) => ({
          name: d.name || "",
          url: d.url || d.website || null,
          description: d.description || null,
          teamSize: String(d.team_size || d.employees || ""),
          revenue: d.revenue || d.arr || null,
          category: d.category || null,
          founder: d.founder || null,
          logoUrl: d.logo || null,
        }));
      } else {
        allCompanies = domCompanies;
      }
    } else {
      console.log(`[tinyteams] Got ${domCompanies.length} companies from DOM`);
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
    console.log(`[tinyteams] Processing ${items.length} unique companies`);

    function parseTeamSize(s: string | null): number | null {
      if (!s) return null;
      const num = String(s).match(/(\d+)/);
      return num ? parseInt(num[1]!, 10) : null;
    }

    function parseRevenue(s: string | null): string | null {
      if (!s) return null;
      const str = String(s).toLowerCase();
      if (str.includes("pre-revenue") || str.includes("0")) return "PRE_REVENUE";
      const m = str.match(/\$?([\d.]+)\s*(m|k)?/i);
      if (!m) return null;
      let val = parseFloat(m[1]!);
      const unit = (m[2] || "").toUpperCase();
      if (unit === "M") val *= 1_000_000;
      if (unit === "K") val *= 1_000;
      if (val < 1_000_000) return "SUB_1M";
      if (val < 5_000_000) return "ARR_1M_5M";
      if (val < 10_000_000) return "ARR_5M_10M";
      if (val < 50_000_000) return "ARR_10M_50M";
      return "ARR_50M_100M";
    }

    for (const company of items) {
      if (progress.isDone(company.name)) {
        stats.recordSkip();
        continue;
      }

      const founders: FounderIngestPayload[] = [];
      if (company.founder) {
        // Could be "John Doe" or "John Doe, Jane Smith"
        for (const name of company.founder.split(/[,&]/).map((s) => s.trim()).filter(Boolean)) {
          founders.push({ full_name: name });
        }
      }

      const payload: StartupIngestPayload = {
        company_name: company.name,
        data_source: "tinyteams",
        company_url: company.url,
        domain: normalizeDomain(company.url),
        description_short: company.description,
        logo_url: company.logoUrl,
        headcount: parseTeamSize(company.teamSize),
        revenue_range: parseRevenue(company.revenue),
        market_category: company.category,
        stage: "BOOTSTRAPPED",
        business_model_tags: ["small-team", "profitable"],
        founders: founders.length > 0 ? founders : undefined,
        external_ids: { tinyteams_url: BASE_URL },
      };

      if (DRY_RUN) {
        console.log(`[tinyteams] [DRY] Would upsert: ${company.name}`);
        stats.recordSkip();
      } else {
        try {
          const result = await upsertStartup(prisma, payload);
          stats.record(result);
          progress.markDone(company.name);
        } catch (err) {
          console.error(`[tinyteams] Error upserting ${company.name}: ${err instanceof Error ? err.message : err}`);
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
    console.error("[tinyteams] Fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
