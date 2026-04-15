/**
 * scrape-cb-insights.ts — CB Insights Playwright enrichment scraper
 *
 * Authenticates to app.cbinsights.com, searches for each firm/investor,
 * and extracts all available fields from profile pages.
 *
 * Based on the existing scraper at scripts/cb-insights-scraper/scraper.mjs
 * but refactored into a clean module for the orchestrated pipeline.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
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

const CBI_EMAIL  = env("CBI_EMAIL");
const CBI_PWD    = env("CBI_PASSWORD");
const HEADLESS   = !["false", "0", "no"].includes((env("CBI_HEADLESS") || "true").toLowerCase());
const DELAY_MS   = envInt("CBI_DELAY_MS", 3000);
const AUTH_FILE  = env("CBI_AUTH_FILE") || join(process.cwd(), "data", "cbi-auth.json");
const CBI_APP    = "https://app.cbinsights.com";
const CHECKPOINT_EVERY = 25;

// ── Domain matching from dropdown line (ported from existing scraper) ────────

function parseDomainsFromLine(line: string): string[] {
  if (!line || typeof line !== "string") return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /[a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const host = m[0].toLowerCase().replace(/^www\./, "");
    if (!seen.has(host)) { seen.add(host); out.push(host); }
  }
  return out;
}

function domainMatchesTarget(resultLine: string, targetDomain: string | null): boolean {
  if (!targetDomain) return false;
  const t = targetDomain.toLowerCase().replace(/^www\./, "");
  const candidates = parseDomainsFromLine(resultLine);
  for (const c of candidates) {
    if (c === t || c.endsWith(`.${t}`) || t.endsWith(`.${c}`)) return true;
    if (c.split(".")[0] === t.split(".")[0]) return true;
  }
  return false;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

async function loginToCBI(page: Page): Promise<void> {
  log("  Logging in to CB Insights...");
  await page.goto(`${CBI_APP}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await sleep(3000);

  const url = page.url();
  if (url.includes("app.cbinsights.com") && !url.includes("login")) {
    log("  Already authenticated");
    return;
  }

  // Cookie banner
  try {
    const btn = page.locator('button:has-text("Accept"), button:has-text("Got it"), button:has-text("OK")');
    if (await btn.isVisible({ timeout: 3000 })) await btn.click();
  } catch { /* no banner */ }

  // Email
  const emailInput = page.locator(
    'input[name="email"]:visible, input[type="email"]:visible, input[placeholder*="email" i]:visible, input[name="username"]:visible'
  ).first();
  await emailInput.waitFor({ state: "visible", timeout: 20_000 });
  await emailInput.fill(CBI_EMAIL);
  await sleep(500);

  // Maybe 2-step: email → continue → password
  const pwdNow = await page.locator('input[type="password"]:visible').first().isVisible().catch(() => false);
  if (!pwdNow) {
    const cont = page.locator('button:has-text("Continue"):visible, button[type="submit"]:visible').first();
    if (await cont.isVisible().catch(() => false)) { await cont.click(); await sleep(800); }
  }

  // Password
  const pwdInput = page.locator('input[type="password"]:visible').first();
  await pwdInput.waitFor({ state: "visible", timeout: 20_000 });
  await pwdInput.fill(CBI_PWD);
  await sleep(500);

  // Submit
  const submit = page.locator(
    'button[type="submit"]:visible, button:has-text("Log in"):visible, button:has-text("Sign in"):visible, button:has-text("Continue"):visible'
  ).first();
  await submit.click();
  log("  Credentials submitted...");

  try {
    await page.waitForURL(u => !u.pathname.includes("/login"), { timeout: 45_000 });
  } catch {
    if (!HEADLESS) {
      log("  Pausing 45s for CAPTCHA/2FA...");
      await sleep(45_000);
    } else {
      throw new Error("Login stuck. Try CBI_HEADLESS=false for CAPTCHA.");
    }
  }

  if (page.url().includes("/login")) throw new Error("CBI login failed");
  log(`  Logged in at: ${page.url()}`);
}

async function setupBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  let context: BrowserContext;
  if (existsSync(AUTH_FILE)) {
    log(`  Loading saved CBI auth from ${AUTH_FILE}`);
    const state = JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
    context = await browser.newContext({ storageState: state });
  } else {
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
    });
  }

  const page = await context.newPage();

  await page.goto(`${CBI_APP}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await sleep(2000);

  if (page.url().includes("/login") || !page.url().includes("cbinsights.com")) {
    await loginToCBI(page);
    const state = await context.storageState();
    ensureDir(join(process.cwd(), "data"));
    writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2));
    log(`  Auth saved to ${AUTH_FILE}`);
  } else {
    log("  CBI auth valid");
  }

  return { browser, context, page };
}

async function ensureOnApp(page: Page): Promise<void> {
  const url = page.url();
  if (url.includes("app.cbinsights.com") && !url.includes("/login") && !url.includes("/error")) return;
  await page.goto(`${CBI_APP}/chat-cbi`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await sleep(3000);
  if (page.url().includes("/login")) throw new Error("CBI session expired");
}

// ── Search ───────────────────────────────────────────────────────────────────

interface DropdownResult { name: string; domain: string; location: string; index: number }

async function searchFirm(page: Page, firmName: string, targetDomain: string | null): Promise<{ profileUrl: string; data: DropdownResult } | null> {
  await ensureOnApp(page);

  const searchBox = page.locator('input[type="text"]').first();
  await searchBox.click();
  await sleep(300);
  await searchBox.fill("");
  await sleep(200);
  await searchBox.fill(firmName);
  await sleep(2500);

  const results: DropdownResult[] = await page.evaluate(() => {
    const items: any[] = [];
    const opts = document.querySelectorAll('[data-testid="company-option"], [data-sugg-type="Organization"]');
    for (const opt of opts) {
      const text = opt.textContent || "";
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      items.push({ name: lines[0] || "", domain: lines[1] || "", location: lines[2] || "", index: items.length });
    }
    return items;
  });

  if (results.length === 0) {
    await page.keyboard.press("Escape");
    await sleep(300);
    return null;
  }

  // Match by domain first
  let matchIdx = -1;
  if (targetDomain) {
    matchIdx = results.findIndex(r => domainMatchesTarget(r.domain, targetDomain));
  }

  // Then by name
  if (matchIdx === -1) {
    matchIdx = results.findIndex(r => isStrongNameMatch(firmName, r.name));
  }

  // Then simple compressed match
  if (matchIdx === -1) {
    const clean = normalizeNameForMatch(firmName);
    matchIdx = results.findIndex(r => normalizeNameForMatch(r.name) === clean);
  }

  if (matchIdx === -1) {
    await page.keyboard.press("Escape");
    await sleep(300);
    return null;
  }

  const match = results[matchIdx];
  log(`    Matched: ${match.name} (${match.domain})`);

  // Click matched result
  const options = page.locator('[data-testid="company-option"], [data-sugg-type="Organization"]');
  try {
    await options.nth(matchIdx).click();
    await page.waitForURL(u => u.pathname.includes("/profiles/"), { timeout: 12_000 });
    await sleep(2500);
    return { profileUrl: page.url(), data: match };
  } catch {
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(500);
    return null;
  }
}

// ── Profile extraction ───────────────────────────────────────────────────────

interface CBIFirmData {
  description?: string;
  hq_city?: string;
  hq_state?: string;
  hq_country?: string;
  founded_year?: number;
  investor_type?: string;
  status?: string;
  aum?: string;
  total_headcount?: number;
  industries?: string[];
  linkedin_url?: string;
  x_url?: string;
  facebook_url?: string;
  crunchbase_url?: string;
  substack_url?: string;
  medium_url?: string;
  email?: string;
  website_url?: string;
  total_investments?: number;
  total_exits?: number;
  avg_deal_size?: string;
  deals_last_12m?: number;
  people?: Array<{ name: string; title: string | null }>;
  themes?: string[];
  logo_url?: string;
  cb_insights_url?: string;
}

async function extractCBIProfile(page: Page): Promise<CBIFirmData> {
  return page.evaluate(() => {
    const d: Record<string, any> = {};
    const body = document.body.innerText || "";

    // Description — About section
    const aboutEl = [...document.querySelectorAll("*")].find(
      el => el.textContent?.trim() === "About" && el.children.length === 0
    );
    if (aboutEl) {
      const parent = aboutEl.closest("div")?.parentElement;
      if (parent) {
        for (const child of parent.querySelectorAll("*")) {
          const t = child.textContent?.trim();
          if (t && t.length > 80 && t !== "About" && !t.startsWith("Website")) {
            d.description = t;
            break;
          }
        }
      }
    }

    // Labeled fields
    const fields: Record<string, string> = {};
    const items = document.querySelectorAll("li, [role='listitem']");
    const labels = [
      "Website", "Status", "Investor Type", "Founded Year",
      "Headquarters", "Revenue", "AUM", "Assets Under Management",
      "Employees", "Team Size", "Industries", "Business Model", "Phone", "Email"
    ];
    for (const item of items) {
      const text = item.textContent?.trim() || "";
      for (const label of labels) {
        if (text.startsWith(label)) {
          fields[label] = text.slice(label.length).trim();
          break;
        }
      }
    }

    if (fields["Founded Year"]) {
      const yr = parseInt(fields["Founded Year"], 10);
      if (yr > 1900 && yr < 2030) d.founded_year = yr;
    }
    if (fields["Investor Type"]) d.investor_type = fields["Investor Type"];
    if (fields["Status"]) d.status = fields["Status"];
    if (fields["AUM"] || fields["Assets Under Management"]) d.aum = fields["AUM"] || fields["Assets Under Management"];
    if (fields["Employees"] || fields["Team Size"]) {
      const h = parseInt((fields["Employees"] || fields["Team Size"]).replace(/[^\d]/g, ""), 10);
      if (h > 0) d.total_headcount = h;
    }
    if (fields["Industries"]) d.industries = fields["Industries"].split(",").map((s: string) => s.trim()).filter(Boolean);
    if (fields["Website"]) d.website_url = fields["Website"];
    if (fields["Email"]) d.email = fields["Email"];

    // Header location
    const headings = document.querySelectorAll("h1, h2");
    for (const h of headings) {
      const sib = h.nextElementSibling;
      if (sib) {
        const t = sib.textContent?.trim();
        if (t && t.includes(",") && !t.includes("Finance") && !t.includes("http") && t.length < 100) {
          const parts = t.split(",").map((s: string) => s.trim());
          if (parts.length >= 2) {
            d.hq_city = parts[0];
            d.hq_state = parts.length >= 3 ? parts[1] : undefined;
            d.hq_country = parts[parts.length - 1];
          }
          break;
        }
      }
    }

    // Headquarters field (more detailed)
    if (fields["Headquarters"]) {
      const hq = fields["Headquarters"];
      const parts = hq.split(",").map((s: string) => s.trim());
      if (parts.length >= 1 && !d.hq_city) d.hq_city = parts[0];
      if (parts.length >= 3 && !d.hq_state) d.hq_state = parts[1];
      if (parts.length >= 2 && !d.hq_country) d.hq_country = parts[parts.length - 1];
    }

    // Social links + email
    const socials: Record<string, string> = {};
    document.querySelectorAll("a[href]").forEach(a => {
      const h = (a as HTMLAnchorElement).href;
      if (h.includes("linkedin.com/company")) socials.linkedin_url = h;
      else if (h.includes("linkedin.com") && !socials.linkedin_url) socials.linkedin_url = h;
      if (h.includes("twitter.com") || (h.includes("x.com") && !h.includes("cbinsights"))) socials.x_url = h;
      if (h.includes("facebook.com")) socials.facebook_url = h;
      if (h.includes("crunchbase.com")) socials.crunchbase_url = h;
      if (h.includes("substack.com")) socials.substack_url = h;
      if (h.includes("medium.com")) socials.medium_url = h;
      if (h.startsWith("mailto:")) socials.email = h.replace("mailto:", "");
    });
    Object.assign(d, socials);

    // Investment stats
    const avgMatch = body.match(/\$([\d,.]+[MBK]?)\s*\n?\s*Average deal size/i);
    if (avgMatch) d.avg_deal_size = "$" + avgMatch[1];

    const invMatch = body.match(/(\d[\d,]*)\s*\n\s*Investments/);
    if (invMatch) d.total_investments = parseInt(invMatch[1].replace(/,/g, ""), 10);

    const exitMatch = body.match(/(\d[\d,]*)\s*\n\s*Exits/);
    if (exitMatch) d.total_exits = parseInt(exitMatch[1].replace(/,/g, ""), 10);

    const newDeals = body.match(/(\d+)\s+new deals since/i);
    if (newDeals) d.deals_last_12m = parseInt(newDeals[1], 10);

    // People / partners
    const people: Array<{ name: string; title: string | null }> = [];
    const personLinks = document.querySelectorAll('a[href*="/profiles/p/"]');
    const seenNames = new Set<string>();
    for (const link of personLinks) {
      const name = link.textContent?.trim()?.replace(/\s+/g, " ");
      if (!name || name.length < 2 || seenNames.has(name)) continue;
      seenNames.add(name);
      let title: string | null = null;
      let container = link.parentElement;
      for (let i = 0; i < 5 && container; i++) {
        const innerText = container.textContent || "";
        const lines = innerText.split("\n").map(l => l.trim()).filter(l => l.length > 2);
        const titleLine = lines.find(l =>
          l !== name && (l.includes("Partner") || l.includes("Director") || l.includes("Managing") ||
            l.includes("President") || l.includes("Officer") || l.includes("Founder") || l.includes("CEO"))
        );
        if (titleLine) { title = titleLine; break; }
        container = container.parentElement;
      }
      people.push({ name, title });
    }
    if (people.length > 0) d.people = people;

    // Themes
    const themeSection = body.match(/Key themes?[\s:]*\n([\s\S]{10,300}?)(?:\n\n|\nInvestments|\nPortfolio)/i);
    if (themeSection) {
      d.themes = themeSection[1].split("\n").map((s: string) => s.trim()).filter((s: string) => s.length > 2 && s.length < 50);
    }

    // Logo
    const logoImg = document.querySelector('img[src*="logo"], img[class*="logo"]');
    if (logoImg) {
      const src = (logoImg as HTMLImageElement).src;
      if (src && !src.includes("cbinsights.com/rsc") && src.length > 10) d.logo_url = src;
    }

    d.cb_insights_url = window.location.href;
    return d;
  });
}

// ── Investor profile extraction ──────────────────────────────────────────────

async function searchPersonAndNavigate(page: Page, personName: string): Promise<string | null> {
  await ensureOnApp(page);

  const searchBox = page.locator('input[type="text"]').first();
  await searchBox.click();
  await sleep(300);
  await searchBox.fill("");
  await sleep(200);
  await searchBox.fill(personName);
  await sleep(2500);

  const personOption = page.locator('[data-testid="person-option"], [data-sugg-type="Person"]').first();
  try {
    await personOption.waitFor({ state: "visible", timeout: 5000 });
    await personOption.click();
    await page.waitForURL(u => u.pathname.includes("/profiles/p/"), { timeout: 10_000 });
    await sleep(2000);
    return page.url();
  } catch {
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(300);
    return null;
  }
}

async function extractCBIInvestorProfile(page: Page): Promise<Record<string, any>> {
  return page.evaluate(() => {
    const d: Record<string, any> = {};

    // Title
    const headings = document.querySelectorAll("h1, h2");
    for (const h of headings) {
      const sib = h.nextElementSibling;
      if (sib) {
        const t = sib.textContent?.trim();
        if (t && t.length < 100 && (t.includes("Partner") || t.includes("Director") ||
            t.includes("Managing") || t.includes("CEO") || t.includes("VP"))) {
          d.title = t;
          break;
        }
      }
    }

    // Bio
    const aboutEl = [...document.querySelectorAll("*")].find(
      el => el.textContent?.trim() === "About" && el.children.length === 0
    );
    if (aboutEl) {
      const parent = aboutEl.closest("div")?.parentElement;
      if (parent) {
        for (const child of parent.querySelectorAll("*")) {
          const t = child.textContent?.trim();
          if (t && t.length > 50 && t !== "About") { d.bio = t; break; }
        }
      }
    }

    // Location
    for (const h of headings) {
      const sib = h.nextElementSibling?.nextElementSibling;
      if (sib) {
        const t = sib.textContent?.trim();
        if (t && t.includes(",") && t.length < 80 && !t.includes("http")) {
          const parts = t.split(",").map((s: string) => s.trim());
          d.city = parts[0];
          d.country = parts[parts.length - 1];
          break;
        }
      }
    }

    // Links
    document.querySelectorAll("a[href]").forEach(a => {
      const h = (a as HTMLAnchorElement).href;
      if (h.includes("linkedin.com/in/")) d.linkedin_url = h;
      if (h.includes("twitter.com/") || (h.includes("x.com/") && !h.includes("cbinsights"))) d.x_url = h;
    });

    // Avatar
    const avatar = document.querySelector('img[class*="avatar"], img[class*="profile"]');
    if (avatar) {
      const src = (avatar as HTMLImageElement).src;
      if (src && !src.includes("placeholder")) d.avatar_url = src;
    }

    d.cb_insights_url = window.location.href;
    return d;
  });
}

// ── Main scraper function ────────────────────────────────────────────────────

export async function runCBInsightsScraper(config: {
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

  if (!CBI_EMAIL || !CBI_PWD) {
    log("  CBI_EMAIL or CBI_PASSWORD not set — skipping CB Insights");
    return stats;
  }

  let browser: Browser | null = null;
  try {
    const setup = await setupBrowser();
    browser = setup.browser;
    const { page } = setup;

    // ── Firms ──────────────────────────────────────────────────────────────

    const firms = config.firmRecords.slice(0, config.maxFirms || 999_999);
    log(`\n  CB Insights: processing ${firms.length} firms...`);

    const firmBatch: Array<{ id: string; patch: Record<string, any> }> = [];
    const firmProvenance: ProvenanceRecord[] = [];

    for (let i = 0; i < firms.length; i++) {
      const firm = firms[i];
      stats.firmsSearched++;

      try {
        await limiter.wait();
        log(`  [${i + 1}/${firms.length}] CBI search: ${firm.firm_name}`);

        // If we already have a cb_insights_url, navigate directly
        let profileUrl: string | null = null;
        let dropdownData: DropdownResult | null = null;

        if (firm.cb_insights_url && firm.cb_insights_url.includes("/profiles/")) {
          await page.goto(firm.cb_insights_url, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await sleep(2500);
          profileUrl = page.url();
        } else {
          const targetDomain = extractDomain(firm.website_url);
          const result = await searchFirm(page, firm.firm_name, targetDomain);
          if (result) {
            profileUrl = result.profileUrl;
            dropdownData = result.data;
          }
        }

        if (!profileUrl) {
          stats.firmsNotFound++;
          await recordMatchFailure(supabase, {
            run_id: config.runId,
            entity_type: "firm",
            entity_id: firm.id,
            entity_name: firm.firm_name,
            source_platform: "cb_insights",
            failure_reason: "no_match_in_dropdown",
            search_query: firm.firm_name,
          });
          continue;
        }

        const scraped = await extractCBIProfile(page);
        stats.firmsMatched++;

        // Map to firm_records columns
        const scrapedFields: Record<string, any> = {};
        if (scraped.description) scrapedFields.description = scraped.description;
        if (scraped.website_url) scrapedFields.website_url = scraped.website_url;
        if (scraped.hq_city) scrapedFields.hq_city = scraped.hq_city;
        if (scraped.hq_state) scrapedFields.hq_state = scraped.hq_state;
        if (scraped.hq_country) scrapedFields.hq_country = scraped.hq_country;
        if (scraped.founded_year) scrapedFields.founded_year = scraped.founded_year;
        if (scraped.investor_type) scrapedFields.firm_type = scraped.investor_type;
        if (scraped.status) scrapedFields.status = scraped.status;
        if (scraped.aum) scrapedFields.aum = scraped.aum;
        if (scraped.total_headcount) scrapedFields.total_headcount = scraped.total_headcount;
        if (scraped.total_investments) scrapedFields.total_investments = scraped.total_investments;
        if (scraped.total_exits) scrapedFields.total_exits = scraped.total_exits;
        if (scraped.avg_deal_size) scrapedFields.avg_deal_size = scraped.avg_deal_size;
        if (scraped.deals_last_12m) scrapedFields.deals_last_12m = scraped.deals_last_12m;
        if (scraped.linkedin_url) scrapedFields.linkedin_url = scraped.linkedin_url;
        if (scraped.x_url) scrapedFields.x_url = scraped.x_url;
        if (scraped.facebook_url) scrapedFields.facebook_url = scraped.facebook_url;
        if (scraped.crunchbase_url) scrapedFields.crunchbase_url = scraped.crunchbase_url;
        if (scraped.substack_url) scrapedFields.substack_url = scraped.substack_url;
        if (scraped.medium_url) scrapedFields.medium_url = scraped.medium_url;
        if (scraped.logo_url) scrapedFields.logo_url = scraped.logo_url;
        if (scraped.cb_insights_url) scrapedFields.cb_insights_url = scraped.cb_insights_url;
        if (scraped.industries && scraped.industries.length > 0) scrapedFields.thesis_verticals = scraped.industries;
        if (scraped.themes && scraped.themes.length > 0) scrapedFields.investment_themes = scraped.themes;
        if (scraped.people && scraped.people.length > 0) {
          scrapedFields.current_partners = scraped.people.map((p: any) => p.name);
        }

        // Email — only if clearly public
        if (scraped.email && scraped.email.includes("@") && !scraped.email.includes("cbinsights")) {
          scrapedFields.email = scraped.email;
        }

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
              source_platform: "cb_insights",
              source_url: scraped.cb_insights_url || profileUrl,
              confidence_score: u.confidence,
              extraction_method: "playwright_dom",
              match_method: firm.cb_insights_url ? "direct_url" : "search_dropdown",
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
              source_platform: "cb_insights",
              source_url: scraped.cb_insights_url || profileUrl,
              confidence_score: u.confidence,
              reason: u.reviewRequired ? "medium_confidence_field" : "ambiguous_value",
            });
          }
        }

        if (Object.keys(patch).length > 0) {
          firmBatch.push({ id: firm.id, patch });
          stats.firmsUpdated++;
        }

        // Flush
        if (firmBatch.length >= CHECKPOINT_EVERY) {
          const r = await batchUpdateFirms(supabase, firmBatch, config.dryRun);
          await recordProvenance(supabase, firmProvenance);
          log(`  CBI checkpoint: ${r.success} firms updated, ${r.failed} failed`);
          firmBatch.length = 0;
          firmProvenance.length = 0;
          await saveCheckpoint(supabase, {
            run_id: config.runId,
            source_platform: "cb_insights",
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
        log(`  CBI ERROR firm ${firm.firm_name}: ${err.message}`);
        try {
          const ssPath = evidencePath(config.runId, "cb_insights", firm.id, "png");
          await page.screenshot({ path: ssPath, fullPage: false });
        } catch { /* ignore */ }

        // Check for session expiry
        if (err.message.includes("session expired") || page.url().includes("/login")) {
          log("  Session expired — re-authenticating...");
          try { await loginToCBI(page); } catch { log("  Re-auth failed, continuing..."); }
        }
      }
    }

    // Flush remaining firms
    if (firmBatch.length > 0) {
      await batchUpdateFirms(supabase, firmBatch, config.dryRun);
      await recordProvenance(supabase, firmProvenance);
    }

    // ── Investors ──────────────────────────────────────────────────────────

    const investors = config.investorRecords.slice(0, config.maxInvestors || 999_999);
    log(`\n  CB Insights: processing ${investors.length} investors...`);

    const invBatch: Array<{ id: string; patch: Record<string, any> }> = [];
    const invProvenance: ProvenanceRecord[] = [];

    for (let i = 0; i < investors.length; i++) {
      const inv = investors[i];
      stats.investorsSearched++;
      const fullName = `${inv.first_name || ""} ${inv.last_name || ""}`.trim();

      try {
        await limiter.wait();
        log(`  [${i + 1}/${investors.length}] CBI investor: ${fullName}`);

        const profileUrl = await searchPersonAndNavigate(page, fullName);
        if (!profileUrl) {
          stats.investorsNotFound++;
          continue;
        }

        const scraped = await extractCBIInvestorProfile(page);
        stats.investorsMatched++;

        const scrapedFields: Record<string, any> = {};
        if (scraped.title) scrapedFields.title = scraped.title;
        if (scraped.bio) scrapedFields.bio = scraped.bio;
        if (scraped.linkedin_url) scrapedFields.linkedin_url = scraped.linkedin_url;
        if (scraped.x_url) scrapedFields.x_url = scraped.x_url;
        if (scraped.city) scrapedFields.city = scraped.city;
        if (scraped.country) scrapedFields.country = scraped.country;
        if (scraped.avatar_url) scrapedFields.avatar_url = scraped.avatar_url;
        if (scraped.cb_insights_url) scrapedFields.cb_insights_url = scraped.cb_insights_url;

        const updates = computeFieldUpdates(inv, scrapedFields, 0.75);
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
              source_platform: "cb_insights",
              source_url: scraped.cb_insights_url || profileUrl,
              confidence_score: u.confidence,
              extraction_method: "playwright_dom",
              match_method: "search_person",
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
        log(`  CBI ERROR investor ${fullName}: ${err.message}`);
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
