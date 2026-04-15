/**
 * CB Insights Startup Scraper — Adapter
 * =======================================
 * Scrapes CB Insights for startup data using Playwright + auth.
 * Requires CBI_EMAIL and CBI_PASSWORD in .env.
 *
 * This scraper uses CB Insights' LiveSearch API and company profiles to extract:
 *   - Company name, domain, description
 *   - Total funding, funding rounds
 *   - HQ location, founded year
 *   - Industry/sector, investor type
 *   - Team members (founders, execs)
 *   - Competitors
 *
 * Builds on the existing CB Insights scraper pattern in scripts/cb-insights-scraper/
 * but targets the startup database schema instead of VC firms.
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-cbinsights.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-cbinsights.ts
 *   CBI_MAX=50 npx tsx scripts/startup-scrapers/scrape-cbinsights.ts
 *   CBI_SEARCH_TERMS="fintech,ai,saas" npx tsx scripts/startup-scrapers/scrape-cbinsights.ts
 *
 * Authentication:
 *   Requires CBI_EMAIL and CBI_PASSWORD env vars for app.cbinsights.com login.
 */

import { chromium, type Page, type BrowserContext } from "@playwright/test";
import {
  upsertStartup,
  normalizeDomain,
  ScrapeProgress,
  ScrapeStats,
  sleep,
  type StartupIngestPayload,
  type FounderIngestPayload,
  type FundingRoundIngestPayload,
} from "../lib/startupScraper";

// Supabase client (REST API — no DATABASE_URL needed)
import { initSupabase } from "../lib/startupScraper";
const sb = initSupabase();

const DRY_RUN = process.env.DRY_RUN === "1";
const MAX_ITEMS = parseInt(process.env.CBI_MAX || "0", 10);
const DELAY_MS = parseInt(process.env.CBI_DELAY_MS || "3000", 10);
const CBI_EMAIL = process.env.CBI_EMAIL;
const CBI_PASSWORD = process.env.CBI_PASSWORD;
const CBI_APP = "https://app.cbinsights.com";
const HEADLESS = process.env.HEADLESS !== "false";

// Search terms to discover startups — can be overridden via env
const DEFAULT_SEARCH_TERMS = [
  "AI startup", "fintech startup", "SaaS startup", "marketplace startup",
  "healthtech startup", "climate startup", "cybersecurity startup",
  "edtech startup", "proptech startup", "biotech startup",
];
const SEARCH_TERMS = process.env.CBI_SEARCH_TERMS
  ? process.env.CBI_SEARCH_TERMS.split(",").map((s) => s.trim())
  : DEFAULT_SEARCH_TERMS;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function login(page: Page): Promise<void> {
  if (!CBI_EMAIL || !CBI_PASSWORD) {
    throw new Error("Missing CBI_EMAIL or CBI_PASSWORD in .env");
  }

  console.log("[cbinsights] Logging in...");
  await page.goto(`${CBI_APP}/login`, { waitUntil: "networkidle" });
  await sleep(2000);

  // Fill login form
  const emailInput = await page.$("input[type='email'], input[name='email'], #email");
  const passInput = await page.$("input[type='password'], input[name='password'], #password");
  if (!emailInput || !passInput) {
    throw new Error("Could not find login form fields");
  }

  await emailInput.fill(CBI_EMAIL);
  await passInput.fill(CBI_PASSWORD);
  await sleep(500);

  // Click submit
  const submitBtn = await page.$(
    "button[type='submit'], button:has-text('Log In'), button:has-text('Sign In'), input[type='submit']"
  );
  if (submitBtn) {
    await submitBtn.click();
  } else {
    await passInput.press("Enter");
  }

  // Wait for navigation
  await page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await sleep(3000);

  // Verify login succeeded
  const url = page.url();
  if (url.includes("/login")) {
    throw new Error("Login appears to have failed — still on login page");
  }
  console.log("[cbinsights] Login successful");
}

// ---------------------------------------------------------------------------
// LiveSearch API
// ---------------------------------------------------------------------------

type CBISearchResult = {
  id: string;
  name: string;
  domain: string | null;
  description: string | null;
  city: string | null;
  country: string | null;
  totalFunding: string | null;
  logoUrl: string | null;
};

async function searchCompanies(page: Page, query: string): Promise<CBISearchResult[]> {
  // CB Insights has an internal LiveSearch API
  const results: CBISearchResult[] = [];

  try {
    const response = await page.evaluate(async (q: string) => {
      try {
        // Try the internal search API
        const res = await fetch("/api/search/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, type: "company", limit: 50 }),
        });
        if (res.ok) return await res.json();
      } catch { /* try alternative */ }

      try {
        const res = await fetch(`/api/v2/search?q=${encodeURIComponent(q)}&type=org&limit=50`);
        if (res.ok) return await res.json();
      } catch { /* no API available */ }

      return null;
    }, query);

    if (response?.results) {
      for (const r of response.results) {
        results.push({
          id: r.id || r.org_id || "",
          name: r.name || r.org_name || "",
          domain: r.domain || r.website || null,
          description: r.description || r.tagline || null,
          city: r.city || r.hq_city || null,
          country: r.country || r.hq_country || null,
          totalFunding: r.total_funding || r.funding || null,
          logoUrl: r.logo_url || r.logo || null,
        });
      }
    }
  } catch (err) {
    console.warn(`[cbinsights] Search API failed for "${query}": ${err instanceof Error ? err.message : err}`);
  }

  // Fallback: use the search page DOM
  if (results.length === 0) {
    try {
      await page.goto(`${CBI_APP}/search?q=${encodeURIComponent(query)}&type=org`, {
        waitUntil: "networkidle",
        timeout: 15000,
      });
      await sleep(2000);

      const domResults = await page.evaluate(() => {
        const items: CBISearchResult[] = [];
        const cards = document.querySelectorAll("[class*='result'], [class*='company'], [class*='org']");
        for (const card of cards) {
          const nameEl = card.querySelector("h3, h4, [class*='name'], a");
          const name = nameEl?.textContent?.trim();
          if (!name) continue;

          items.push({
            id: card.getAttribute("data-id") || "",
            name,
            domain: null,
            description: card.querySelector("p, [class*='desc']")?.textContent?.trim() || null,
            city: null,
            country: null,
            totalFunding: card.querySelector("[class*='funding']")?.textContent?.trim() || null,
            logoUrl: card.querySelector("img")?.getAttribute("src") || null,
          });
        }
        return items;
      });
      results.push(...domResults);
    } catch { /* search page failed */ }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Profile scraping
// ---------------------------------------------------------------------------

async function scrapeProfile(
  page: Page,
  id: string,
): Promise<Partial<StartupIngestPayload> | null> {
  try {
    await page.goto(`${CBI_APP}/profiles/c/${id}?tab=overview`, {
      waitUntil: "networkidle",
      timeout: 20000,
    });
    await sleep(2000);

    return await page.evaluate(() => {
      const data: any = {};

      // Scrape About section structured fields
      const aboutRows = document.querySelectorAll(
        "[class*='about'] [class*='row'], [class*='detail'] [class*='row'], dl dt, [class*='info-item']"
      );
      for (const row of aboutRows) {
        const label = (
          row.querySelector("dt, [class*='label'], [class*='key']")?.textContent?.trim() || ""
        ).toLowerCase();
        const value = row.querySelector("dd, [class*='value']")?.textContent?.trim() || "";

        if (label.includes("founded")) data.founded_year = parseInt(value, 10) || null;
        if (label.includes("headquarter") || label.includes("hq")) data.hq_country = value;
        if (label.includes("employees") || label.includes("headcount")) {
          const m = value.match(/(\d+)/);
          data.headcount = m ? parseInt(m[1]!, 10) : null;
        }
        if (label.includes("funding") || label.includes("raised")) data.total_funding_str = value;
        if (label.includes("industry") || label.includes("sector")) data.market_category = value;
        if (label.includes("stage")) data.stage = value;
      }

      // Description
      const descEl = document.querySelector("[class*='description'], [class*='overview'] p, [class*='about'] p");
      data.description = descEl?.textContent?.trim() || null;

      // Investors
      const investorEls = document.querySelectorAll("[class*='investor'] a, [class*='backer'] a");
      data.investors = Array.from(investorEls).map((el) => el.textContent?.trim()).filter(Boolean);

      // Funding rounds
      const roundRows = document.querySelectorAll("[class*='funding'] tr, [class*='round'] [class*='row']");
      const rounds: any[] = [];
      for (const row of roundRows) {
        const cells = row.querySelectorAll("td, [class*='cell']");
        if (cells.length >= 2) {
          rounds.push({
            round_name: cells[0]?.textContent?.trim() || "",
            amount: cells[1]?.textContent?.trim() || "",
            date: cells[2]?.textContent?.trim() || null,
            lead: cells[3]?.textContent?.trim() || null,
          });
        }
      }
      data.funding_rounds = rounds;

      // Team / founders
      const peopleEls = document.querySelectorAll("[class*='team'] [class*='person'], [class*='people'] [class*='card']");
      const people: any[] = [];
      for (const el of peopleEls) {
        const name = el.querySelector("[class*='name'], h4, h5")?.textContent?.trim();
        const title = el.querySelector("[class*='title'], [class*='role']")?.textContent?.trim();
        if (name) people.push({ name, title });
      }
      data.people = people;

      // Competitors
      const compEls = document.querySelectorAll("[class*='competitor'] a, [class*='similar'] a");
      data.competitors = Array.from(compEls).map((el) => el.textContent?.trim()).filter(Boolean);

      return data;
    });
  } catch (err) {
    console.warn(`[cbinsights] Failed to scrape profile ${id}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function scrape(): Promise<void> {
  const stats = new ScrapeStats("CBInsights");
  const progress = new ScrapeProgress("cbinsights");

  if (!CBI_EMAIL || !CBI_PASSWORD) {
    console.error("[cbinsights] Missing CBI_EMAIL or CBI_PASSWORD in .env — skipping");
    console.log("[cbinsights] Set CBI_EMAIL and CBI_PASSWORD to enable this scraper");
    return;
  }

  console.log(`[cbinsights] Starting scrape (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS || "all"})`);
  console.log(`[cbinsights] Search terms: ${SEARCH_TERMS.join(", ")}`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await login(page);

    // Search for companies across all terms
    const allResults: CBISearchResult[] = [];
    const seen = new Set<string>();

    for (const term of SEARCH_TERMS) {
      if (MAX_ITEMS && allResults.length >= MAX_ITEMS) break;

      console.log(`[cbinsights] Searching: "${term}"`);
      const results = await searchCompanies(page, term);
      for (const r of results) {
        const key = r.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        allResults.push(r);
      }
      await sleep(DELAY_MS);
    }

    const items = MAX_ITEMS ? allResults.slice(0, MAX_ITEMS) : allResults;
    console.log(`[cbinsights] Found ${items.length} unique companies`);

    function parseFunding(s: string | null): number | null {
      if (!s) return null;
      const m = String(s).replace(/,/g, "").match(/\$?([\d.]+)\s*(B|M|K)?/i);
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

      // Optionally scrape the full profile page
      let profileData: any = {};
      if (company.id) {
        await sleep(DELAY_MS);
        profileData = (await scrapeProfile(page, company.id)) || {};
      }

      const founders: FounderIngestPayload[] = (profileData.people || [])
        .filter((p: any) =>
          p.title &&
          /(founder|ceo|cto|coo|co-founder)/i.test(p.title)
        )
        .map((p: any) => ({
          full_name: p.name,
          role: p.title,
        }));

      const fundingRounds: FundingRoundIngestPayload[] = (profileData.funding_rounds || [])
        .filter((r: any) => r.round_name)
        .map((r: any) => ({
          round_name: r.round_name,
          amount_usd: parseFunding(r.amount),
          lead_investors: r.lead ? [r.lead] : [],
          source_url: `${CBI_APP}/profiles/c/${company.id}`,
        }));

      const payload: StartupIngestPayload = {
        company_name: company.name,
        data_source: "cb_insights",
        company_url: company.domain ? `https://${company.domain}` : null,
        domain: company.domain,
        description_short: company.description || profileData.description || null,
        logo_url: company.logoUrl,
        hq_city: company.city,
        hq_country: company.country || profileData.hq_country,
        founded_year: profileData.founded_year,
        headcount: profileData.headcount,
        total_raised_usd: parseFunding(company.totalFunding || profileData.total_funding_str),
        stage: profileData.stage,
        market_category: profileData.market_category,
        investor_names: profileData.investors || [],
        founders: founders.length > 0 ? founders : undefined,
        funding_rounds: fundingRounds.length > 0 ? fundingRounds : undefined,
        external_ids: company.id ? { cbinsights_id: company.id } : undefined,
      };

      if (DRY_RUN) {
        console.log(`[cbinsights] [DRY] Would upsert: ${company.name}`);
        stats.recordSkip();
      } else {
        try {
          const result = await upsertStartup(sb, payload);
          stats.record(result);
          progress.markDone(company.name);
          if ((stats.created + stats.updated) % 10 === 0) {
            console.log(`[cbinsights] Progress: ${stats.created} created, ${stats.updated} updated`);
          }
        } catch (err) {
          console.error(`[cbinsights] Error upserting ${company.name}: ${err instanceof Error ? err.message : err}`);
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
    console.error("[cbinsights] Fatal:", err);
    process.exit(1);
  })
  // done;
