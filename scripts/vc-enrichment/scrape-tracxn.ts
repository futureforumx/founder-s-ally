/**
 * scrape-tracxn.ts — Tracxn Playwright enrichment scraper
 *
 * Authenticates to platform.tracxn.com, searches for each firm/investor,
 * and extracts all available fields from profile pages.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  env, envInt, envBool,
  getSupabase, log, sleep, RateLimiter, retry,
  normalizeName, normalizeNameForMatch, extractDomain, isEmptyOrWeak,
  isStrongNameMatch, tokenOverlap,
  computeFieldUpdates, recordProvenance, queueCandidateValue, recordMatchFailure,
  saveCheckpoint,
  batchUpdateFirms, batchUpdateInvestors,
  emptyStats, evidencePath, ensureDir,
  type SourceStats, type ProvenanceRecord,
} from "./shared.js";

// ── Config ───────────────────────────────────────────────────────────────────

const EMAIL     = env("TRACXN_EMAIL");
const PASSWORD  = env("TRACXN_PASSWORD");
const HEADLESS  = !["false", "0", "no"].includes((env("TRACXN_HEADLESS") || "true").toLowerCase());
const DELAY_MS  = envInt("TRACXN_DELAY_MS", 2000);
const AUTH_FILE = env("TRACXN_AUTH_FILE") || join(process.cwd(), "data", "tracxn-auth.json");
const TRACXN_BASE = "https://platform.tracxn.com";
const CHECKPOINT_EVERY = 25;

// ── Auth ─────────────────────────────────────────────────────────────────────

async function loginToTracxn(page: Page): Promise<void> {
  log("  Logging in to Tracxn...");
  await page.goto(`${TRACXN_BASE}/a/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await sleep(2000);

  // Handle cookie banner
  try {
    const cookieBtn = page.locator('button:has-text("Accept"), button:has-text("Got it")');
    if (await cookieBtn.isVisible({ timeout: 3000 })) await cookieBtn.click();
  } catch { /* no banner */ }

  // Fill email
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  await emailInput.waitFor({ state: "visible", timeout: 20_000 });
  await emailInput.fill(EMAIL);
  await sleep(500);

  // Check if password is visible or need to click continue first
  const pwdVisible = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
  if (!pwdVisible) {
    const cont = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Next")').first();
    if (await cont.isVisible().catch(() => false)) { await cont.click(); await sleep(1500); }
  }

  // Fill password
  const pwdInput = page.locator('input[type="password"]').first();
  await pwdInput.waitFor({ state: "visible", timeout: 20_000 });
  await pwdInput.fill(PASSWORD);
  await sleep(500);

  // Submit
  const submit = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first();
  await submit.click();
  log("  Credentials submitted, waiting for redirect...");

  try {
    await page.waitForURL(u => !u.pathname.includes("/login"), { timeout: 45_000 });
  } catch {
    if (!HEADLESS) {
      log("  Pausing 45s for CAPTCHA/2FA...");
      await sleep(45_000);
    } else {
      throw new Error("Login did not redirect. Try TRACXN_HEADLESS=false for CAPTCHA.");
    }
  }

  if (page.url().includes("/login")) throw new Error("Login failed — still on login page");
  log(`  Logged in at: ${page.url()}`);
}

async function setupBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  let context: BrowserContext;
  if (existsSync(AUTH_FILE)) {
    log(`  Loading saved auth from ${AUTH_FILE}`);
    const state = JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
    context = await browser.newContext({ storageState: state });
  } else {
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
    });
  }

  const page = await context.newPage();

  // Check if auth is still valid
  await page.goto(`${TRACXN_BASE}/a/home`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await sleep(2000);
  if (page.url().includes("/login")) {
    log("  Saved auth expired, performing fresh login...");
    await loginToTracxn(page);
    // Save auth state for future runs
    const state = await context.storageState();
    ensureDir(join(process.cwd(), "data"));
    writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2));
    log(`  Auth saved to ${AUTH_FILE}`);
  } else {
    log("  Auth valid — already logged in");
  }

  return { browser, context, page };
}

// ── Search & Matching ────────────────────────────────────────────────────────

async function searchFirm(page: Page, firmName: string): Promise<string | null> {
  // Use Tracxn's search — navigate to search URL
  const q = encodeURIComponent(firmName);
  await page.goto(`${TRACXN_BASE}/a/search?q=${q}&type=investor`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await sleep(2500);

  // Extract search results
  const results = await page.evaluate(() => {
    const items: Array<{ name: string; url: string; domain: string; location: string }> = [];
    // Tracxn renders search results as cards/rows with links
    const links = document.querySelectorAll('a[href*="/d/investor/"], a[href*="/d/investmentbank/"]');
    for (const link of links) {
      const href = (link as HTMLAnchorElement).href;
      const card = link.closest("[class]") || link.parentElement;
      const text = card?.textContent || link.textContent || "";
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      items.push({
        name: lines[0] || "",
        url: href,
        domain: lines.find(l => l.includes(".") && l.length < 60) || "",
        location: lines.find(l => l.includes(",") || /[A-Z]{2}/.test(l)) || "",
      });
    }
    return items.slice(0, 10);
  });

  if (results.length === 0) return null;

  // Match by name
  const normSearched = normalizeNameForMatch(firmName);
  for (const r of results) {
    if (normalizeNameForMatch(r.name) === normSearched) return r.url;
    if (isStrongNameMatch(firmName, r.name)) return r.url;
  }

  // Fallback: first result if name overlap is decent
  if (results.length > 0 && tokenOverlap(firmName, results[0].name) >= 0.7) {
    return results[0].url;
  }

  return null;
}

// ── Profile extraction ───────────────────────────────────────────────────────

interface TracxnFirmData {
  description?: string;
  tagline?: string;
  hq_city?: string;
  hq_country?: string;
  founded_year?: number;
  investor_type?: string;
  total_investments?: number;
  portfolio_count?: number;
  deals_last_12m?: number;
  sectors?: string[];
  logo_url?: string;
  linkedin_url?: string;
  x_url?: string;
  website_url?: string;
  key_people?: string[];
  team_members?: number;
  portfolio_companies?: string[];
  portfolio_unicorns?: string[];
  tracxn_url?: string;
  email?: string;
}

async function extractFirmProfile(page: Page): Promise<TracxnFirmData> {
  return page.evaluate(() => {
    const d: Record<string, any> = {};
    const body = document.body.innerText || "";

    // Description — look for a paragraph-length text block in the profile
    const descEl = document.querySelector('[class*="description"], [class*="about"], [data-testid*="description"]');
    if (descEl) d.description = descEl.textContent?.trim();
    if (!d.description) {
      // Try finding long text blocks
      const allP = document.querySelectorAll("p, [class*='bio'], [class*='summary']");
      for (const p of allP) {
        const t = p.textContent?.trim();
        if (t && t.length > 80 && t.length < 2000) { d.description = t; break; }
      }
    }

    // Extract labeled key-value pairs from the page
    const kvPairs: Record<string, string> = {};
    const allElements = document.querySelectorAll("span, div, td, li, dt, dd");
    const labels = ["Founded", "Location", "Type", "Headquarters", "Investor Type",
      "Portfolio Companies", "Sectors", "Total Investments", "Email", "Website"];
    for (const el of allElements) {
      const text = el.textContent?.trim() || "";
      for (const label of labels) {
        if (text.startsWith(label) && text.length < 200) {
          const val = text.slice(label.length).replace(/^[:\s]+/, "").trim();
          if (val && val.length > 0) kvPairs[label] = val;
        }
      }
    }

    if (kvPairs["Founded"]) {
      const yr = parseInt(kvPairs["Founded"], 10);
      if (yr > 1900 && yr < 2030) d.founded_year = yr;
    }
    if (kvPairs["Location"] || kvPairs["Headquarters"]) {
      const loc = kvPairs["Location"] || kvPairs["Headquarters"];
      const parts = loc.split(",").map(s => s.trim());
      if (parts.length >= 1) d.hq_city = parts[0];
      if (parts.length >= 2) d.hq_country = parts[parts.length - 1];
    }
    if (kvPairs["Investor Type"] || kvPairs["Type"]) d.investor_type = kvPairs["Investor Type"] || kvPairs["Type"];
    if (kvPairs["Website"]) d.website_url = kvPairs["Website"];
    if (kvPairs["Email"]) d.email = kvPairs["Email"];

    // Investment count from body text
    const invMatch = body.match(/(\d[\d,]*)\s*(?:Funding Rounds|Investments|Total Investments)/i);
    if (invMatch) d.total_investments = parseInt(invMatch[1].replace(/,/g, ""), 10);

    // Portfolio count
    const portMatch = body.match(/(\d[\d,]*)\s*Portfolio Companies/i);
    if (portMatch) d.portfolio_count = parseInt(portMatch[1].replace(/,/g, ""), 10);

    // Deals in last 12 months
    const recentMatch = body.match(/(\d+)\s*(?:deals? (?:in|last) (?:12|twelve) months?|Deals in Last 12 Months)/i);
    if (recentMatch) d.deals_last_12m = parseInt(recentMatch[1], 10);

    // Team members count
    const teamMatch = body.match(/(\d+)\s*Team Members/i);
    if (teamMatch) d.team_members = parseInt(teamMatch[1], 10);

    // Logo
    const logoImg = document.querySelector('img[src*="tracxn.com/logo"], img[class*="logo"]');
    if (logoImg) d.logo_url = (logoImg as HTMLImageElement).src;

    // Social links
    const links = document.querySelectorAll("a[href]");
    for (const a of links) {
      const h = (a as HTMLAnchorElement).href;
      if (h.includes("linkedin.com/company")) d.linkedin_url = h;
      if (h.includes("twitter.com/") || (h.includes("x.com/") && !h.includes("tracxn"))) d.x_url = h;
    }

    // Sectors from sector tags/chips
    const sectorEls = document.querySelectorAll('[class*="sector"], [class*="tag"], [class*="chip"]');
    const sectors: string[] = [];
    for (const el of sectorEls) {
      const t = el.textContent?.trim();
      if (t && t.length > 2 && t.length < 50 && !t.includes("http")) sectors.push(t);
    }
    if (sectors.length > 0) d.sectors = [...new Set(sectors)];

    // Key people
    const personEls = document.querySelectorAll('[class*="person"], [class*="team-member"], [class*="partner"]');
    const people: string[] = [];
    for (const el of personEls) {
      const name = el.querySelector("a, [class*='name']")?.textContent?.trim();
      if (name && name.length > 2 && name.length < 60) people.push(name);
    }
    if (people.length > 0) d.key_people = [...new Set(people)];

    // Portfolio companies (notable)
    const portEls = document.querySelectorAll('a[href*="/d/company/"]');
    const portfolio: string[] = [];
    for (const el of portEls) {
      const name = el.textContent?.trim();
      if (name && name.length > 1 && name.length < 60) portfolio.push(name);
    }
    if (portfolio.length > 0) d.portfolio_companies = [...new Set(portfolio)].slice(0, 20);

    d.tracxn_url = window.location.href;
    return d;
  });
}

// ── Investor profile extraction ──────────────────────────────────────────────

interface TracxnInvestorData {
  title?: string;
  bio?: string;
  linkedin_url?: string;
  x_url?: string;
  location?: string;
  city?: string;
  country?: string;
  avatar_url?: string;
  sectors?: string[];
  notable_investments?: string[];
  tracxn_url?: string;
}

async function searchInvestor(page: Page, name: string, firmName?: string): Promise<string | null> {
  const q = encodeURIComponent(firmName ? `${name} ${firmName}` : name);
  await page.goto(`${TRACXN_BASE}/a/search?q=${q}&type=people`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await sleep(2500);

  const results = await page.evaluate(() => {
    const items: Array<{ name: string; url: string }> = [];
    const links = document.querySelectorAll('a[href*="/d/people/"], a[href*="/person/"]');
    for (const link of links) {
      items.push({
        name: link.textContent?.trim() || "",
        url: (link as HTMLAnchorElement).href,
      });
    }
    return items.slice(0, 5);
  });

  if (results.length === 0) return null;

  const searchedNorm = normalizeNameForMatch(name);
  for (const r of results) {
    if (normalizeNameForMatch(r.name) === searchedNorm) return r.url;
    if (isStrongNameMatch(name, r.name)) return r.url;
  }

  return results.length > 0 && tokenOverlap(name, results[0].name) >= 0.8 ? results[0].url : null;
}

async function extractInvestorProfile(page: Page): Promise<TracxnInvestorData> {
  return page.evaluate(() => {
    const d: Record<string, any> = {};
    const body = document.body.innerText || "";

    // Bio
    const bioEl = document.querySelector('[class*="bio"], [class*="about"], [class*="description"]');
    if (bioEl) {
      const t = bioEl.textContent?.trim();
      if (t && t.length > 20) d.bio = t;
    }

    // Title from nearby text
    const headings = document.querySelectorAll("h1, h2, h3");
    for (const h of headings) {
      const sib = h.nextElementSibling;
      if (sib) {
        const t = sib.textContent?.trim();
        if (t && t.length < 100 && (t.includes("Partner") || t.includes("Director") ||
            t.includes("Principal") || t.includes("Associate") || t.includes("Managing") ||
            t.includes("Founder") || t.includes("CEO"))) {
          d.title = t;
          break;
        }
      }
    }

    // Links
    const links = document.querySelectorAll("a[href]");
    for (const a of links) {
      const h = (a as HTMLAnchorElement).href;
      if (h.includes("linkedin.com/in/")) d.linkedin_url = h;
      if (h.includes("twitter.com/") || (h.includes("x.com/") && !h.includes("tracxn"))) d.x_url = h;
    }

    // Avatar
    const avatar = document.querySelector('img[class*="avatar"], img[class*="profile"], img[class*="photo"]');
    if (avatar) {
      const src = (avatar as HTMLImageElement).src;
      if (src && !src.includes("placeholder") && !src.includes("default")) d.avatar_url = src;
    }

    // Location
    const locMatch = body.match(/([\w\s]+,\s*[\w\s]+(?:,\s*[\w\s]+)?)\s*(?:\n|$)/);
    if (locMatch) {
      d.location = locMatch[1].trim();
      const parts = d.location.split(",").map((s: string) => s.trim());
      if (parts.length >= 1) d.city = parts[0];
      if (parts.length >= 2) d.country = parts[parts.length - 1];
    }

    d.tracxn_url = window.location.href;
    return d;
  });
}

// ── Main scraper function ────────────────────────────────────────────────────

export async function runTracxnScraper(config: {
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

  if (!EMAIL || !PASSWORD) {
    log("  TRACXN_EMAIL/TRACXN_PASSWORD not set — skipping");
    return stats;
  }

  let browser: Browser | null = null;
  try {
    const setup = await setupBrowser();
    browser = setup.browser;
    const { page } = setup;

    // ── Firms ──────────────────────────────────────────────────────────────

    const firms = config.firmRecords.slice(0, config.maxFirms || 999_999);
    log(`\n  Tracxn: processing ${firms.length} firms...`);

    const firmBatch: Array<{ id: string; patch: Record<string, any> }> = [];
    const firmProvenance: ProvenanceRecord[] = [];

    for (let i = 0; i < firms.length; i++) {
      const firm = firms[i];
      stats.firmsSearched++;

      try {
        await limiter.wait();
        log(`  [${i + 1}/${firms.length}] Searching Tracxn for: ${firm.firm_name}`);

        // Check if we already have a tracxn_url
        let profileUrl = firm.tracxn_url || null;
        if (!profileUrl) {
          profileUrl = await searchFirm(page, firm.firm_name);
        }

        if (!profileUrl) {
          stats.firmsNotFound++;
          await recordMatchFailure(supabase, {
            run_id: config.runId,
            entity_type: "firm",
            entity_id: firm.id,
            entity_name: firm.firm_name,
            source_platform: "tracxn",
            failure_reason: "no_search_results",
            search_query: firm.firm_name,
          });
          continue;
        }

        // Navigate to profile
        await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await sleep(2000);

        const scraped = await extractFirmProfile(page);
        stats.firmsMatched++;

        // Map scraped fields to firm_records columns
        const scrapedFields: Record<string, any> = {};
        if (scraped.description) scrapedFields.description = scraped.description;
        if (scraped.tagline) scrapedFields.tagline = scraped.tagline;
        if (scraped.hq_city) scrapedFields.hq_city = scraped.hq_city;
        if (scraped.hq_country) scrapedFields.hq_country = scraped.hq_country;
        if (scraped.founded_year) scrapedFields.founded_year = scraped.founded_year;
        if (scraped.investor_type) scrapedFields.firm_type = scraped.investor_type;
        if (scraped.total_investments) scrapedFields.total_investments = scraped.total_investments;
        if (scraped.deals_last_12m) scrapedFields.deals_last_12m = scraped.deals_last_12m;
        if (scraped.sectors && scraped.sectors.length > 0) scrapedFields.thesis_verticals = scraped.sectors;
        if (scraped.logo_url) scrapedFields.logo_url = scraped.logo_url;
        if (scraped.linkedin_url) scrapedFields.linkedin_url = scraped.linkedin_url;
        if (scraped.x_url) scrapedFields.x_url = scraped.x_url;
        if (scraped.website_url) scrapedFields.website_url = scraped.website_url;
        if (scraped.team_members) scrapedFields.total_headcount = scraped.team_members;
        if (scraped.tracxn_url) scrapedFields.tracxn_url = scraped.tracxn_url;

        // Compute merge
        const updates = computeFieldUpdates(firm, scrapedFields, 0.75);
        if (updates.length === 0) continue;

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
              source_platform: "tracxn",
              source_url: scraped.tracxn_url || profileUrl,
              confidence_score: u.confidence,
              extraction_method: "playwright_dom",
              match_method: firm.tracxn_url ? "direct_url" : "search_name",
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
              source_platform: "tracxn",
              source_url: scraped.tracxn_url || profileUrl,
              confidence_score: u.confidence,
              reason: u.reviewRequired ? "medium_confidence_field" : "ambiguous_value",
            });
          }
        }

        if (Object.keys(patch).length > 0) {
          firmBatch.push({ id: firm.id, patch });
          stats.firmsUpdated++;
        }

        // Flush batch + provenance every CHECKPOINT_EVERY
        if (firmBatch.length >= CHECKPOINT_EVERY) {
          const { success, failed } = await batchUpdateFirms(supabase, firmBatch, config.dryRun);
          await recordProvenance(supabase, firmProvenance);
          log(`  Checkpoint: ${success} firms updated, ${failed} failed`);
          firmBatch.length = 0;
          firmProvenance.length = 0;
          await saveCheckpoint(supabase, {
            run_id: config.runId,
            source_platform: "tracxn",
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
        log(`  ERROR processing firm ${firm.firm_name}: ${err.message}`);
        // Save screenshot on error
        try {
          const ssPath = evidencePath(config.runId, "tracxn", firm.id, "png");
          await page.screenshot({ path: ssPath, fullPage: false });
        } catch { /* ignore screenshot failure */ }
      }
    }

    // Flush remaining firm batch
    if (firmBatch.length > 0) {
      await batchUpdateFirms(supabase, firmBatch, config.dryRun);
      await recordProvenance(supabase, firmProvenance);
    }

    // ── Investors ──────────────────────────────────────────────────────────

    const investors = config.investorRecords.slice(0, config.maxInvestors || 999_999);
    log(`\n  Tracxn: processing ${investors.length} investors...`);

    const invBatch: Array<{ id: string; patch: Record<string, any> }> = [];
    const invProvenance: ProvenanceRecord[] = [];

    for (let i = 0; i < investors.length; i++) {
      const inv = investors[i];
      stats.investorsSearched++;
      const fullName = `${inv.first_name || ""} ${inv.last_name || ""}`.trim();

      try {
        await limiter.wait();
        log(`  [${i + 1}/${investors.length}] Searching Tracxn for investor: ${fullName}`);

        let profileUrl = inv.tracxn_url || null;
        if (!profileUrl) {
          profileUrl = await searchInvestor(page, fullName, inv.firm_name);
        }

        if (!profileUrl) {
          stats.investorsNotFound++;
          continue;
        }

        await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await sleep(2000);

        const scraped = await extractInvestorProfile(page);
        stats.investorsMatched++;

        const scrapedFields: Record<string, any> = {};
        if (scraped.title) scrapedFields.title = scraped.title;
        if (scraped.bio) scrapedFields.bio = scraped.bio;
        if (scraped.linkedin_url) scrapedFields.linkedin_url = scraped.linkedin_url;
        if (scraped.x_url) scrapedFields.x_url = scraped.x_url;
        if (scraped.city) scrapedFields.city = scraped.city;
        if (scraped.country) scrapedFields.country = scraped.country;
        if (scraped.avatar_url) scrapedFields.avatar_url = scraped.avatar_url;
        if (scraped.tracxn_url) scrapedFields.tracxn_url = scraped.tracxn_url;

        const updates = computeFieldUpdates(inv, scrapedFields, 0.7);
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
              source_platform: "tracxn",
              source_url: scraped.tracxn_url || profileUrl,
              confidence_score: u.confidence,
              extraction_method: "playwright_dom",
              match_method: inv.tracxn_url ? "direct_url" : "search_name",
              reviewer_required: false,
              auto_applied: true,
            });
          } else {
            stats.fieldsQueuedReview++;
            await queueCandidateValue(supabase, {
              entity_type: "investor",
              entity_id: inv.id,
              field_name: u.field,
              candidate_value: String(u.newValue),
              current_value: u.oldValue != null ? String(u.oldValue) : null,
              source_platform: "tracxn",
              source_url: scraped.tracxn_url || profileUrl,
              confidence_score: u.confidence,
              reason: "medium_confidence_field",
            });
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
        log(`  ERROR processing investor ${fullName}: ${err.message}`);
      }
    }

    // Flush remaining
    if (invBatch.length > 0) {
      await batchUpdateInvestors(supabase, invBatch, config.dryRun);
      await recordProvenance(supabase, invProvenance);
    }

  } finally {
    if (browser) await browser.close();
  }

  return stats;
}
