/**
 * Tracxn Scraper — tracxn.com
 * =============================
 * Scrapes Tracxn for startup data using Playwright + auth.
 * Requires TRACXN_EMAIL and TRACXN_PASSWORD in .env.
 *
 * Tracxn is a comprehensive startup intelligence platform with:
 *   - Company name, domain, description
 *   - Total funding, funding rounds, investors
 *   - HQ location, founded year
 *   - Industry/sector, sub-sector
 *   - Team size, key people/founders
 *   - Revenue estimates, growth signals
 *   - Competitors
 *   - Business model, target customer
 *
 * Strategy:
 *   1. Login at tracxn.com
 *   2. Search by sector/category to discover companies
 *   3. Scrape company profile pages for structured data
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-tracxn.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-tracxn.ts
 *   TRACXN_MAX=50 npx tsx scripts/startup-scrapers/scrape-tracxn.ts
 *   TRACXN_SEARCH_TERMS="fintech,ai,saas" npx tsx scripts/startup-scrapers/scrape-tracxn.ts
 *
 * Authentication:
 *   TRACXN_EMAIL — Tracxn login email
 *   TRACXN_PASSWORD — Tracxn login password
 */

import { chromium, type Page } from "@playwright/test";
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
const MAX_ITEMS = parseInt(process.env.TRACXN_MAX || "0", 10);
const DELAY_MS = parseInt(process.env.TRACXN_DELAY_MS || "3000", 10);
const HEADLESS = process.env.HEADLESS !== "false";
const TRACXN_EMAIL = process.env.TRACXN_EMAIL;
const TRACXN_PASSWORD = process.env.TRACXN_PASSWORD;
const TRACXN_BASE = "https://tracxn.com";

const DEFAULT_SEARCH_TERMS = [
  "Artificial Intelligence", "FinTech", "SaaS", "HealthTech",
  "Cybersecurity", "EdTech", "CleanTech", "Marketplace",
  "Developer Tools", "PropTech",
];
const SEARCH_TERMS = process.env.TRACXN_SEARCH_TERMS
  ? process.env.TRACXN_SEARCH_TERMS.split(",").map((s) => s.trim())
  : DEFAULT_SEARCH_TERMS;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function login(page: Page): Promise<void> {
  if (!TRACXN_EMAIL || !TRACXN_PASSWORD) {
    throw new Error("Missing TRACXN_EMAIL or TRACXN_PASSWORD in .env");
  }

  console.log("[tracxn] Logging in...");
  await page.goto(`${TRACXN_BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(2000);

  // Find and fill login fields
  const emailInput = await page.$(
    "input[type='email'], input[name='email'], input[placeholder*='email'], #email"
  );
  const passInput = await page.$(
    "input[type='password'], input[name='password'], input[placeholder*='password'], #password"
  );
  if (!emailInput || !passInput) {
    // Tracxn may use a single-page login flow
    const inputs = await page.$$("input[type='text'], input[type='email']");
    if (inputs.length > 0) {
      await inputs[0]!.fill(TRACXN_EMAIL);
      // Look for a "Next" or "Continue" button
      const nextBtn = await page.$(
        "button:has-text('Next'), button:has-text('Continue'), button[type='submit']"
      );
      if (nextBtn) {
        await nextBtn.click();
        await sleep(2000);
      }
      const pass2 = await page.$("input[type='password']");
      if (pass2) {
        await pass2.fill(TRACXN_PASSWORD);
      }
    } else {
      throw new Error("Could not find login form fields");
    }
  } else {
    await emailInput.fill(TRACXN_EMAIL);
    await passInput.fill(TRACXN_PASSWORD);
  }

  await sleep(500);

  // Click login
  const submitBtn = await page.$(
    "button[type='submit'], button:has-text('Log In'), button:has-text('Login'), button:has-text('Sign In')"
  );
  if (submitBtn) {
    await submitBtn.click();
  } else {
    // Press Enter on the password field
    const activePass = await page.$("input[type='password']");
    if (activePass) await activePass.press("Enter");
  }

  await page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await sleep(3000);

  const url = page.url();
  if (url.includes("/login")) {
    throw new Error("Login appears to have failed — still on login page");
  }
  console.log("[tracxn] Login successful");
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

type TracxnCompany = {
  name: string;
  slug: string;
  domain: string | null;
  description: string | null;
  location: string | null;
  funding: string | null;
  sector: string | null;
  logoUrl: string | null;
};

async function searchCompanies(page: Page, query: string): Promise<TracxnCompany[]> {
  const results: TracxnCompany[] = [];

  try {
    // Tracxn search URL pattern
    await page.goto(
      `${TRACXN_BASE}/d/companies?query=${encodeURIComponent(query)}&sort=score`,
      { waitUntil: "networkidle", timeout: 30000 }
    );
    await sleep(3000);

    // Scroll to load more results
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(1000);
    }

    // Extract company cards from search results
    const companies = await page.evaluate((): TracxnCompany[] => {
      const items: TracxnCompany[] = [];
      const cards = document.querySelectorAll(
        "[class*='company-card'], [class*='CompanyCard'], [class*='entity-card'], tr[class*='row'], [class*='search-result'], [data-testid*='company']"
      );

      for (const card of cards) {
        const nameEl = card.querySelector(
          "a[href*='/d/companies/'], h3, h4, [class*='name'], [class*='title']"
        );
        const name = nameEl?.textContent?.trim();
        if (!name || name.length < 2) continue;

        const linkEl = card.querySelector("a[href*='/d/companies/']");
        const href = linkEl?.getAttribute("href") || "";
        const slug = href.split("/d/companies/")[1]?.split(/[?#/]/)[0] || "";

        items.push({
          name,
          slug,
          domain: null,
          description: card.querySelector("p, [class*='desc'], [class*='tagline']")?.textContent?.trim() || null,
          location: card.querySelector("[class*='location'], [class*='city']")?.textContent?.trim() || null,
          funding: card.querySelector("[class*='funding'], [class*='raised']")?.textContent?.trim() || null,
          sector: card.querySelector("[class*='sector'], [class*='category'], [class*='tag']")?.textContent?.trim() || null,
          logoUrl: card.querySelector("img")?.getAttribute("src") || null,
        });
      }
      return items;
    });

    results.push(...companies);
  } catch (err) {
    console.warn(`[tracxn] Search failed for "${query}": ${err instanceof Error ? err.message : err}`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Profile scraping
// ---------------------------------------------------------------------------

async function scrapeProfile(page: Page, slug: string): Promise<Partial<StartupIngestPayload> | null> {
  try {
    await page.goto(`${TRACXN_BASE}/d/companies/${slug}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await sleep(3000);

    return await page.evaluate(() => {
      const data: any = {};

      // Company description
      const descEl = document.querySelector(
        "[class*='description'], [class*='about'] p, [class*='overview'] p"
      );
      data.description_short = descEl?.textContent?.trim() || null;

      // Structured fields — Tracxn uses key-value pairs
      const fieldRows = document.querySelectorAll(
        "[class*='detail'] [class*='row'], [class*='info-item'], [class*='field-row'], dl dt, [class*='KeyValue']"
      );
      for (const row of fieldRows) {
        const label = (
          row.querySelector("dt, [class*='label'], [class*='key'], span:first-child")?.textContent?.trim() || ""
        ).toLowerCase();
        const value = (
          row.querySelector("dd, [class*='value'], span:last-child, a")?.textContent?.trim() || ""
        );

        if (label.includes("founded")) {
          const yearMatch = value.match(/\b(19|20)\d{2}\b/);
          data.founded_year = yearMatch ? parseInt(yearMatch[0], 10) : null;
        }
        if (label.includes("headquarter") || label.includes("hq") || label.includes("location")) {
          data.hq_location = value;
        }
        if (label.includes("employee") || label.includes("team size") || label.includes("headcount")) {
          const num = value.match(/(\d[\d,]*)/);
          data.headcount = num ? parseInt(num[1]!.replace(/,/g, ""), 10) : null;
        }
        if (label.includes("total funding") || label.includes("funding")) {
          data.total_funding_str = value;
        }
        if (label.includes("last round") || label.includes("latest round")) {
          data.last_round = value;
        }
        if (label.includes("stage")) data.stage = value;
        if (label.includes("industry") || label.includes("sector")) data.sector = value;
        if (label.includes("revenue") || label.includes("arr")) data.revenue = value;
        if (label.includes("website") || label.includes("domain")) data.website = value;
        if (label.includes("business model")) data.business_model = value;
        if (label.includes("target customer") || label.includes("customer type")) data.target_customer = value;
      }

      // Website link
      const websiteLink = document.querySelector(
        "a[href*='http'][class*='website'], a[rel='noopener'][target='_blank']"
      );
      if (!data.website && websiteLink) {
        data.website = websiteLink.getAttribute("href");
      }

      // Founders / Key People
      const peopleCards = document.querySelectorAll(
        "[class*='founder'], [class*='team'] [class*='card'], [class*='people'] [class*='item'], [class*='KeyPeople'] [class*='card']"
      );
      data.founders = [];
      for (const card of peopleCards) {
        const name = card.querySelector("[class*='name'], h4, h5")?.textContent?.trim();
        const title = card.querySelector("[class*='title'], [class*='role'], [class*='designation']")?.textContent?.trim();
        const linkedin = card.querySelector("a[href*='linkedin']")?.getAttribute("href") || null;
        if (name) {
          data.founders.push({ name, title, linkedin });
        }
      }

      // Investors
      const investorEls = document.querySelectorAll(
        "[class*='investor'] a, [class*='Investor'] a, [class*='backer'] a"
      );
      data.investors = Array.from(investorEls)
        .map((el) => el.textContent?.trim())
        .filter(Boolean);

      // Funding rounds table
      const roundRows = document.querySelectorAll(
        "[class*='funding'] tr, [class*='FundingRound'] [class*='row'], [class*='round-item']"
      );
      data.funding_rounds = [];
      for (const row of roundRows) {
        const cells = row.querySelectorAll("td, [class*='cell'], span");
        if (cells.length >= 2) {
          data.funding_rounds.push({
            round_name: cells[0]?.textContent?.trim() || "",
            amount: cells[1]?.textContent?.trim() || "",
            date: cells[2]?.textContent?.trim() || null,
            investors: cells[3]?.textContent?.trim() || null,
          });
        }
      }

      // Competitors
      const compEls = document.querySelectorAll(
        "[class*='competitor'] a, [class*='Competitor'] a, [class*='similar'] a"
      );
      data.competitors = Array.from(compEls)
        .map((el) => el.textContent?.trim())
        .filter(Boolean);

      return data;
    });
  } catch (err) {
    console.warn(`[tracxn] Profile scrape failed for ${slug}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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

async function scrape(): Promise<void> {
  const stats = new ScrapeStats("Tracxn");
  const progress = new ScrapeProgress("tracxn");

  if (!TRACXN_EMAIL || !TRACXN_PASSWORD) {
    console.error("[tracxn] Missing TRACXN_EMAIL or TRACXN_PASSWORD in .env — skipping");
    console.log("[tracxn] Set TRACXN_EMAIL and TRACXN_PASSWORD to enable this scraper");
    return;
  }

  console.log(`[tracxn] Starting scrape (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS || "all"})`);
  console.log(`[tracxn] Search terms: ${SEARCH_TERMS.join(", ")}`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await login(page);

    // Discover companies via search
    const allResults: TracxnCompany[] = [];
    const seen = new Set<string>();

    for (const term of SEARCH_TERMS) {
      if (MAX_ITEMS && allResults.length >= MAX_ITEMS) break;
      console.log(`[tracxn] Searching: "${term}"`);

      const results = await searchCompanies(page, term);
      for (const r of results) {
        const key = r.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        allResults.push(r);
      }
      console.log(`[tracxn] Found ${results.length} for "${term}" (total unique: ${allResults.length})`);
      await sleep(DELAY_MS);
    }

    const items = MAX_ITEMS ? allResults.slice(0, MAX_ITEMS) : allResults;
    console.log(`[tracxn] Will process ${items.length} companies`);

    for (const company of items) {
      if (progress.isDone(company.name)) {
        stats.recordSkip();
        continue;
      }

      // Scrape full profile if we have a slug
      let profileData: any = {};
      if (company.slug) {
        await sleep(DELAY_MS);
        profileData = (await scrapeProfile(page, company.slug)) || {};
      }

      // Parse location
      const locStr = profileData.hq_location || company.location || "";
      const locParts = locStr.split(",").map((s: string) => s.trim());
      const hqCity = locParts[0] || null;
      const hqCountry = locParts[locParts.length - 1] || null;

      // Parse founders
      const founders: FounderIngestPayload[] = (profileData.founders || [])
        .filter((f: any) => f.name)
        .map((f: any) => ({
          full_name: f.name,
          role: f.title || "Founder",
          linkedin_url: f.linkedin || null,
        }));

      // Parse funding rounds
      const fundingRounds: FundingRoundIngestPayload[] = (profileData.funding_rounds || [])
        .filter((r: any) => r.round_name)
        .map((r: any) => ({
          round_name: r.round_name,
          amount_usd: parseFunding(r.amount),
          lead_investors: r.investors ? r.investors.split(",").map((s: string) => s.trim()) : [],
          source_url: `${TRACXN_BASE}/d/companies/${company.slug}`,
        }));

      const payload: StartupIngestPayload = {
        company_name: company.name,
        data_source: "tracxn",
        company_url: profileData.website || null,
        domain: normalizeDomain(profileData.website || company.domain),
        description_short: profileData.description_short || company.description || null,
        logo_url: company.logoUrl,
        hq_city: hqCity,
        hq_country: hqCountry,
        founded_year: profileData.founded_year || null,
        headcount: profileData.headcount || null,
        total_raised_usd: parseFunding(profileData.total_funding_str || company.funding),
        stage: profileData.stage || null,
        status: "ACTIVE",
        market_category: profileData.sector || company.sector || null,
        business_model: profileData.business_model || null,
        investor_names: profileData.investors || [],
        founders: founders.length > 0 ? founders : undefined,
        funding_rounds: fundingRounds.length > 0 ? fundingRounds : undefined,
        external_ids: company.slug ? { tracxn_slug: company.slug } : undefined,
        crunchbase_url: null,
      };

      if (DRY_RUN) {
        console.log(`[tracxn] [DRY] Would upsert: ${company.name}`);
        stats.recordSkip();
      } else {
        try {
          const result = await upsertStartup(sb, payload);
          stats.record(result);
          progress.markDone(company.name);
          if ((stats.created + stats.updated) % 10 === 0) {
            console.log(`[tracxn] Progress: ${stats.created} created, ${stats.updated} updated`);
          }
        } catch (err) {
          console.error(`[tracxn] Error upserting ${company.name}: ${err instanceof Error ? err.message : err}`);
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
    console.error("[tracxn] Fatal:", err);
    process.exit(1);
  })
  // done;
