/**
 * scrape-signal-nfx.ts — Signal NFX Playwright enrichment scraper
 *
 * Uses saved auth cookies from data/signal-nfx-auth.json to scrape
 * firm and investor profiles on signal.nfx.com.
 *
 * Supports GraphQL API interception for structured data extraction
 * alongside DOM scraping as a fallback.
 */

import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  env, envInt, envBool,
  getSupabase, log, sleep, RateLimiter,
  normalizeName, normalizeNameForMatch, extractDomain, isEmptyOrWeak,
  isStrongNameMatch, tokenOverlap,
  computeFieldUpdates, recordProvenance, queueCandidateValue, recordMatchFailure,
  saveCheckpoint,
  batchUpdateFirms, batchUpdateInvestors,
  emptyStats, evidencePath, ensureDir,
  type SourceStats, type ProvenanceRecord,
} from "./shared.js";

// ── Config ───────────────────────────────────────────────────────────────────

const EMAIL     = env("SIGNAL_NFX_EMAIL") || env("SIGNAL_NFX_EMAIL_2") || "";
const PASSWORD  = env("SIGNAL_NFX_PASSWORD") || env("SIGNAL_NFX_PASSWORD_2") || "";
const HEADLESS  = !["false", "0", "no"].includes((env("SIGNAL_NFX_HEADLESS") || "true").toLowerCase());
const DELAY_MS  = envInt("SIGNAL_NFX_DELAY_MS", 1500);
const AUTH_FILE = env("SIGNAL_AUTH_FILE") || join(process.cwd(), "data", "signal-nfx-auth.json");
const PROXY_URL = env("SIGNAL_NFX_PROXY") || null;
const SIGNAL_BASE = "https://signal.nfx.com";
const CHECKPOINT_EVERY = 25;

// ── Captured API data (intercepted from GraphQL responses) ───────────────────

let _capturedApiData: Record<string, any> = {};

function clearCapturedData() { _capturedApiData = {}; }
function getCapturedData() { return _capturedApiData; }

// ── Browser setup ────────────────────────────────────────────────────────────

async function setupBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const launchOpts: any = {
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
  };
  if (PROXY_URL) {
    const url = new URL(PROXY_URL);
    launchOpts.proxy = {
      server: `${url.protocol}//${url.hostname}:${url.port}`,
      username: url.username || undefined,
      password: url.password || undefined,
    };
  }

  const browser = await chromium.launch(launchOpts);

  let context: BrowserContext;
  if (existsSync(AUTH_FILE)) {
    log(`  Loading Signal NFX auth from ${AUTH_FILE}`);
    const state = JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
    context = await browser.newContext({ storageState: state });
  } else {
    log("  No auth file — will attempt login");
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
    });
  }

  const page = await context.newPage();

  // Set up API interception to capture GraphQL responses
  await page.route("**/graphql**", async (route: Route) => {
    const response = await route.fetch();
    try {
      const body = await response.json();
      if (body?.data) {
        Object.assign(_capturedApiData, body.data);
      }
    } catch { /* not JSON */ }
    await route.fulfill({ response });
  });

  // Verify auth — navigate to investors page, wait for JS redirects
  log("  Verifying Signal NFX session...");
  try {
    await page.goto(`${SIGNAL_BASE}/investors`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(3000);
  } catch { log("  Navigation timeout on initial load"); }

  const currentUrl = page.url();
  const onLogin = currentUrl.includes("/login");
  const hasContent = !onLogin && (await page.locator('a[href^="/investors/"]').count()) > 0;

  if (!onLogin && hasContent) {
    log(`  Session active: ${currentUrl}`);
  } else {
    log("  Session expired — attempting re-auth...");
    let authOk = false;

    // Step 1: Try Auth0 silent refresh
    log("  Trying Auth0 silent refresh...");
    try {
      await page.goto(`${SIGNAL_BASE}/login`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await sleep(3000);
      if (!page.url().includes("/login")) {
        log(`  Auth0 silent refresh succeeded: ${page.url()}`);
        await context.storageState({ path: AUTH_FILE });
        authOk = true;
      }
    } catch { /* continue */ }

    // Step 2: Programmatic login
    if (!authOk) {
      const ok = await loginToSignal(page);
      if (ok) {
        await context.storageState({ path: AUTH_FILE });
        log(`  Auth saved to ${AUTH_FILE}`);
        authOk = true;
      }
    }

    if (!authOk) {
      log("  AUTH FAILED — run 'SIGNAL_PHASE=auth npm run scrape:signal-nfx' to login manually first");
      log("  Skipping Signal NFX scraping.");
      await browser.close();
      return stats;
    }
  }

  return { browser, context, page };
}

async function loginToSignal(page: Page): Promise<boolean> {
  const loginEmail = EMAIL || "joinfutureforum@gmail.com";
  const loginPass = PASSWORD || "RADIO123radio";
  log(`  Attempting login as ${loginEmail}...`);
  try {
    await page.goto(`${SIGNAL_BASE}/login`, { waitUntil: "networkidle", timeout: 30_000 });
    await sleep(2000);

    // Try to find email input (may not exist if Auth0 redirect handles it)
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    if (await emailInput.count() === 0) {
      log("  No email input found — login page may use OAuth/SSO");
      // Check if Auth0 already redirected us
      if (!page.url().includes("/login")) {
        log(`  Auth0 silent refresh succeeded: ${page.url()}`);
        return true;
      }
      return false;
    }
    await emailInput.fill(loginEmail);

    // Find "Continue" or submit button (Auth0 2-step flow)
    const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button[type="submit"]').first();
    if (await continueBtn.count() > 0) {
      await continueBtn.click();
      await sleep(1500);
    }

    // Fill password
    const passInput = page.locator('input[type="password"]').first();
    if (await passInput.count() > 0) {
      await passInput.fill(loginPass);
      const loginBtn = page.locator('button[type="submit"], button:has-text("Log In"), button:has-text("Sign In")').first();
      if (await loginBtn.count() > 0) {
        await loginBtn.click();
      }
    }

    // Wait for redirect away from /login
    try {
      await page.waitForURL(u => !u.toString().includes("/login"), { timeout: 20_000 });
      log(`  Login succeeded: ${page.url()}`);
      return true;
    } catch {
      log("  Login redirect timed out");
      return false;
    }
  } catch (err: any) {
    log(`  Login error: ${err.message}`);
    return false;
  }
}

// ── Firm profile extraction ──────────────────────────────────────────────────

interface SignalFirmData {
  description?: string;
  hq_city?: string;
  hq_state?: string;
  hq_country?: string;
  website_url?: string;
  aum?: string;
  fund_size?: string;
  stages?: string[];
  sectors?: string[];
  team_members?: Array<{ name: string; title: string | null; slug?: string }>;
  total_investments?: number;
  portfolio_companies?: string[];
  check_size_min?: number;
  check_size_max?: number;
  logo_url?: string;
  linkedin_url?: string;
  x_url?: string;
  signal_nfx_url?: string;
  recent_investments?: Array<{ company: string; stage?: string; date?: string }>;
}

async function extractSignalFirmProfile(page: Page): Promise<SignalFirmData> {
  // First check captured GraphQL data
  const apiData = getCapturedData();

  const domData = await page.evaluate(() => {
    const d: Record<string, any> = {};
    const body = document.body.innerText || "";

    // Description
    const descEls = document.querySelectorAll('[class*="description"], [class*="about"], p');
    for (const el of descEls) {
      const t = el.textContent?.trim();
      if (t && t.length > 60 && t.length < 2000) { d.description = t; break; }
    }

    // Key-value pairs
    const allText = document.querySelectorAll("span, div, td, li, dt, dd");
    const kvPairs: Record<string, string> = {};
    const labels = ["Location", "Fund Size", "AUM", "Stage", "Sectors", "Sweet Spot",
      "Investment Range", "Website", "Check Size", "Founded"];
    for (const el of allText) {
      const text = el.textContent?.trim() || "";
      for (const label of labels) {
        if (text.startsWith(label) && text.length < 200) {
          kvPairs[label] = text.slice(label.length).replace(/^[:\s]+/, "").trim();
        }
      }
    }

    // Location
    if (kvPairs["Location"]) {
      const parts = kvPairs["Location"].split(",").map((s: string) => s.trim());
      d.hq_city = parts[0];
      if (parts.length >= 3) d.hq_state = parts[1];
      d.hq_country = parts[parts.length - 1];
    }

    // AUM / Fund Size
    if (kvPairs["AUM"]) d.aum = kvPairs["AUM"];
    if (kvPairs["Fund Size"]) d.fund_size = kvPairs["Fund Size"];
    if (kvPairs["Website"]) d.website_url = kvPairs["Website"];

    // Check size
    const rangeText = kvPairs["Investment Range"] || kvPairs["Check Size"] || kvPairs["Sweet Spot"] || "";
    const rangeMatch = rangeText.match(/\$([\d,.]+[KMB]?)\s*[-–]\s*\$([\d,.]+[KMB]?)/i);
    if (rangeMatch) {
      d.check_size_range = rangeText;
    }

    // Stages
    if (kvPairs["Stage"]) {
      d.stages = kvPairs["Stage"].split(",").map((s: string) => s.trim()).filter(Boolean);
    }

    // Sectors
    if (kvPairs["Sectors"]) {
      d.sectors = kvPairs["Sectors"].split(",").map((s: string) => s.trim()).filter(Boolean);
    }

    // Sector and stage tags/chips
    const chipEls = document.querySelectorAll('[class*="chip"], [class*="tag"], [class*="badge"]');
    const chips: string[] = [];
    for (const el of chipEls) {
      const t = el.textContent?.trim();
      if (t && t.length > 2 && t.length < 50) chips.push(t);
    }
    if (chips.length > 0 && !d.sectors) d.sectors = chips;

    // Team members
    const team: Array<{ name: string; title: string | null; slug?: string }> = [];
    const memberLinks = document.querySelectorAll('a[href*="/investors/"]');
    const seenNames = new Set<string>();
    for (const link of memberLinks) {
      const name = link.textContent?.trim();
      if (!name || name.length < 2 || name.length > 60 || seenNames.has(name)) continue;
      seenNames.add(name);
      const href = (link as HTMLAnchorElement).pathname;
      const slug = href.replace("/investors/", "").replace(/\/$/, "");

      let title: string | null = null;
      const parent = link.parentElement;
      if (parent) {
        const texts = parent.textContent?.split("\n").map((l: string) => l.trim()).filter(Boolean) || [];
        const titleLine = texts.find((t: string) =>
          t !== name && (t.includes("Partner") || t.includes("Director") || t.includes("Principal") ||
            t.includes("Associate") || t.includes("Managing") || t.includes("Founder"))
        );
        if (titleLine) title = titleLine;
      }
      team.push({ name, title, slug });
    }
    if (team.length > 0) d.team_members = team;

    // Portfolio companies
    const portLinks = document.querySelectorAll('a[href*="/companies/"]');
    const portfolio: string[] = [];
    for (const link of portLinks) {
      const name = link.textContent?.trim();
      if (name && name.length > 1 && name.length < 60) portfolio.push(name);
    }
    if (portfolio.length > 0) d.portfolio_companies = [...new Set(portfolio)].slice(0, 25);

    // Investment count
    const invMatch = body.match(/(\d[\d,]*)\s*(?:investments?|deals?)/i);
    if (invMatch) d.total_investments = parseInt(invMatch[1].replace(/,/g, ""), 10);

    // Logo
    const logoImg = document.querySelector('img[class*="logo"], img[src*="logo"]');
    if (logoImg) d.logo_url = (logoImg as HTMLImageElement).src;

    // Social links
    document.querySelectorAll("a[href]").forEach(a => {
      const h = (a as HTMLAnchorElement).href;
      if (h.includes("linkedin.com/company")) d.linkedin_url = h;
      if (h.includes("twitter.com/") || (h.includes("x.com/") && !h.includes("nfx.com"))) d.x_url = h;
    });

    d.signal_nfx_url = window.location.href;
    return d;
  });

  // Merge API data with DOM data (API takes precedence for structured fields)
  const merged: SignalFirmData = { ...domData };
  if (apiData.firm || apiData.investor || apiData.organization) {
    const org = apiData.firm || apiData.investor || apiData.organization || {};
    if (org.description && !merged.description) merged.description = org.description;
    if (org.location) {
      const parts = org.location.split(",").map((s: string) => s.trim());
      if (!merged.hq_city && parts[0]) merged.hq_city = parts[0];
      if (!merged.hq_country && parts.length >= 2) merged.hq_country = parts[parts.length - 1];
    }
    if (org.website && !merged.website_url) merged.website_url = org.website;
    if (org.aum && !merged.aum) merged.aum = org.aum;
    if (org.fundSize && !merged.fund_size) merged.fund_size = org.fundSize;
  }

  return merged;
}

// ── Investor profile extraction ──────────────────────────────────────────────

interface SignalInvestorData {
  title?: string;
  bio?: string;
  firm_name?: string;
  hq_city?: string;
  hq_state?: string;
  hq_country?: string;
  website_url?: string;
  x_url?: string;
  linkedin_url?: string;
  check_size_min?: number;
  check_size_max?: number;
  sweet_spot?: string;
  fund_size?: string;
  avatar_url?: string;
  networks?: string[];
  sectors?: string[];
  stages?: string[];
  past_investments?: Array<{ company: string; stage?: string; date?: string }>;
  co_investors?: string[];
  signal_nfx_url?: string;
}

async function extractSignalInvestorProfile(page: Page): Promise<SignalInvestorData> {
  const apiData = getCapturedData();

  const domData = await page.evaluate(() => {
    const d: Record<string, any> = {};
    const body = document.body.innerText || "";

    // Name and title from heading area
    const headings = document.querySelectorAll("h1, h2");
    for (const h of headings) {
      const sib = h.nextElementSibling;
      if (sib) {
        const t = sib.textContent?.trim();
        if (t && t.length < 100 && !t.includes("http")) {
          if (t.includes("Partner") || t.includes("Director") || t.includes("Managing") ||
              t.includes("Founder") || t.includes("CEO") || t.includes("Principal")) {
            d.title = t;
          }
        }
      }
    }

    // Key-value pairs
    const kvPairs: Record<string, string> = {};
    const allEls = document.querySelectorAll("span, div, li, dt, dd");
    const labels = ["Location", "Fund Size", "Sweet Spot", "Investment Range",
      "Check Size", "Firm", "Website", "Stage Focus", "Sector Focus"];
    for (const el of allEls) {
      const text = el.textContent?.trim() || "";
      for (const label of labels) {
        if (text.startsWith(label) && text.length < 200) {
          kvPairs[label] = text.slice(label.length).replace(/^[:\s]+/, "").trim();
        }
      }
    }

    if (kvPairs["Location"]) {
      const parts = kvPairs["Location"].split(",").map((s: string) => s.trim());
      d.hq_city = parts[0];
      if (parts.length >= 3) d.hq_state = parts[1];
      d.hq_country = parts[parts.length - 1];
    }
    if (kvPairs["Firm"]) d.firm_name = kvPairs["Firm"];
    if (kvPairs["Website"]) d.website_url = kvPairs["Website"];
    if (kvPairs["Sweet Spot"]) d.sweet_spot = kvPairs["Sweet Spot"];
    if (kvPairs["Fund Size"]) d.fund_size = kvPairs["Fund Size"];

    // Check size range
    const rangeText = kvPairs["Investment Range"] || kvPairs["Check Size"] || "";
    const rangeMatch = rangeText.match(/\$([\d,.]+[KMB]?)\s*[-–]\s*\$([\d,.]+[KMB]?)/i);
    if (rangeMatch) {
      d.check_size_range = rangeText;
    }

    // Stages
    if (kvPairs["Stage Focus"]) {
      d.stages = kvPairs["Stage Focus"].split(",").map((s: string) => s.trim()).filter(Boolean);
    }

    // Sectors
    if (kvPairs["Sector Focus"]) {
      d.sectors = kvPairs["Sector Focus"].split(",").map((s: string) => s.trim()).filter(Boolean);
    }

    // Sector/stage chips
    const chipEls = document.querySelectorAll('[class*="chip"], [class*="tag"], [class*="badge"]');
    const chips: string[] = [];
    for (const el of chipEls) {
      const t = el.textContent?.trim();
      if (t && t.length > 2 && t.length < 50) chips.push(t);
    }

    // Avatar
    const avatar = document.querySelector('img[class*="avatar"], img[class*="profile"], img[class*="photo"]');
    if (avatar) {
      const src = (avatar as HTMLImageElement).src;
      if (src && !src.includes("placeholder") && !src.includes("default")) d.avatar_url = src;
    }

    // Links
    document.querySelectorAll("a[href]").forEach(a => {
      const h = (a as HTMLAnchorElement).href;
      if (h.includes("linkedin.com/in/")) d.linkedin_url = h;
      if (h.includes("twitter.com/") || (h.includes("x.com/") && !h.includes("nfx.com"))) d.x_url = h;
    });

    // Past investments
    const investments: Array<{ company: string; stage?: string; date?: string }> = [];
    const investmentRows = document.querySelectorAll('[class*="investment"], [class*="deal"], tr');
    for (const row of investmentRows) {
      const companyLink = row.querySelector('a[href*="/companies/"]');
      if (companyLink) {
        const company = companyLink.textContent?.trim();
        if (company && company.length > 1) {
          const text = row.textContent || "";
          const stageMatch = text.match(/(Pre-Seed|Seed|Series [A-Z]|Growth)/i);
          investments.push({
            company,
            stage: stageMatch ? stageMatch[1] : undefined,
          });
        }
      }
    }
    if (investments.length > 0) d.past_investments = investments.slice(0, 30);

    // Co-investors
    const coInvEls = document.querySelectorAll('a[href*="/investors/"]');
    const coInvs: string[] = [];
    for (const el of coInvEls) {
      const name = el.textContent?.trim();
      if (name && name.length > 2 && name.length < 60) coInvs.push(name);
    }
    if (coInvs.length > 0) d.co_investors = [...new Set(coInvs)].slice(0, 20);

    // Networks
    const networkEls = document.querySelectorAll('[class*="network"]');
    const networks: string[] = [];
    for (const el of networkEls) {
      const t = el.textContent?.trim();
      if (t && t.length > 3 && t.length < 80) networks.push(t);
    }
    if (networks.length > 0) d.networks = networks;

    d.signal_nfx_url = window.location.href;
    return d;
  });

  // Merge API data
  const merged: SignalInvestorData = { ...domData };
  if (apiData.investor || apiData.person) {
    const inv = apiData.investor || apiData.person || {};
    if (inv.title && !merged.title) merged.title = inv.title;
    if (inv.bio && !merged.bio) merged.bio = inv.bio;
    if (inv.location) {
      const parts = inv.location.split(",").map((s: string) => s.trim());
      if (!merged.hq_city) merged.hq_city = parts[0];
      if (!merged.hq_country) merged.hq_country = parts[parts.length - 1];
    }
    if (inv.checkSizeMin && !merged.check_size_min) merged.check_size_min = inv.checkSizeMin;
    if (inv.checkSizeMax && !merged.check_size_max) merged.check_size_max = inv.checkSizeMax;
    if (inv.avatarUrl && !merged.avatar_url) merged.avatar_url = inv.avatarUrl;
  }

  return merged;
}

// ── Parse dollar string to number ────────────────────────────────────────────

function parseDollarAmount(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/\$?([\d,.]+)\s*([KMB])?/i);
  if (!m) return null;
  let val = parseFloat(m[1].replace(/,/g, ""));
  const suffix = (m[2] || "").toUpperCase();
  if (suffix === "K") val *= 1_000;
  else if (suffix === "M") val *= 1_000_000;
  else if (suffix === "B") val *= 1_000_000_000;
  return val;
}

// ── Main scraper function ────────────────────────────────────────────────────

export async function runSignalNFXScraper(config: {
  runId: string;
  dryRun: boolean;
  firmRecords: any[];
  investorRecords: any[];
  maxFirms?: number;
  maxInvestors?: number;
  resumeFromId?: string;
}): Promise<SourceStats> {
  const stats = emptyStats();
  const supabase = getSupabase();
  const limiter = new RateLimiter(DELAY_MS);

  let browser: Browser | null = null;
  try {
    const setup = await setupBrowser();
    browser = setup.browser;
    const { page } = setup;

    // ── Firms ──────────────────────────────────────────────────────────────

    // Filter to firms that have a signal_nfx_url (direct navigation) or try search
    const firms = config.firmRecords.slice(0, config.maxFirms || 999_999);
    log(`\n  Signal NFX: processing ${firms.length} firms...`);

    const firmBatch: Array<{ id: string; patch: Record<string, any> }> = [];
    const firmProvenance: ProvenanceRecord[] = [];

    for (let i = 0; i < firms.length; i++) {
      const firm = firms[i];
      stats.firmsSearched++;

      try {
        await limiter.wait();
        clearCapturedData();
        log(`  [${i + 1}/${firms.length}] Signal NFX: ${firm.firm_name}`);

        let targetUrl: string | null = null;

        // Direct URL if available
        if (firm.signal_nfx_url && firm.signal_nfx_url.includes("/firms/")) {
          targetUrl = firm.signal_nfx_url.startsWith("http")
            ? firm.signal_nfx_url
            : `${SIGNAL_BASE}${firm.signal_nfx_url}`;
        } else {
          // Search via URL
          const q = encodeURIComponent(firm.firm_name);
          await page.goto(`${SIGNAL_BASE}/search?q=${q}`, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          });
          await sleep(2000);

          // Look for firm results
          const firmLinks = await page.evaluate((searchName: string) => {
            const results: Array<{ name: string; url: string }> = [];
            const links = document.querySelectorAll('a[href*="/firms/"]');
            for (const link of links) {
              results.push({
                name: link.textContent?.trim() || "",
                url: (link as HTMLAnchorElement).href,
              });
            }
            return results.slice(0, 5);
          }, firm.firm_name);

          if (firmLinks.length > 0) {
            // Match by name
            const matched = firmLinks.find(r => isStrongNameMatch(firm.firm_name, r.name));
            targetUrl = matched?.url || (tokenOverlap(firm.firm_name, firmLinks[0].name) >= 0.7 ? firmLinks[0].url : null);
          }
        }

        if (!targetUrl) {
          stats.firmsNotFound++;
          await recordMatchFailure(supabase, {
            run_id: config.runId,
            entity_type: "firm",
            entity_id: firm.id,
            entity_name: firm.firm_name,
            source_platform: "signal_nfx",
            failure_reason: "no_match_found",
            search_query: firm.firm_name,
          });
          continue;
        }

        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await sleep(2500);

        const scraped = await extractSignalFirmProfile(page);
        stats.firmsMatched++;

        // Map to firm_records columns
        const scrapedFields: Record<string, any> = {};
        if (scraped.description) scrapedFields.description = scraped.description;
        if (scraped.website_url) scrapedFields.website_url = scraped.website_url;
        if (scraped.hq_city) scrapedFields.hq_city = scraped.hq_city;
        if (scraped.hq_state) scrapedFields.hq_state = scraped.hq_state;
        if (scraped.hq_country) scrapedFields.hq_country = scraped.hq_country;
        if (scraped.aum) scrapedFields.aum = scraped.aum;
        if (scraped.fund_size) scrapedFields.current_fund_size = scraped.fund_size;
        if (scraped.total_investments) scrapedFields.total_investments = scraped.total_investments;
        if (scraped.logo_url) scrapedFields.logo_url = scraped.logo_url;
        if (scraped.linkedin_url) scrapedFields.linkedin_url = scraped.linkedin_url;
        if (scraped.x_url) scrapedFields.x_url = scraped.x_url;
        if (scraped.signal_nfx_url) scrapedFields.signal_nfx_url = scraped.signal_nfx_url;
        if (scraped.sectors && scraped.sectors.length > 0) scrapedFields.thesis_verticals = scraped.sectors;
        if (scraped.check_size_min) scrapedFields.check_size_min = scraped.check_size_min;
        if (scraped.check_size_max) scrapedFields.check_size_max = scraped.check_size_max;

        const updates = computeFieldUpdates(firm, scrapedFields, 0.8);
        const patch: Record<string, any> = {};

        for (const u of updates) {
          if (u.autoApply) {
            patch[u.field] = u.newValue;
            stats.fieldsUpdated++;
            stats.fieldsByType[u.field] = (stats.fieldsByType[u.field] || 0) + 1;
            firmProvenance.push({
              entity_type: "firm",
              entity_id: firm.id,
              field_name: u.field,
              old_value: u.oldValue != null ? String(u.oldValue) : null,
              new_value: String(u.newValue),
              source_platform: "signal_nfx",
              source_url: scraped.signal_nfx_url || targetUrl,
              confidence_score: u.confidence,
              extraction_method: Object.keys(getCapturedData()).length > 0 ? "graphql_api" : "playwright_dom",
              match_method: firm.signal_nfx_url ? "direct_url" : "search_name",
              reviewer_required: false,
              auto_applied: true,
            });
          } else {
            stats.fieldsQueuedReview++;
            await queueCandidateValue(supabase, {
              entity_type: "firm",
              entity_id: firm.id,
              field_name: u.field,
              candidate_value: String(u.newValue),
              current_value: u.oldValue != null ? String(u.oldValue) : null,
              source_platform: "signal_nfx",
              source_url: scraped.signal_nfx_url || targetUrl,
              confidence_score: u.confidence,
              reason: "medium_confidence_field",
            });
          }
        }

        if (Object.keys(patch).length > 0) {
          firmBatch.push({ id: firm.id, patch });
          stats.firmsUpdated++;
        }

        if (firmBatch.length >= CHECKPOINT_EVERY) {
          const r = await batchUpdateFirms(supabase, firmBatch, config.dryRun);
          await recordProvenance(supabase, firmProvenance);
          log(`  Signal checkpoint: ${r.success} firms updated`);
          firmBatch.length = 0;
          firmProvenance.length = 0;
          await saveCheckpoint(supabase, {
            run_id: config.runId,
            source_platform: "signal_nfx",
            entity_type: "firm",
            last_entity_id: firm.id,
            last_entity_name: firm.firm_name,
            records_processed: stats.firmsSearched,
            records_updated: stats.firmsUpdated,
            records_skipped: stats.firmsNotFound,
            records_failed: stats.errors,
          });
        }
      } catch (err: any) {
        stats.errors++;
        log(`  Signal ERROR firm ${firm.firm_name}: ${err.message}`);
        try {
          const ssPath = evidencePath(config.runId, "signal_nfx", firm.id, "png");
          await page.screenshot({ path: ssPath, fullPage: false });
        } catch { /* ignore */ }
      }
    }

    if (firmBatch.length > 0) {
      await batchUpdateFirms(supabase, firmBatch, config.dryRun);
      await recordProvenance(supabase, firmProvenance);
    }

    // ── Investors ──────────────────────────────────────────────────────────

    const investors = config.investorRecords.slice(0, config.maxInvestors || 999_999);
    log(`\n  Signal NFX: processing ${investors.length} investors...`);

    const invBatch: Array<{ id: string; patch: Record<string, any> }> = [];
    const invProvenance: ProvenanceRecord[] = [];

    for (let i = 0; i < investors.length; i++) {
      const inv = investors[i];
      stats.investorsSearched++;
      const fullName = `${inv.first_name || ""} ${inv.last_name || ""}`.trim();

      try {
        await limiter.wait();
        clearCapturedData();
        log(`  [${i + 1}/${investors.length}] Signal investor: ${fullName}`);

        let targetUrl: string | null = null;

        // Direct URL
        if (inv.signal_nfx_url && inv.signal_nfx_url.includes("/investors/")) {
          targetUrl = inv.signal_nfx_url.startsWith("http")
            ? inv.signal_nfx_url
            : `${SIGNAL_BASE}${inv.signal_nfx_url}`;
        } else {
          // Search
          const q = encodeURIComponent(fullName);
          await page.goto(`${SIGNAL_BASE}/search?q=${q}`, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          });
          await sleep(2000);

          const invLinks = await page.evaluate(() => {
            const results: Array<{ name: string; url: string }> = [];
            const links = document.querySelectorAll('a[href*="/investors/"]');
            for (const link of links) {
              const name = link.textContent?.trim();
              if (name && name.length > 2) {
                results.push({ name, url: (link as HTMLAnchorElement).href });
              }
            }
            return results.slice(0, 5);
          });

          if (invLinks.length > 0) {
            const matched = invLinks.find(r => isStrongNameMatch(fullName, r.name));
            targetUrl = matched?.url || (tokenOverlap(fullName, invLinks[0].name) >= 0.8 ? invLinks[0].url : null);
          }
        }

        if (!targetUrl) {
          stats.investorsNotFound++;
          continue;
        }

        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await sleep(2500);

        const scraped = await extractSignalInvestorProfile(page);
        stats.investorsMatched++;

        const scrapedFields: Record<string, any> = {};
        if (scraped.title) scrapedFields.title = scraped.title;
        if (scraped.bio) scrapedFields.bio = scraped.bio;
        if (scraped.linkedin_url) scrapedFields.linkedin_url = scraped.linkedin_url;
        if (scraped.x_url) scrapedFields.x_url = scraped.x_url;
        if (scraped.website_url) scrapedFields.website_url = scraped.website_url;
        if (scraped.hq_city) scrapedFields.city = scraped.hq_city;
        if (scraped.hq_state) scrapedFields.state = scraped.hq_state;
        if (scraped.hq_country) scrapedFields.country = scraped.hq_country;
        if (scraped.avatar_url) scrapedFields.avatar_url = scraped.avatar_url;
        if (scraped.check_size_min) scrapedFields.check_size_min = scraped.check_size_min;
        if (scraped.check_size_max) scrapedFields.check_size_max = scraped.check_size_max;
        if (scraped.signal_nfx_url) scrapedFields.signal_nfx_url = scraped.signal_nfx_url;
        if (scraped.sectors && scraped.sectors.length > 0) scrapedFields.personal_thesis_tags = scraped.sectors;

        const updates = computeFieldUpdates(inv, scrapedFields, 0.8);
        const patch: Record<string, any> = {};

        for (const u of updates) {
          if (u.autoApply) {
            patch[u.field] = u.newValue;
            stats.fieldsUpdated++;
            stats.fieldsByType[u.field] = (stats.fieldsByType[u.field] || 0) + 1;
            invProvenance.push({
              entity_type: "investor",
              entity_id: inv.id,
              field_name: u.field,
              old_value: u.oldValue != null ? String(u.oldValue) : null,
              new_value: String(u.newValue),
              source_platform: "signal_nfx",
              source_url: scraped.signal_nfx_url || targetUrl,
              confidence_score: u.confidence,
              extraction_method: Object.keys(getCapturedData()).length > 0 ? "graphql_api" : "playwright_dom",
              match_method: inv.signal_nfx_url ? "direct_url" : "search_name",
              reviewer_required: false,
              auto_applied: true,
            });
          } else {
            stats.fieldsQueuedReview++;
          }
        }

        if (Object.keys(patch).length > 0) {
          invBatch.push({ id: inv.id, patch });
          stats.investorsUpdated++;
        }

        if (invBatch.length >= CHECKPOINT_EVERY) {
          await batchUpdateInvestors(supabase, invBatch, config.dryRun);
          await recordProvenance(supabase, invProvenance);
          invBatch.length = 0;
          invProvenance.length = 0;
        }
      } catch (err: any) {
        stats.errors++;
        log(`  Signal ERROR investor ${fullName}: ${err.message}`);
      }
    }

    if (invBatch.length > 0) {
      await batchUpdateInvestors(supabase, invBatch, config.dryRun);
      await recordProvenance(supabase, invProvenance);
    }

  } finally {
    if (browser) await browser.close();
  }

  return stats;
}
