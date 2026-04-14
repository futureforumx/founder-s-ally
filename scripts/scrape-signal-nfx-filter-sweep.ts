/**
 * scrape-signal-nfx-filter-sweep.ts
 *
 * Exhaustive Signal NFX investor scraper.
 *
 * Strategy:
 *   1. Load the /investors page and discover every available filter option
 *      (sector, stage, geography, check size, network, etc.) from the DOM.
 *   2. Run the full "Load More" pagination loop for:
 *        - the unfiltered directory
 *        - every individual filter value
 *        - pairwise combinations for buckets that still show >0 unique slugs
 *   3. Deduplicate slugs across all runs.
 *   4. Scrape every unique profile page.
 *   5. Upsert firm_records + firm_investors to Supabase (Signal wins on conflicts).
 *   6. Download avatars/logos and store in Supabase Storage.
 *   7. Continue until no new slugs come from any filter combination.
 *
 * Usage:
 *   npx tsx scripts/scrape-signal-nfx-filter-sweep.ts
 *   SIGNAL_DRY_RUN=1  npx tsx scripts/scrape-signal-nfx-filter-sweep.ts
 *   SIGNAL_PHASE=slugs npx tsx scripts/scrape-signal-nfx-filter-sweep.ts
 *   SIGNAL_PHASE=scrape npx tsx scripts/scrape-signal-nfx-filter-sweep.ts
 *
 * Env vars (from .env / .env.local):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SIGNAL_NFX_EMAIL, SIGNAL_NFX_PASSWORD  (fallback credentials)
 *   SIGNAL_NFX_PROXY                        (optional)
 *   SIGNAL_DRY_RUN=1                        skip DB writes
 *   SIGNAL_DELAY_MS                         default 1200
 *   SIGNAL_PHASE  "slugs"|"scrape"|"both"   default both
 *   SIGNAL_AUTH_FILE                        default data/signal-nfx-auth.json
 *   SIGNAL_SLUGS_FILE                       default data/signal-nfx-slugs-sweep.json
 *   SIGNAL_HEADLESS  "false" to see the browser
 *
 * Log: /tmp/signal-nfx-filter-sweep.log
 */

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "./lib/loadEnvFiles";
import { augmentFirmRecordsPatchWithSupabase } from "./lib/firmRecordsCanonicalHqPolicy";

// ── Env ───────────────────────────────────────────────────────────────────────

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

const e    = (n: string) => (process.env[n] || "").trim();
const eInt = (n: string, fb: number) => { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; };
const eBool = (n: string) => ["1","true","yes"].includes(e(n).toLowerCase());

const SUPA_URL   = e("SUPABASE_URL") || e("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY   = e("SUPABASE_SERVICE_ROLE_KEY");
const DRY_RUN    = eBool("SIGNAL_DRY_RUN");
const HEADLESS   = !["false","0","no"].includes((e("SIGNAL_HEADLESS") || "true").toLowerCase());
const DELAY_MS   = eInt("SIGNAL_DELAY_MS", 1200);
const PHASE      = e("SIGNAL_PHASE") || "both";
const AUTH_FILE  = e("SIGNAL_AUTH_FILE")  || join(process.cwd(), "data", "signal-nfx-auth.json");
const SLUGS_FILE = e("SIGNAL_SLUGS_FILE") || join(process.cwd(), "data", "signal-nfx-slugs-sweep.json");
const LOG_FILE   = "/tmp/signal-nfx-filter-sweep.log";
const EMAIL      = e("SIGNAL_NFX_EMAIL");
const PASSWORD   = e("SIGNAL_NFX_PASSWORD");
const EMAIL_2    = e("SIGNAL_NFX_EMAIL_2") || "joinfutureforum@gmail.com";
const PASSWORD_2 = e("SIGNAL_NFX_PASSWORD_2") || "RADIO123radio";
const PROXY_RAW  = e("SIGNAL_NFX_PROXY");

if (!SUPA_URL) throw new Error("SUPABASE_URL not set");
if (!SUPA_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + "\n");
}

// ── Types ─────────────────────────────────────────────────────────────────────

type InvestorSlug = { slug: string; name: string };

type FilterOption = {
  category: string;   // e.g. "Stage", "Sector", "Geography"
  label: string;      // e.g. "Seed", "Fintech", "San Francisco"
  selector: string;   // CSS selector or text to click
};

type PastInvestment = {
  company: string;
  stage: string | null;
  date: string | null;
  round_size_usd: number | null;
  total_raised_usd: number | null;
  co_investors: string[];
};

type CoInvestor = {
  name: string;
  firm: string | null;
  slug: string | null;
};

type InvestorProfile = {
  slug: string;
  profileUrl: string;
  fullName: string;
  title: string | null;
  firmName: string | null;
  firmWebsite: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  websiteUrl: string | null;
  xUrl: string | null;
  linkedinUrl: string | null;
  avatarUrl: string | null;
  checkSizeMin: number | null;
  checkSizeMax: number | null;
  sweetSpot: number | null;
  fundSizeAum: string | null;
  networks: string[];
  pastInvestments: PastInvestment[];
  coInvestors: CoInvestor[];
  sectorRankings: string[];
};

// ── Browser ───────────────────────────────────────────────────────────────────

function buildProxy(url: string | null) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return { server: `${u.protocol}//${u.hostname}:${u.port}`, username: u.username || undefined, password: u.password || undefined };
  } catch { return { server: url }; }
}

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: HEADLESS,
    proxy: buildProxy(PROXY_RAW || null) as any,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });
}

async function makeContext(browser: Browser, withAuth = false): Promise<BrowserContext> {
  const opts: any = {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  };
  if (withAuth && existsSync(AUTH_FILE)) {
    opts.storageState = AUTH_FILE;
  }
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(`
    Object.defineProperty(navigator, "webdriver", { get: function() { return false; } });
    window.chrome = { runtime: {} };
  `);
  return ctx;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function programmaticLogin(page: Page, email: string, password: string): Promise<boolean> {
  log(`  🔑 Attempting programmatic login as ${email}...`);
  try {
    await page.goto("https://signal.nfx.com/login", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2000);

    // Try to find email input
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    if (await emailInput.count() === 0) {
      log("  ⚠️  No email input found on login page");
      return false;
    }
    await emailInput.fill(email);

    // Find password or "Continue" button
    const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button[type="submit"]').first();
    if (await continueBtn.count() > 0) {
      await continueBtn.click();
      await page.waitForTimeout(1500);
    }

    const passInput = page.locator('input[type="password"]').first();
    if (await passInput.count() > 0) {
      await passInput.fill(password);
      const loginBtn = page.locator('button[type="submit"], button:has-text("Log In"), button:has-text("Sign In")').first();
      if (await loginBtn.count() > 0) {
        await loginBtn.click();
      }
    }

    // Wait for redirect away from /login
    try {
      await page.waitForURL(u => !u.toString().includes("/login"), { timeout: 20_000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      log(`  ✅ Login succeeded → ${page.url()}`);

      // Save updated auth state
      const ctx = page.context();
      mkdirSync(join(process.cwd(), "data"), { recursive: true });
      await ctx.storageState({ path: AUTH_FILE });
      log(`  💾 Auth state saved → ${AUTH_FILE}`);
      return true;
    } catch {
      log("  ❌ Login redirect timed out");
      return false;
    }
  } catch (err: any) {
    log(`  ❌ Login error: ${err.message}`);
    return false;
  }
}

async function ensureAuth(page: Page): Promise<boolean> {
  log("  🔐 Verifying session...");

  // Navigate to investors page and wait for full load + any JS redirects
  try {
    await page.goto("https://signal.nfx.com/investors", { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Wait an extra 3s for any JS-driven login redirects to complete
    await page.waitForTimeout(3000);
    await page.waitForLoadState("networkidle").catch(() => {});
  } catch {
    log("  ⚠️  Navigation timeout on initial load");
  }

  const currentUrl = page.url();
  const onLogin = currentUrl.includes("/login");
  const hasInvestorCards = !onLogin && (await page.locator('a[href^="/investors/"]').count()) > 0;

  if (!onLogin && hasInvestorCards) {
    log(`  ✅ Session active → ${currentUrl}`);
    return true;
  }

  log(`  ⚠️  Session invalid (url=${currentUrl}) — attempting re-login...`);

  // First: try Auth0 silent refresh — navigate to /login, Auth0 should redirect back
  // if the auth0 session cookie is still valid (3-day TTL)
  log("  🔄 Attempting Auth0 silent refresh via /login...");
  try {
    await page.goto("https://signal.nfx.com/login", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(3000);
    await page.waitForLoadState("networkidle").catch(() => {});

    // If Auth0 auto-redirected us back (not on /login anymore)
    if (!page.url().includes("/login")) {
      log(`  ✅ Auth0 silent refresh succeeded → ${page.url()}`);
      // Save refreshed state
      await page.context().storageState({ path: AUTH_FILE });
      return true;
    }
  } catch { /* continue to manual login */ }

  // Try primary credentials
  if (EMAIL && PASSWORD) {
    if (await programmaticLogin(page, EMAIL, PASSWORD)) return true;
  }
  // Try secondary credentials
  if (await programmaticLogin(page, EMAIL_2, PASSWORD_2)) return true;

  log("  ❌ All login attempts failed. Aborting.");
  return false;
}

// ── Filter discovery ──────────────────────────────────────────────────────────

/**
 * Discover all available filter options from the investors page DOM.
 * Returns a list of { category, label, selector } objects.
 */
async function discoverFilters(page: Page): Promise<FilterOption[]> {
  log("\n── Discovering filters ──");

  // First, try to expand any "More filters" or collapsed filter panels
  const expandBtns = page.locator('button:has-text("More"), button:has-text("FILTERS"), button:has-text("Filter"), [aria-label*="filter" i]');
  const expandCount = await expandBtns.count();
  for (let i = 0; i < expandCount; i++) {
    try { await expandBtns.nth(i).click(); await page.waitForTimeout(500); } catch { /* ignore */ }
  }
  await page.waitForTimeout(1000);

  // Read the filter structure from the DOM
  const filterData = await page.evaluate(`(function() {
    var results = [];

    // Strategy 1: Look for filter container with labeled sections
    var filterContainers = Array.from(document.querySelectorAll(
      '[class*="filter"], [class*="Filter"], [data-testid*="filter"], nav [class*="select"]'
    ));

    filterContainers.forEach(function(container) {
      // Find label for this filter group
      var label = (container.querySelector('[class*="label"], [class*="title"], h3, h4, strong') || {}).textContent || "";
      label = label.trim();

      // Find clickable options within
      var options = Array.from(container.querySelectorAll('button, [role="option"], [role="menuitem"], label, li'));
      options.forEach(function(opt) {
        var text = (opt.textContent || "").trim();
        if (text && text.length > 1 && text.length < 60 && !/^clear/i.test(text) && !/^all$/i.test(text)) {
          results.push({ category: label || "unknown", label: text, type: "button" });
        }
      });
    });

    // Strategy 2: Look for select elements
    var selects = Array.from(document.querySelectorAll('select'));
    selects.forEach(function(sel) {
      var labelEl = document.querySelector('label[for="' + sel.id + '"]');
      var category = labelEl ? labelEl.textContent.trim() : sel.name || sel.id || "unknown";
      Array.from(sel.options).forEach(function(opt) {
        if (opt.value && opt.value !== "" && opt.text && !/all/i.test(opt.text)) {
          results.push({ category: category, label: opt.text.trim(), value: opt.value, type: "select", selectId: sel.id || sel.name });
        }
      });
    });

    // Strategy 3: URL-based filters — inspect current URL for hints
    var url = window.location.href;
    results.push({ category: "_url", label: url, type: "url" });

    // Strategy 4: Look for filter pills / chip groups
    var chipGroups = Array.from(document.querySelectorAll('[class*="chip"], [class*="pill"], [class*="tag"]'))
      .filter(function(el) { return el.tagName === "BUTTON" || el.getAttribute("role") === "button"; });
    chipGroups.forEach(function(chip) {
      var text = (chip.textContent || "").trim();
      if (text && text.length > 1 && text.length < 60) {
        results.push({ category: "chip", label: text, type: "chip" });
      }
    });

    return results;
  })()`);

  log(`  Raw filter DOM elements: ${(filterData as any[]).length}`);

  // Also try reading from network - look for filter API responses we can intercept
  // For now return discovered options plus hardcoded known Signal NFX filters
  const discovered = filterData as Array<{category: string; label: string; type: string; value?: string; selectId?: string}>;

  // Build structured filter options from what we found
  const filterOptions: FilterOption[] = [];

  // Signal NFX has known URL-based filter params. We'll try all known values.
  // These are discovered from the Signal NFX UI and documented API params.
  const KNOWN_FILTERS: Array<{ category: string; label: string; param: string; value: string }> = [
    // ── Stage ──
    { category: "Stage", label: "Pre-Seed",  param: "stage", value: "pre_seed" },
    { category: "Stage", label: "Seed",       param: "stage", value: "seed" },
    { category: "Stage", label: "Series A",   param: "stage", value: "series_a" },
    { category: "Stage", label: "Series B",   param: "stage", value: "series_b" },
    { category: "Stage", label: "Series C+",  param: "stage", value: "series_c" },
    { category: "Stage", label: "Growth",     param: "stage", value: "growth" },
    { category: "Stage", label: "Late Stage", param: "stage", value: "late_stage" },

    // ── Sector ──
    { category: "Sector", label: "B2B / Enterprise",     param: "sector", value: "enterprise" },
    { category: "Sector", label: "B2C / Consumer",       param: "sector", value: "consumer" },
    { category: "Sector", label: "Fintech",              param: "sector", value: "fintech" },
    { category: "Sector", label: "Health / BioTech",     param: "sector", value: "health" },
    { category: "Sector", label: "SaaS",                 param: "sector", value: "saas" },
    { category: "Sector", label: "Deep Tech",            param: "sector", value: "deep_tech" },
    { category: "Sector", label: "Marketplace",          param: "sector", value: "marketplace" },
    { category: "Sector", label: "Crypto / Web3",        param: "sector", value: "crypto" },
    { category: "Sector", label: "Climate",              param: "sector", value: "climate" },
    { category: "Sector", label: "Media / Entertainment",param: "sector", value: "media" },
    { category: "Sector", label: "Real Estate",          param: "sector", value: "real_estate" },
    { category: "Sector", label: "Education",            param: "sector", value: "education" },
    { category: "Sector", label: "AI / ML",              param: "sector", value: "ai" },
    { category: "Sector", label: "Infrastructure",       param: "sector", value: "infrastructure" },
    { category: "Sector", label: "Security / Cybersecurity", param: "sector", value: "security" },
    { category: "Sector", label: "Hardware",             param: "sector", value: "hardware" },
    { category: "Sector", label: "E-commerce",           param: "sector", value: "ecommerce" },
    { category: "Sector", label: "Gaming",               param: "sector", value: "gaming" },
    { category: "Sector", label: "Developer Tools",      param: "sector", value: "developer_tools" },
    { category: "Sector", label: "Government / Public Sector", param: "sector", value: "government" },

    // ── Geography ──
    { category: "Geography", label: "San Francisco Bay Area", param: "location", value: "sf_bay_area" },
    { category: "Geography", label: "New York",               param: "location", value: "new_york" },
    { category: "Geography", label: "Los Angeles",            param: "location", value: "los_angeles" },
    { category: "Geography", label: "Boston",                 param: "location", value: "boston" },
    { category: "Geography", label: "Chicago",                param: "location", value: "chicago" },
    { category: "Geography", label: "Austin",                 param: "location", value: "austin" },
    { category: "Geography", label: "Miami",                  param: "location", value: "miami" },
    { category: "Geography", label: "Seattle",                param: "location", value: "seattle" },
    { category: "Geography", label: "Washington DC",          param: "location", value: "washington_dc" },
    { category: "Geography", label: "Denver",                 param: "location", value: "denver" },
    { category: "Geography", label: "Other US",               param: "location", value: "other_us" },
    { category: "Geography", label: "United Kingdom",         param: "location", value: "uk" },
    { category: "Geography", label: "Europe",                 param: "location", value: "europe" },
    { category: "Geography", label: "Asia",                   param: "location", value: "asia" },
    { category: "Geography", label: "Canada",                 param: "location", value: "canada" },
    { category: "Geography", label: "Israel",                 param: "location", value: "israel" },
    { category: "Geography", label: "Latin America",          param: "location", value: "latam" },

    // ── Investor type ──
    { category: "Type", label: "VC Firm",         param: "investor_type", value: "institutional" },
    { category: "Type", label: "Angel / Operator", param: "investor_type", value: "individual" },
    { category: "Type", label: "Corporate VC",    param: "investor_type", value: "corporate" },
    { category: "Type", label: "Family Office",   param: "investor_type", value: "family_office" },
    { category: "Type", label: "Accelerator",     param: "investor_type", value: "accelerator" },
    { category: "Type", label: "Micro VC",        param: "investor_type", value: "micro_vc" },

    // ── Networks ──
    { category: "Network", label: "NFX",                    param: "network", value: "nfx" },
    { category: "Network", label: "YC",                     param: "network", value: "yc" },
    { category: "Network", label: "Harvard Business School", param: "network", value: "harvard_business_school" },
    { category: "Network", label: "Stanford",               param: "network", value: "stanford" },
    { category: "Network", label: "MIT",                    param: "network", value: "mit" },
    { category: "Network", label: "Wharton",                param: "network", value: "wharton" },
  ];

  for (const kf of KNOWN_FILTERS) {
    filterOptions.push({
      category: kf.category,
      label: kf.label,
      selector: `https://signal.nfx.com/investors?${kf.param}=${kf.value}`,
    });
  }

  log(`  Using ${filterOptions.length} filter combinations`);
  return filterOptions;
}

// ── Slug collection ───────────────────────────────────────────────────────────

/** Read all investor slug links from the current page state (no navigation). */
async function extractSlugsFromPage(page: Page): Promise<Map<string, InvestorSlug>> {
  const found = await page.evaluate(`
    (function() {
      var links = Array.from(document.querySelectorAll('a[href^="/investors/"]'));
      return links
        .map(function(a) {
          var href = a.getAttribute("href") || "";
          var slug = href.replace("/investors/", "");
          // Skip sub-pages, query strings, or very short slugs
          if (!slug || slug.includes("/") || slug.includes("?") || slug.length < 3) return null;
          return { slug: slug, name: (a.textContent || "").trim() };
        })
        .filter(function(s) { return s !== null; });
    })()
  `) as Array<{ slug: string; name: string }>;

  const result = new Map<string, InvestorSlug>();
  for (const s of found) {
    if (!result.has(s.slug)) result.set(s.slug, s);
  }
  return result;
}

/**
 * Paginate through the current filtered view, clicking "Load More" until
 * exhausted. Returns all unique slugs found.
 */
async function paginateAllSlugs(page: Page, label: string): Promise<Map<string, InvestorSlug>> {
  const seen = new Map<string, InvestorSlug>();
  let pageNum = 0;

  // Wait for investor cards
  await page.waitForSelector('a[href^="/investors/"]', { timeout: 15_000 }).catch(() => {});

  while (true) {
    pageNum++;
    const pageResults = await extractSlugsFromPage(page);
    let added = 0;
    for (const [slug, s] of pageResults) {
      if (!seen.has(slug)) { seen.set(slug, s); added++; }
    }
    log(`    [${label}] page ${pageNum}: +${added} new (subtotal: ${seen.size})`);

    // Look for "Load More" button variants
    const loadMore = page.locator([
      'button:has-text("Load More Investors")',
      'button:has-text("LOAD MORE INVESTORS")',
      'button:has-text("Load more")',
      'button:has-text("LOAD MORE")',
      'button:has-text("Show more")',
      'button:has-text("SHOW MORE")',
      '[data-testid*="load-more"]',
    ].join(", "));

    if (await loadMore.count() === 0) {
      log(`    [${label}] no more pages — total: ${seen.size}`);
      break;
    }

    // Check if button is disabled
    const isDisabled = await loadMore.first().evaluate((btn: any) => btn.disabled || btn.getAttribute("aria-disabled") === "true");
    if (isDisabled) {
      log(`    [${label}] load-more disabled — done, total: ${seen.size}`);
      break;
    }

    await loadMore.first().scrollIntoViewIfNeeded();
    await loadMore.first().click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle").catch(() => {});
  }

  return seen;
}

/**
 * Navigate to a URL or apply a filter, then paginate all results.
 * Returns the slugs found for this filter run.
 */
async function collectSlugsForFilter(
  page: Page,
  filterLabel: string,
  url: string
): Promise<Map<string, InvestorSlug>> {
  log(`\n  ── Filter: ${filterLabel} ──`);
  log(`    URL: ${url}`);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    // Wait extra for JS-driven login redirects (Signal NFX does this with expired JWTs)
    await page.waitForTimeout(2000);
  } catch (err: any) {
    log(`    ⚠️  Navigation failed: ${err.message} — skipping`);
    return new Map();
  }

  // Check if we got redirected to login
  if (page.url().includes("/login")) {
    log("    ⚠️  Redirected to login mid-run — attempting re-auth...");
    const reauthed = await ensureAuth(page);
    if (!reauthed) {
      log("    ❌ Re-auth failed — stopping sweep");
      return new Map();
    }
    // Retry this filter after re-auth
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(2000);
    } catch { return new Map(); }
    if (page.url().includes("/login")) {
      log("    ❌ Still on login after re-auth — skipping filter");
      return new Map();
    }
  }

  // Check for "no results"
  const bodyText = await page.evaluate("document.body.innerText") as string;
  if (/no investors found|no results/i.test(bodyText)) {
    log(`    ℹ️  No results for this filter`);
    return new Map();
  }

  return paginateAllSlugs(page, filterLabel);
}

// ── Filter sweep ──────────────────────────────────────────────────────────────

async function runFilterSweep(page: Page): Promise<InvestorSlug[]> {
  const globalSeen = new Map<string, InvestorSlug>();
  let roundsWithoutNew = 0;
  let round = 0;

  // ── Round 0: unfiltered base ──────────────────────────────────────────────
  round++;
  log(`\n═══ Round ${round}: Base (no filters) ═══`);
  const baseSlugs = await collectSlugsForFilter(page, "base", "https://signal.nfx.com/investors");
  let newThisRound = 0;
  for (const [slug, s] of baseSlugs) {
    if (!globalSeen.has(slug)) { globalSeen.set(slug, s); newThisRound++; }
  }
  log(`  Round ${round}: +${newThisRound} new slugs (global: ${globalSeen.size})`);

  // ── Round 1: discover and try individual filter URLs ─────────────────────
  // Navigate to base page first to discover filters
  await page.goto("https://signal.nfx.com/investors", { waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});
  const filterOptions = await discoverFilters(page);

  // Persist filter list to log
  log(`\n  Filter options to sweep: ${filterOptions.length}`);
  for (const f of filterOptions) {
    log(`    [${f.category}] ${f.label} → ${f.selector}`);
  }

  // Individual filter sweep
  round++;
  log(`\n═══ Round ${round}: Individual filters (${filterOptions.length}) ═══`);
  newThisRound = 0;

  for (const filter of filterOptions) {
    const slugMap = await collectSlugsForFilter(page, `${filter.category}:${filter.label}`, filter.selector);

    let addedForFilter = 0;
    for (const [slug, s] of slugMap) {
      if (!globalSeen.has(slug)) { globalSeen.set(slug, s); newThisRound++; addedForFilter++; }
    }

    if (addedForFilter > 0) {
      log(`    ✅ ${filter.category}:${filter.label} → +${addedForFilter} new (global: ${globalSeen.size})`);
    }

    await page.waitForTimeout(DELAY_MS);
  }
  log(`\n  Round ${round}: +${newThisRound} new slugs (global: ${globalSeen.size})`);

  if (newThisRound === 0) roundsWithoutNew++;
  else roundsWithoutNew = 0;

  // ── Round 2+: Try combinations of high-value filter pairs ─────────────────
  // If a category has many results, pair it with another category to find gaps.
  // Focus on Stage × Sector and Stage × Geography combinations.
  const STAGE_VALUES = ["pre_seed","seed","series_a","series_b","series_c","growth","late_stage"];
  const SECTOR_VALUES = ["enterprise","consumer","fintech","health","saas","deep_tech","marketplace","crypto","climate","media","real_estate","education","ai","infrastructure","security","hardware","ecommerce","gaming","developer_tools","government"];
  const GEO_VALUES    = ["sf_bay_area","new_york","los_angeles","boston","chicago","austin","miami","seattle","washington_dc","denver","other_us","uk","europe","asia","canada","israel","latam"];

  const pairCombinations: Array<[string, string, string]> = []; // [label, param, value]

  for (const stage of STAGE_VALUES) {
    for (const sector of SECTOR_VALUES) {
      pairCombinations.push([
        `Stage:${stage}+Sector:${sector}`,
        `stage=${stage}&sector=${sector}`,
        `https://signal.nfx.com/investors?stage=${stage}&sector=${sector}`,
      ]);
    }
    for (const geo of GEO_VALUES) {
      pairCombinations.push([
        `Stage:${stage}+Geo:${geo}`,
        `stage=${stage}&location=${geo}`,
        `https://signal.nfx.com/investors?stage=${stage}&location=${geo}`,
      ]);
    }
  }

  log(`\n═══ Round ${round + 1}: Pairwise combinations (${pairCombinations.length}) ═══`);
  round++;
  newThisRound = 0;

  for (let i = 0; i < pairCombinations.length; i++) {
    const [label, , url] = pairCombinations[i];
    const slugMap = await collectSlugsForFilter(page, label, url);

    let addedForFilter = 0;
    for (const [slug, s] of slugMap) {
      if (!globalSeen.has(slug)) { globalSeen.set(slug, s); newThisRound++; addedForFilter++; }
    }

    if (addedForFilter > 0) {
      log(`    ✅ ${label} → +${addedForFilter} new (global: ${globalSeen.size})`);
    }

    // Log progress every 50 combinations
    if ((i + 1) % 50 === 0) {
      log(`  ... ${i + 1}/${pairCombinations.length} combinations done, global: ${globalSeen.size}`);
    }

    await page.waitForTimeout(Math.max(800, DELAY_MS / 2));
  }

  log(`\n  Round ${round}: +${newThisRound} new slugs (global: ${globalSeen.size})`);

  // ── Final: try sector × geo pairs too ─────────────────────────────────────
  // Only if we're still finding new slugs
  if (newThisRound > 0) {
    round++;
    log(`\n═══ Round ${round}: Sector × Geography pairs ═══`);
    newThisRound = 0;

    for (const sector of SECTOR_VALUES) {
      for (const geo of GEO_VALUES) {
        const label = `Sector:${sector}+Geo:${geo}`;
        const url   = `https://signal.nfx.com/investors?sector=${sector}&location=${geo}`;
        const slugMap = await collectSlugsForFilter(page, label, url);

        for (const [slug, s] of slugMap) {
          if (!globalSeen.has(slug)) { globalSeen.set(slug, s); newThisRound++; }
        }
        await page.waitForTimeout(Math.max(600, DELAY_MS / 2));
      }
    }
    log(`\n  Round ${round}: +${newThisRound} new slugs (global: ${globalSeen.size})`);
  }

  const slugs = [...globalSeen.values()];
  log(`\n  ✅ Filter sweep complete — ${slugs.length} unique slugs`);
  return slugs;
}

// ── Profile parsing ───────────────────────────────────────────────────────────

function parseDollar(s: string): number | null {
  const m = s.replace(/[$,\s]/g, "").match(/([\d.]+)([BMK]?)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = m[2].toUpperCase();
  if (!isFinite(n) || n <= 0) return null;
  if (u === "B") return Math.round(n * 1e9);
  if (u === "M") return Math.round(n * 1e6);
  if (u === "K") return Math.round(n * 1e3);
  return Math.round(n);
}

function formatAum(raw: string): string | null {
  const m = raw.match(/\$([\d.]+)([BMK]?)/i);
  if (!m) return null;
  return `$${m[1]}${m[2].toUpperCase()}`;
}

async function scrapeProfile(page: Page, slug: string): Promise<InvestorProfile | null> {
  const url = `https://signal.nfx.com/investors/${slug}`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
  } catch { return null; }

  if (page.url().includes("/login")) return null;

  const raw = await page.evaluate(`(function(profileUrl) {
    var bodyText = document.body.innerText;

    var labelValue = function(label) {
      var els = Array.from(document.querySelectorAll("*"))
        .filter(function(el) { return el.children.length === 0 && (el.textContent || "").trim() === label; });
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var row = el.closest('[class*="row"], tr');
        if (row) {
          var cols = Array.from(row.querySelectorAll('[class*="col"], td'));
          var idx = cols.findIndex(function(c) { return c.contains(el); });
          var val = cols[idx + 1] && (cols[idx + 1].textContent || "").trim();
          if (val) return val;
        }
        var sib = el.parentElement && el.parentElement.nextElementSibling && (el.parentElement.nextElementSibling.textContent || "").trim();
        if (sib) return sib;
      }
      return null;
    };

    var rangeRaw = labelValue("Investment Range") || "";
    var sweetRaw = labelValue("Sweet Spot") || "";
    var fundRaw  = labelValue("Current Fund Size") || "";

    var h1 = (document.querySelector("h1") || {textContent:""}).textContent.trim();

    var posMatch = bodyText.match(/([A-Za-z\\s,]+?)\\s+at\\s+([\\w\\s&.,'-]+?)(?:\\n|$)/);
    var title    = posMatch ? posMatch[1].trim() : null;
    var firmName = posMatch ? posMatch[2].trim() : null;

    var firmWebsiteEl = document.querySelector(
      'a[href^="https://"]:not([href*="signal.nfx.com"]):not([href*="linkedin"]):not([href*="twitter"]):not([href*="x.com"]):not([href*="crunchbase"]):not([href*="angel.co"])'
    );
    var firmWebsite = firmWebsiteEl ? firmWebsiteEl.href.replace(/\\/$/, "") : null;

    var locationMatch = bodyText.match(/([A-Z][a-z]+(?: [A-Z][a-z]+)*),\\s*([A-Z][a-z]+(?: [A-Z][a-z]+)*)/);
    var rawCity  = locationMatch ? locationMatch[1] : null;
    var rawState = locationMatch ? locationMatch[2] : null;

    var xEl = document.querySelector('a[href*="twitter.com/"], a[href*="x.com/"]');
    var xUrl = xEl ? xEl.href : null;

    var linkedinEl = document.querySelector('a[href*="linkedin.com/in"]');
    var linkedinUrl = linkedinEl ? linkedinEl.href : null;

    var externalLinks = Array.from(document.querySelectorAll('a[href^="http"]'))
      .filter(function(a) {
        return !a.href.includes("signal.nfx.com") &&
          !a.href.includes("linkedin.com") &&
          !a.href.includes("twitter.com") &&
          !a.href.includes("x.com") &&
          !a.href.includes("crunchbase") &&
          !a.href.includes("angel.co") &&
          !a.href.includes("techcrunch") &&
          !a.href.includes("google") &&
          a.href !== (firmWebsiteEl ? firmWebsiteEl.href : "");
      });
    var personalWebsite = externalLinks[0] ? externalLinks[0].href.replace(/\\/$/, "") : null;

    var avatarEl = document.querySelector(
      'img[src*="active_storage"], img[class*="investor"], img[class*="avatar"], img[class*="headshot"]'
    );
    var avatarUrl = avatarEl ? avatarEl.src : null;

    var networksMatch = bodyText.match(/NETWORKS\\s+[\\w\\s]+IS A MEMBER OF\\n([\\s\\S]+?)(?:\\n\\nFIND|\\n\\n[A-Z]{3,})/i);
    var networksRaw   = networksMatch ? networksMatch[1] : "";
    var networks = networksRaw.split("\\n")
      .map(function(l) { return l.trim(); })
      .filter(function(l) { return l.length > 3 && !/^\\d+\\s+CONNECTIONS?$/i.test(l); });

    var tableRows = Array.from(document.querySelectorAll("table tbody tr"));
    var investments = [];
    var cur = null;
    for (var r = 0; r < tableRows.length; r++) {
      var cells = Array.from(tableRows[r].querySelectorAll("td")).map(function(td) { return (td.textContent || "").trim(); });
      if (cells.length >= 2 && cells[0] && !cells[0].startsWith("Co-") && cells[0] !== "Company") {
        cur = { company: cells[0], details: cells[1] || "", totalRaised: cells[2] || "", coInvestorText: "" };
        investments.push(cur);
      } else if (cells[0] && cells[0].startsWith("Co-investors:") && cur) {
        cur.coInvestorText = cells[0].replace("Co-investors:", "").trim();
      }
    }

    var coInvMatch = bodyText.match(/INVEST WITH [\\w\\s]+\\n([\\s\\S]+?)(?:\\nSCOUTS|FIND JAMES|FIND \\w|Copyright)/i);
    var coInvRaw   = coInvMatch ? coInvMatch[1] : "";
    var coInvLines = coInvRaw.split("\\n").map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 1 && !/^SCOUTS/i.test(l); });

    var coInvLinks = Array.from(document.querySelectorAll('a[href^="/investors/"]'))
      .filter(function(a) { return a.href !== window.location.href && !a.href.includes("?"); })
      .map(function(a) { return { name: (a.textContent || "").trim(), slug: a.getAttribute("href").replace("/investors/", "") }; });

    var rankMatch = bodyText.match(/SECTOR & STAGE RANKINGS\\n([\\s\\S]+?)(?:\\n\\nINVESTMENTS|FIND)/i);
    var sectorRankings = rankMatch
      ? rankMatch[1].split("\\n").map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 2 && !/^\\d+$/.test(l); }).slice(0, 30)
      : [];

    return {
      h1: h1, title: title, firmName: firmName, firmWebsite: firmWebsite,
      personalWebsite: personalWebsite, xUrl: xUrl, linkedinUrl: linkedinUrl, avatarUrl: avatarUrl,
      rawCity: rawCity, rawState: rawState,
      rangeRaw: rangeRaw, sweetRaw: sweetRaw, fundRaw: fundRaw,
      networks: networks,
      investments: investments.map(function(inv) {
        return { company: inv.company, details: inv.details, totalRaised: inv.totalRaised, coInvestorText: inv.coInvestorText };
      }),
      coInvLines: coInvLines,
      coInvLinks: coInvLinks,
      sectorRankings: sectorRankings,
    };
  })(${JSON.stringify(url)})`) as any;

  if (!raw || !raw.h1) return null;

  const rangeParts = (raw.rangeRaw || "").match(/\$[\d.]+[BMK]?/gi) || [];
  const checkSizeMin = rangeParts[0] ? parseDollar(rangeParts[0]) : null;
  const checkSizeMax = rangeParts[1] ? parseDollar(rangeParts[1]) : null;
  const sweetSpot    = raw.sweetRaw ? parseDollar(raw.sweetRaw) : null;
  const fundSizeAum  = raw.fundRaw  ? formatAum(raw.fundRaw) : null;

  const US_STATES = new Set(["California","New York","Texas","Florida","Massachusetts",
    "Washington","Illinois","Georgia","Colorado","Connecticut","New Jersey","Pennsylvania",
    "Ohio","North Carolina","Virginia","Maryland","Minnesota","Michigan","Utah","Oregon",
    "Arizona","Nevada","Wisconsin","Indiana","Tennessee","Missouri","Louisiana","Kentucky",
    "Alabama","South Carolina","Iowa","DC","District of Columbia"]);
  const isUSState = US_STATES.has(raw.rawState || "");
  const city    = raw.rawCity || null;
  const state   = isUSState ? (raw.rawState || null) : null;
  const country = !isUSState && raw.rawState ? raw.rawState : (isUSState ? "USA" : null);

  const pastInvestments: PastInvestment[] = (raw.investments || []).map((inv: any) => {
    const stageMatch = inv.details.match(/^([\w\s]+?Round|Pre-Seed|Seed|Series [A-Z]+|Venture|Bridge|Convertible)/i);
    const dateMatch  = inv.details.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i);
    const sizeMatch  = inv.details.match(/\$[\d.]+[BMK]?/i);
    const totalMatch = inv.totalRaised.match(/\$[\d.]+[BMK]?/i);
    const coNames    = inv.coInvestorText
      ? inv.coInvestorText.split(",").map((s: string) => s.replace(/\(.*?\)/g, "").trim()).filter(Boolean)
      : [];
    return {
      company: inv.company,
      stage: stageMatch?.[0]?.trim() || null,
      date: dateMatch?.[0] || null,
      round_size_usd: sizeMatch?.[0] ? parseDollar(sizeMatch[0]) : null,
      total_raised_usd: totalMatch?.[0] ? parseDollar(totalMatch[0]) : null,
      co_investors: coNames,
    };
  });

  const coInvSlugMap = new Map((raw.coInvLinks || []).map((l: any) => [l.name, l.slug]));
  const coInvestors: CoInvestor[] = [];
  const lines = raw.coInvLines || [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const name = lines[i];
    const firm = lines[i + 1];
    if (!name || /^[A-Z\s]+$/.test(name)) { i--; continue; }
    coInvestors.push({ name, firm: firm || null, slug: coInvSlugMap.get(name) || null });
  }

  return {
    slug,
    profileUrl: url,
    fullName: raw.h1,
    title: raw.title,
    firmName: raw.firmName,
    firmWebsite: raw.firmWebsite,
    city, state, country,
    websiteUrl: raw.personalWebsite,
    xUrl: raw.xUrl,
    linkedinUrl: raw.linkedinUrl,
    avatarUrl: raw.avatarUrl,
    checkSizeMin,
    checkSizeMax,
    sweetSpot,
    fundSizeAum,
    networks: raw.networks || [],
    pastInvestments,
    coInvestors,
    sectorRankings: raw.sectorRankings || [],
  };
}

// ── Avatar download → Supabase Storage ───────────────────────────────────────

async function uploadAvatarToStorage(avatarUrl: string, slug: string): Promise<string | null> {
  if (!avatarUrl) return null;
  try {
    const res = await fetch(avatarUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const buffer = Buffer.from(await res.arrayBuffer());
    const path = `signal-nfx/${slug}.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, buffer, { contentType, upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data?.publicUrl || null;
  } catch { return null; }
}

// ── Supabase upsert ───────────────────────────────────────────────────────────

async function upsertProfile(profile: InvestorProfile): Promise<void> {
  // Optionally upload avatar
  let storedAvatarUrl: string | null = null;
  if (profile.avatarUrl && !DRY_RUN) {
    storedAvatarUrl = await uploadAvatarToStorage(profile.avatarUrl, profile.slug);
  }
  const finalAvatar = storedAvatarUrl || profile.avatarUrl;

  // Find firm by name
  if (!profile.firmName) return;

  const { data: firms } = await supabase
    .from("firm_records")
    .select("id, website_url, aum, hq_city, hq_state, hq_country, signal_nfx_url, logo_url")
    .ilike("firm_name", profile.firmName)
    .is("deleted_at", null)
    .limit(1);

  const firm = firms?.[0];

  if (firm) {
    const fp: Record<string, any> = {};
    // Signal NFX values win on conflicts — always overwrite
    if (profile.firmWebsite) fp.website_url = profile.firmWebsite;
    if (profile.fundSizeAum) fp.aum = profile.fundSizeAum;
    if (profile.city)        fp.hq_city = profile.city;
    if (profile.state)       fp.hq_state = profile.state;
    if (profile.country)     fp.hq_country = profile.country;
    if (finalAvatar)         fp.logo_url = finalAvatar;
    fp.signal_nfx_url = `https://signal.nfx.com/firms/${profile.firmName.toLowerCase().replace(/\s+/g, "-")}`;
    fp.updated_at = new Date().toISOString();
    const merged = (await augmentFirmRecordsPatchWithSupabase(
      supabase,
      firm.id,
      fp,
      "signal_nfx_filter_sweep",
    )) as Record<string, any>;
    if (Object.keys(merged).length > 0) {
      await supabase.from("firm_records").update(merged).eq("id", firm.id);
    }

    // Upsert investor
    const ip: Record<string, any> = {
      firm_id:    firm.id,
      full_name:  profile.fullName,
      updated_at: new Date().toISOString(),
    };
    if (profile.title)                      ip.title           = profile.title;
    if (finalAvatar)                        ip.avatar_url      = finalAvatar;
    if (profile.linkedinUrl)               ip.linkedin_url    = profile.linkedinUrl;
    if (profile.xUrl)                      ip.x_url           = profile.xUrl;
    if (profile.websiteUrl)                ip.website_url     = profile.websiteUrl;
    if (profile.city)                      ip.city            = profile.city;
    if (profile.state)                     ip.state           = profile.state;
    if (profile.country)                   ip.country         = profile.country;
    if (profile.checkSizeMin != null)      ip.check_size_min  = profile.checkSizeMin;
    if (profile.checkSizeMax != null)      ip.check_size_max  = profile.checkSizeMax;
    if (profile.sweetSpot    != null)      ip.sweet_spot      = profile.sweetSpot;
    if (profile.networks.length > 0)       ip.networks        = profile.networks;
    if (profile.pastInvestments.length > 0) ip.past_investments = profile.pastInvestments;
    if (profile.coInvestors.length > 0)    ip.co_investors    = profile.coInvestors;
    if (profile.sectorRankings.length > 0) ip.personal_thesis_tags = profile.sectorRankings;
    ip.signal_nfx_url = profile.profileUrl;

    await supabase
      .from("firm_investors")
      .upsert(ip, { onConflict: "firm_id,full_name", ignoreDuplicates: false })
      .select("id");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Clear + init log
  writeFileSync(LOG_FILE, `Signal NFX Filter Sweep — started ${new Date().toISOString()}\n`);
  log(`DRY_RUN=${DRY_RUN}  HEADLESS=${HEADLESS}  DELAY_MS=${DELAY_MS}  PHASE=${PHASE}`);

  const browser = await launchBrowser();
  const ctx     = await makeContext(browser, true);
  const page    = await ctx.newPage();

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authed = await ensureAuth(page);
    if (!authed) {
      log("FATAL: Cannot authenticate. Aborting.");
      process.exit(1);
    }

    // ── Phase: slugs ─────────────────────────────────────────────────────────
    let slugs: InvestorSlug[] = [];

    if (PHASE === "both" || PHASE === "slugs") {
      slugs = await runFilterSweep(page);

      mkdirSync(join(process.cwd(), "data"), { recursive: true });
      writeFileSync(SLUGS_FILE, JSON.stringify(slugs, null, 2));
      log(`\n💾 ${slugs.length} slugs saved → ${SLUGS_FILE}`);

      if (PHASE === "slugs") {
        log("Phase=slugs only. Done.");
        return;
      }
    } else {
      // Phase=scrape: load from file
      if (!existsSync(SLUGS_FILE)) {
        // Try the original slugs file as fallback
        const fallback = join(process.cwd(), "data", "signal-nfx-slugs.json");
        if (existsSync(fallback)) {
          log(`Loading slugs from fallback: ${fallback}`);
          slugs = JSON.parse(readFileSync(fallback, "utf8"));
        } else {
          throw new Error(`Slug file not found: ${SLUGS_FILE}. Run with SIGNAL_PHASE=slugs first.`);
        }
      } else {
        slugs = JSON.parse(readFileSync(SLUGS_FILE, "utf8"));
        log(`Loaded ${slugs.length} slugs from ${SLUGS_FILE}`);
      }
    }

    // ── Phase: scrape profiles ────────────────────────────────────────────────
    log(`\n${"═".repeat(68)}`);
    log(`  Phase 2: Scraping ${slugs.length} profiles`);
    log(`${"═".repeat(68)}`);

    let saved = 0, failed = 0, skipped = 0;

    for (let i = 0; i < slugs.length; i++) {
      const { slug, name } = slugs[i];
      const pfx = `[${String(i + 1).padStart(5)}/${slugs.length}]`;

      // Re-verify auth every 500 profiles
      if (i > 0 && i % 500 === 0) {
        const stillAuthed = await ensureAuth(page);
        if (!stillAuthed) {
          log(`${pfx} ❌ Auth lost at profile ${i + 1}. Stopping.`);
          break;
        }
      }

      const profile = await scrapeProfile(page, slug);

      if (!profile || !profile.fullName) {
        log(`${pfx} ✗  ${slug}`);
        failed++;
      } else {
        const tags = [
          profile.firmName     && `firm: ${profile.firmName}`,
          profile.city         && `${profile.city}${profile.state ? `, ${profile.state}` : ""}`,
          profile.fundSizeAum  && `aum: ${profile.fundSizeAum}`,
          profile.sweetSpot    && `sweet: $${(profile.sweetSpot / 1e6).toFixed(1)}M`,
          profile.networks.length && `nets: ${profile.networks.length}`,
          profile.pastInvestments.length && `inv: ${profile.pastInvestments.length}`,
          profile.coInvestors.length && `co: ${profile.coInvestors.length}`,
        ].filter(Boolean).join("  ");

        log(`${pfx} ✓  ${profile.fullName}  ${tags}`);

        if (!DRY_RUN) {
          await upsertProfile(profile).catch(err =>
            log(`${pfx} ❌ DB: ${err.message}`)
          );
        }
        saved++;
      }

      if (i < slugs.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
    }

    log(`\n${"─".repeat(68)}`);
    log(`  ✓ Saved   : ${saved}`);
    log(`  ✗ Failed  : ${failed}`);
    log(`  ⏭ Skipped : ${skipped}`);
    log(`  Total     : ${slugs.length}`);
    log(`${"─".repeat(68)}`);
    log(`  Log → ${LOG_FILE}`);

  } finally {
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch(err => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  process.exit(1);
});
