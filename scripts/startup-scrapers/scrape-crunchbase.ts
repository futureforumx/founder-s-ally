/**
 * Crunchbase Startup Scraper
 * ===========================
 * Scrapes Crunchbase for startup data. Supports two modes:
 *
 * 1. **API mode** (preferred): Uses the Crunchbase Basic/Enterprise API
 *    Requires CRUNCHBASE_API_KEY in .env.
 *    Endpoint: https://api.crunchbase.com/api/v4/
 *
 * 2. **Web mode** (fallback): Uses Playwright to scrape the public Crunchbase site.
 *    Slower, rate-limited, and may be blocked. Use as a last resort.
 *
 * Data captured:
 *   - Company name, domain, description (short + long)
 *   - Founding date, HQ location
 *   - Stage, status (active/acquired/shut down/IPO)
 *   - Sectors, business model
 *   - Headcount, tech stack
 *   - Total funding, funding rounds with investors
 *   - Valuation
 *   - Founders and key people
 *   - Competitors
 *   - Board members
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-crunchbase.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-crunchbase.ts
 *   CB_MODE=api npx tsx scripts/startup-scrapers/scrape-crunchbase.ts
 *   CB_MODE=web npx tsx scripts/startup-scrapers/scrape-crunchbase.ts
 *   CB_MAX=100 npx tsx scripts/startup-scrapers/scrape-crunchbase.ts
 *   CB_SEARCH_TERMS="fintech,ai" npx tsx scripts/startup-scrapers/scrape-crunchbase.ts
 */

import { chromium, type Page } from "@playwright/test";
import {
  upsertStartup,
  normalizeDomain,
  ScrapeProgress,
  ScrapeStats,
  sleep,
  fetchWithRetry,
  type StartupIngestPayload,
  type FounderIngestPayload,
  type FundingRoundIngestPayload,
} from "../lib/startupScraper";

// Supabase client (REST API — no DATABASE_URL needed)
import { initSupabase } from "../lib/startupScraper";
const sb = initSupabase();

const DRY_RUN = process.env.DRY_RUN === "1";
const MAX_ITEMS = parseInt(process.env.CB_MAX || "0", 10);
const DELAY_MS = parseInt(process.env.CB_DELAY_MS || "1000", 10);
const HEADLESS = process.env.HEADLESS !== "false";
const API_KEY = process.env.CRUNCHBASE_API_KEY;
const CB_EMAIL = process.env.CB_EMAIL;
const CB_PASSWORD = process.env.CB_PASSWORD;
const MODE = process.env.CB_MODE || (API_KEY ? "api" : "web");
const API_BASE = "https://api.crunchbase.com/api/v4";

const DEFAULT_SEARCH_TERMS = [
  "artificial intelligence", "fintech", "saas", "marketplace",
  "healthcare technology", "cybersecurity", "edtech", "climate tech",
  "robotics", "blockchain",
];
const SEARCH_TERMS = process.env.CB_SEARCH_TERMS
  ? process.env.CB_SEARCH_TERMS.split(",").map((s) => s.trim())
  : DEFAULT_SEARCH_TERMS;

// ---------------------------------------------------------------------------
// API Mode — Crunchbase API v4
// ---------------------------------------------------------------------------

type CBApiOrg = {
  uuid: string;
  name: string;
  short_description?: string;
  description?: string;
  founded_on?: string;
  closed_on?: string;
  status?: string;
  homepage_url?: string;
  location_identifiers?: Array<{ value: string; location_type: string }>;
  categories?: Array<{ value: string }>;
  category_groups?: Array<{ value: string }>;
  num_employees_enum?: string;
  funding_total?: { value_usd: number };
  last_funding_type?: string;
  last_funding_at?: string;
  num_funding_rounds?: number;
  rank_org?: number;
  image_url?: string;
  linkedin?: { value: string };
  twitter?: { value: string };
  identifier?: { permalink: string };
};

async function apiSearchOrgs(query: string): Promise<CBApiOrg[]> {
  if (!API_KEY) return [];

  try {
    const url = `${API_BASE}/searches/organizations`;
    const body = {
      field_ids: [
        "identifier", "short_description", "description", "founded_on",
        "closed_on", "operating_status", "website_url", "location_identifiers",
        "categories", "category_groups", "num_employees_enum",
        "funding_total", "last_funding_type", "last_funding_at",
        "num_funding_rounds", "rank_org", "image_url", "linkedin", "twitter",
      ],
      query: query,
      limit: 50,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-cb-user-key": API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`[crunchbase] API search failed: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    return (data.entities || []).map((e: any) => ({
      uuid: e.uuid || "",
      name: e.properties?.identifier?.value || "",
      ...e.properties,
    }));
  } catch (err) {
    console.warn(`[crunchbase] API search error: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

async function apiFetchFundingRounds(orgUuid: string): Promise<FundingRoundIngestPayload[]> {
  if (!API_KEY) return [];

  try {
    const url = `${API_BASE}/entities/organizations/${orgUuid}/funding_rounds?field_ids=identifier,money_raised,announced_on,investment_type,lead_investor_identifiers,investor_identifiers&limit=25`;
    const res = await fetch(url, {
      headers: { "X-cb-user-key": API_KEY },
    });

    if (!res.ok) return [];

    const data = await res.json();
    return (data.entities || []).map((e: any) => ({
      round_name: e.properties?.investment_type || e.properties?.identifier?.value || "Unknown",
      round_date: e.properties?.announced_on ? new Date(e.properties.announced_on) : null,
      amount_usd: e.properties?.money_raised?.value_usd || null,
      lead_investors: (e.properties?.lead_investor_identifiers || []).map((i: any) => i.value),
      participants: (e.properties?.investor_identifiers || []).map((i: any) => i.value),
      source_url: `https://www.crunchbase.com/funding_round/${e.uuid}`,
    }));
  } catch {
    return [];
  }
}

async function apiFetchFounders(orgUuid: string): Promise<FounderIngestPayload[]> {
  if (!API_KEY) return [];

  try {
    const url = `${API_BASE}/entities/organizations/${orgUuid}/founders?field_ids=identifier,first_name,last_name,linkedin,description,location_identifiers&limit=20`;
    const res = await fetch(url, {
      headers: { "X-cb-user-key": API_KEY },
    });

    if (!res.ok) return [];

    const data = await res.json();
    return (data.entities || []).map((e: any) => ({
      full_name: `${e.properties?.first_name || ""} ${e.properties?.last_name || ""}`.trim() ||
                 e.properties?.identifier?.value || "",
      linkedin_url: e.properties?.linkedin?.value || null,
      location: (e.properties?.location_identifiers || []).map((l: any) => l.value).join(", ") || null,
    }));
  } catch {
    return [];
  }
}

function parseEmployeeRange(enumVal: string | undefined): number | null {
  if (!enumVal) return null;
  const MAP: Record<string, number> = {
    "c_00001_00010": 5,
    "c_00011_00050": 30,
    "c_00051_00100": 75,
    "c_00101_00250": 175,
    "c_00251_00500": 375,
    "c_00501_01000": 750,
    "c_01001_05000": 3000,
    "c_05001_10000": 7500,
    "c_10001_max": 15000,
  };
  return MAP[enumVal] ?? null;
}

function mapCBStatus(status: string | undefined): string {
  if (!status) return "ACTIVE";
  switch (status.toLowerCase()) {
    case "operating": return "ACTIVE";
    case "acquired": return "ACQUIRED";
    case "closed": return "SHUT_DOWN";
    case "ipo": return "IPO";
    default: return "UNKNOWN";
  }
}

// ---------------------------------------------------------------------------
// Web Mode — Playwright scraping with login
// ---------------------------------------------------------------------------

async function webLogin(page: Page): Promise<void> {
  if (!CB_EMAIL || !CB_PASSWORD) {
    console.log("[crunchbase] No CB_EMAIL/CB_PASSWORD — proceeding without login (limited data)");
    return;
  }

  console.log("[crunchbase] Logging in...");
  await page.goto("https://www.crunchbase.com/login", { waitUntil: "networkidle", timeout: 30000 });
  await sleep(2000);

  const emailInput = await page.$(
    "input[type='email'], input[name='email'], input[placeholder*='email'], #email"
  );
  const passInput = await page.$(
    "input[type='password'], input[name='password'], #password"
  );

  if (emailInput && passInput) {
    await emailInput.fill(CB_EMAIL);
    await passInput.fill(CB_PASSWORD);
    await sleep(500);
    const submitBtn = await page.$(
      "button[type='submit'], button:has-text('Log In'), button:has-text('Sign In')"
    );
    if (submitBtn) await submitBtn.click();
    else await passInput.press("Enter");

    await page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await sleep(3000);

    if (page.url().includes("/login")) {
      console.warn("[crunchbase] Login may have failed — still on login page");
    } else {
      console.log("[crunchbase] Login successful");
    }
  } else {
    console.warn("[crunchbase] Could not find login form — proceeding without auth");
  }
}

async function webScrapeSearch(page: Page, query: string): Promise<Array<{ name: string; slug: string; description: string | null }>> {
  try {
    await page.goto(`https://www.crunchbase.com/discover/organizations?query=${encodeURIComponent(query)}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await sleep(3000);

    return await page.evaluate(() => {
      const results: Array<{ name: string; slug: string; description: string | null }> = [];
      const rows = document.querySelectorAll(
        "[class*='result'], [class*='entity'], tr, [class*='card']"
      );
      for (const row of rows) {
        const linkEl = row.querySelector("a[href*='/organization/']");
        if (!linkEl) continue;
        const name = linkEl.textContent?.trim();
        if (!name) continue;
        const href = linkEl.getAttribute("href") || "";
        const slug = href.split("/organization/")[1]?.split(/[?#/]/)[0] || "";
        const desc = row.querySelector("p, [class*='desc']")?.textContent?.trim() || null;
        results.push({ name, slug, description: desc });
      }
      return results;
    });
  } catch {
    return [];
  }
}

async function webScrapeProfile(page: Page, slug: string): Promise<Partial<StartupIngestPayload> | null> {
  try {
    await page.goto(`https://www.crunchbase.com/organization/${slug}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await sleep(3000);

    return await page.evaluate(() => {
      const data: any = {};

      // Extract from structured fields
      const fields = document.querySelectorAll("[class*='field'], [class*='detail'], dl");
      for (const field of fields) {
        const label = field.querySelector("dt, [class*='label']")?.textContent?.trim()?.toLowerCase() || "";
        const value = field.querySelector("dd, [class*='value']")?.textContent?.trim() || "";

        if (label.includes("founded")) data.founding_date = value;
        if (label.includes("headquarter") || label.includes("location")) data.location = value;
        if (label.includes("employee")) data.headcount_str = value;
        if (label.includes("funding") || label.includes("raised")) data.funding_str = value;
        if (label.includes("stage") || label.includes("round")) data.stage = value;
        if (label.includes("status")) data.status = value;
        if (label.includes("industry") || label.includes("sector")) data.industry = value;
      }

      // Description
      data.description = document.querySelector("[class*='description'] p, [class*='overview'] p")?.textContent?.trim() || null;

      // Logo
      data.logo = document.querySelector("[class*='logo'] img, [class*='profile-image'] img")?.getAttribute("src") || null;

      // Website
      const websiteLink = document.querySelector("a[href*='http'][class*='website'], a[data-test='link-website']");
      data.website = websiteLink?.getAttribute("href") || null;

      return data;
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function scrape(): Promise<void> {
  const stats = new ScrapeStats("Crunchbase");
  const progress = new ScrapeProgress("crunchbase");

  console.log(`[crunchbase] Starting scrape (MODE=${MODE}, DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS || "all"})`);

  if (MODE === "api") {
    if (!API_KEY) {
      console.error("[crunchbase] CRUNCHBASE_API_KEY not set — falling back to web mode");
      console.log("[crunchbase] Set CRUNCHBASE_API_KEY in .env to use the faster API mode");
    } else {
      await scrapeViaApi(stats, progress);
      console.log(stats.summary());
      return;
    }
  }

  // Web mode
  if (!API_KEY && MODE !== "web") {
    console.log("[crunchbase] No API key found. Using web scraping mode.");
    console.log("[crunchbase] Note: Web scraping may be rate-limited or blocked by Crunchbase.");
    console.log("[crunchbase] For production use, set CRUNCHBASE_API_KEY in .env.");
  }

  await scrapeViaWeb(stats, progress);
  console.log(stats.summary());
}

async function scrapeViaApi(stats: ScrapeStats, progress: ScrapeProgress): Promise<void> {
  const allOrgs: CBApiOrg[] = [];
  const seen = new Set<string>();

  for (const term of SEARCH_TERMS) {
    if (MAX_ITEMS && allOrgs.length >= MAX_ITEMS) break;
    console.log(`[crunchbase] API search: "${term}"`);

    const results = await apiSearchOrgs(term);
    for (const org of results) {
      if (!org.name || seen.has(org.name.toLowerCase())) continue;
      seen.add(org.name.toLowerCase());
      allOrgs.push(org);
    }
    await sleep(DELAY_MS);
  }

  const items = MAX_ITEMS ? allOrgs.slice(0, MAX_ITEMS) : allOrgs;
  console.log(`[crunchbase] Found ${items.length} unique companies via API`);

  for (const org of items) {
    if (progress.isDone(org.name)) {
      stats.recordSkip();
      continue;
    }

    // Fetch funding rounds and founders
    let fundingRounds: FundingRoundIngestPayload[] = [];
    let founders: FounderIngestPayload[] = [];

    if (org.uuid) {
      await sleep(DELAY_MS);
      fundingRounds = await apiFetchFundingRounds(org.uuid);
      await sleep(DELAY_MS);
      founders = await apiFetchFounders(org.uuid);
    }

    const locations = org.location_identifiers || [];
    const city = locations.find((l) => l.location_type === "city")?.value || null;
    const country = locations.find((l) => l.location_type === "country")?.value || null;
    const state = locations.find((l) => l.location_type === "region")?.value || null;
    const permalink = org.identifier?.permalink || "";

    const payload: StartupIngestPayload = {
      company_name: org.name,
      data_source: "crunchbase",
      company_url: org.homepage_url || null,
      domain: normalizeDomain(org.homepage_url),
      description_short: org.short_description || null,
      description_long: org.description || null,
      logo_url: org.image_url || null,
      founding_date: org.founded_on ? new Date(org.founded_on) : null,
      founded_year: org.founded_on ? new Date(org.founded_on).getFullYear() : null,
      hq_city: city,
      hq_state: state,
      hq_country: country,
      status: mapCBStatus(org.status),
      headcount: parseEmployeeRange(org.num_employees_enum),
      total_raised_usd: org.funding_total?.value_usd || null,
      last_round_type: org.last_funding_type || null,
      last_round_date: org.last_funding_at ? new Date(org.last_funding_at) : null,
      market_category: (org.categories || []).map((c) => c.value).join(", ") || null,
      secondary_sectors: (org.category_groups || []).map((c) => c.value),
      linkedin_url: org.linkedin?.value || null,
      x_url: org.twitter?.value || null,
      crunchbase_url: permalink ? `https://www.crunchbase.com/organization/${permalink}` : null,
      founders: founders.length > 0 ? founders : undefined,
      funding_rounds: fundingRounds.length > 0 ? fundingRounds : undefined,
      external_ids: org.uuid ? { crunchbase_uuid: org.uuid, crunchbase_permalink: permalink } : undefined,
    };

    if (DRY_RUN) {
      console.log(`[crunchbase] [DRY] Would upsert: ${org.name}`);
      stats.recordSkip();
    } else {
      try {
        const result = await upsertStartup(sb, payload);
        stats.record(result);
        progress.markDone(org.name);
      } catch (err) {
        console.error(`[crunchbase] Error upserting ${org.name}: ${err instanceof Error ? err.message : err}`);
        stats.recordError();
      }
    }
  }
}

async function scrapeViaWeb(stats: ScrapeStats, progress: ScrapeProgress): Promise<void> {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await webLogin(page);

    const allResults: Array<{ name: string; slug: string; description: string | null }> = [];
    const seen = new Set<string>();

    for (const term of SEARCH_TERMS) {
      if (MAX_ITEMS && allResults.length >= MAX_ITEMS) break;
      console.log(`[crunchbase] Web search: "${term}"`);

      const results = await webScrapeSearch(page, term);
      for (const r of results) {
        if (!r.name || seen.has(r.name.toLowerCase())) continue;
        seen.add(r.name.toLowerCase());
        allResults.push(r);
      }
      await sleep(DELAY_MS * 2); // Extra cautious on web scraping
    }

    const items = MAX_ITEMS ? allResults.slice(0, MAX_ITEMS) : allResults;
    console.log(`[crunchbase] Found ${items.length} unique companies via web`);

    for (const company of items) {
      if (progress.isDone(company.name)) {
        stats.recordSkip();
        continue;
      }

      await sleep(DELAY_MS * 2);

      // Scrape the profile page
      const profile = company.slug ? await webScrapeProfile(page, company.slug) : null;

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

      const payload: StartupIngestPayload = {
        company_name: company.name,
        data_source: "crunchbase",
        company_url: (profile as any)?.website || null,
        domain: normalizeDomain((profile as any)?.website),
        description_short: company.description || (profile as any)?.description || null,
        logo_url: (profile as any)?.logo || null,
        hq_country: (profile as any)?.location || null,
        total_raised_usd: parseFunding((profile as any)?.funding_str),
        stage: (profile as any)?.stage,
        status: (profile as any)?.status ? mapCBStatus((profile as any).status) : undefined,
        market_category: (profile as any)?.industry || null,
        crunchbase_url: company.slug ? `https://www.crunchbase.com/organization/${company.slug}` : null,
        external_ids: company.slug ? { crunchbase_slug: company.slug } : undefined,
      };

      if (DRY_RUN) {
        console.log(`[crunchbase] [DRY] Would upsert: ${company.name}`);
        stats.recordSkip();
      } else {
        try {
          const result = await upsertStartup(sb, payload);
          stats.record(result);
          progress.markDone(company.name);
        } catch (err) {
          console.error(`[crunchbase] Error upserting ${company.name}: ${err instanceof Error ? err.message : err}`);
          stats.recordError();
        }
      }
    }
  } finally {
    await browser.close();
  }
}

scrape()
  .catch((err) => {
    console.error("[crunchbase] Fatal:", err);
    process.exit(1);
  })
  // done;
