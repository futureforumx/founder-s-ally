/**
 * enrich-portfolio-companies.ts
 * ==============================
 * Backfills portfolio company coverage for VC firms using two sources:
 *
 *   Source A — Signal NFX
 *     Tier 1: GraphQL API (fast, structured)
 *     Tier 2: Playwright browser (stealth, auth cookies)
 *
 *   Source B — CB Insights
 *     Playwright browser with saved session (headless by default)
 *     Scrapes the Investments tab — both recent and notable/historical companies
 *
 * For each firm the script:
 *   1. Fetches portfolio companies from both sources
 *   2. Normalizes company names and metadata
 *   3. Merges evidence across sources (per-source evidence row preserved)
 *   4. Upserts canonical portfolio links into firm_recent_deals
 *   5. Inserts portfolio_source_evidence rows
 *   6. Creates enrichment_review_queue items for ambiguous matches
 *   7. Prints full audit + diagnostics at the end
 *
 * Usage:
 *   npx tsx scripts/enrich-portfolio-companies.ts
 *   DRY_RUN=1 npx tsx scripts/enrich-portfolio-companies.ts
 *   PORTFOLIO_LIMIT=10 npx tsx scripts/enrich-portfolio-companies.ts   # small test
 *   PORTFOLIO_FIRM_IDS=id1,id2,id3 npx tsx scripts/enrich-portfolio-companies.ts
 *   PORTFOLIO_SOURCES=signal    # only Signal
 *   PORTFOLIO_SOURCES=cbinsights # only CB Insights
 *   PORTFOLIO_SOURCES=all        # default
 *   HEADLESS=false               # show browser
 *
 * Env (inherited from .env / .env.local / .env.enrichment):
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CBI_EMAIL, CBI_PASSWORD          — CB Insights login
 *   SIGNAL_AUTH_FILE                 — path to saved Signal NFX auth cookies JSON
 *   SIGNAL_NFX_PROXY                 — optional proxy for Signal requests
 *   SIGNAL_HEADLESS                  — default true
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { appendFileSync } from "node:fs";
import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local", ".env.enrichment", "scripts/cb-insights-scraper/.env"]);

// ── Config ────────────────────────────────────────────────────────────────────

const e     = (n: string) => (process.env[n] || "").trim();
const eInt  = (n: string, fb: number) => { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; };
const eBool = (n: string, def = false) => {
  const val = e(n).toLowerCase();
  if (["1","true","yes"].includes(val)) return true;
  if (["0","false","no"].includes(val)) return false;
  return def;
};

const SUPA_URL   = e("SUPABASE_URL") || e("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY   = e("SUPABASE_SERVICE_ROLE_KEY");
const DRY_RUN    = eBool("DRY_RUN");
const LIMIT      = eInt("PORTFOLIO_LIMIT", 9999);
const DELAY_MS   = eInt("PORTFOLIO_DELAY_MS", 2500);
const MAX_RETRIES = eInt("PORTFOLIO_MAX_RETRIES", 3);
const LOG_FILE   = "/tmp/enrich-portfolio-companies.log";
const HEADLESS   = !["false","0","no"].includes((e("SIGNAL_HEADLESS") || e("HEADLESS") || "true").toLowerCase());
const CBI_EMAIL  = e("CBI_EMAIL");
const CBI_PWD    = e("CBI_PASSWORD");

// Which sources to run (default: all)
const SOURCES_RAW = e("PORTFOLIO_SOURCES").toLowerCase() || "all";
const RUN_SIGNAL  = SOURCES_RAW === "all" || SOURCES_RAW === "signal";
const RUN_CBI     = SOURCES_RAW === "all" || SOURCES_RAW === "cbinsights" || SOURCES_RAW === "cb_insights";

// Targeted firm IDs (comma-separated)
const FIRM_IDS_FILTER = e("PORTFOLIO_FIRM_IDS")
  ? e("PORTFOLIO_FIRM_IDS").split(",").map(s => s.trim()).filter(Boolean)
  : [];

if (!SUPA_URL) throw new Error("SUPABASE_URL not set");
if (!SUPA_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

const supabase: SupabaseClient = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const CBI_APP = "https://app.cbinsights.com";

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + "\n"); } catch { /* ignore */ }
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

// ── Normalization ─────────────────────────────────────────────────────────────

const NOISE_WORDS = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|the|plc|sa|ag|gmbh|bv|nv|oy|ab|as|srl|sas|spa|kk)\b\.?/gi;

function normalizeCompanyName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[''`´]/g, "")
    .replace(/[^a-z0-9\s&+]/g, " ")
    .replace(NOISE_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch { return null; }
}

function canonicalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${u.protocol}//${u.hostname}${u.pathname}`.replace(/\/$/, "");
  } catch { return url; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PortfolioCompany = {
  company_name:          string;
  normalized_name:       string;
  website:               string | null;
  linkedin:              string | null;
  slug:                  string | null;
  investment_status:     string | null;  // active | exited | acquired | ipo | unknown
  investment_stage:      string | null;
  investment_date:       string | null;
  is_notable:            boolean;
  source_name:           "signal_nfx" | "cb_insights";
  source_firm_name:      string | null;
  source_url:            string | null;
  source_confidence:     number;
  raw_payload:           object;
};

type FirmRow = {
  id:              string;
  firm_name:       string;
  signal_nfx_url:  string | null;
  cb_insights_url: string | null;
  website_url:     string | null;
};

// ── Global audit counters ─────────────────────────────────────────────────────

const audit = {
  firmsProcessed:          0,
  firmsWithSignal:         0,
  firmsWithCBI:            0,
  portfolioLinksDiscovered: 0,
  newLinksInserted:        0,
  existingLinksUpdated:    0,
  sourceEvidenceAdded:     0,
  reviewItemsCreated:      0,
  failures:                0,
};

// Per-firm diagnostics for the final report
type FirmDiag = {
  id:          string;
  name:        string;
  before:      number;
  afterSignal: number;
  afterCBI:    number;
  afterTotal:  number;
  recentAdded:  number;
  notableAdded: number;
  signalOnly:   boolean;
  cbiOnly:      boolean;
};
const firmDiags: FirmDiag[] = [];

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function retryDb<T>(
  label: string,
  fn: () => Promise<{ data: T | null; error: { message: string } | null }>,
  retries = 3
): Promise<T | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const { data, error } = await fn();
    if (!error) return data;
    log(`  ⚠ ${label} attempt ${attempt}/${retries}: ${error.message}`);
    if (attempt < retries) await sleep(Math.min(5000, 500 * attempt));
  }
  return null;
}

async function loadFirms(): Promise<FirmRow[]> {
  const allRows: FirmRow[] = [];
  let from = 0;
  const PAGE = 200;

  while (true) {
    let q = supabase
      .from("firm_records")
      .select("id, firm_name, signal_nfx_url, cb_insights_url, website_url")
      .is("deleted_at", null)
      .range(from, from + PAGE - 1);

    if (FIRM_IDS_FILTER.length) {
      q = q.in("id", FIRM_IDS_FILTER);
    } else {
      // Only firms that have at least one source URL
      q = q.or("signal_nfx_url.not.is.null,cb_insights_url.not.is.null");
    }

    const data = await retryDb<FirmRow[]>("loadFirms", () => q);
    if (!data?.length) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return allRows.slice(0, LIMIT);
}

async function countExistingLinks(firmId: string): Promise<number> {
  const { count } = await supabase
    .from("firm_recent_deals")
    .select("id", { count: "exact", head: true })
    .eq("firm_id", firmId);
  return count ?? 0;
}

async function upsertPortfolioLink(firmId: string, co: PortfolioCompany): Promise<{ action: "inserted" | "updated" | "skipped"; id: string | null }> {
  if (!co.normalized_name) return { action: "skipped", id: null };

  // Check if a link already exists
  const { data: existing } = await supabase
    .from("firm_recent_deals")
    .select("id, source_confidence, portfolio_company_website, portfolio_company_linkedin, investment_status, source_name")
    .eq("firm_id", firmId)
    .eq("normalized_company_name", co.normalized_name)
    .maybeSingle();

  const row: Record<string, any> = {
    firm_id:                  firmId,
    company_name:             co.company_name,
    normalized_company_name:  co.normalized_name,
    stage:                    co.investment_stage,
    date_announced:           co.investment_date,
    source_name:              co.source_name,
    source_firm_name:         co.source_firm_name,
    investment_status:        co.investment_status,
    is_notable:               co.is_notable,
    source_url:               co.source_url,
    source_confidence:        co.source_confidence,
    raw_payload:              co.raw_payload,
    updated_at:               new Date().toISOString(),
  };

  // Only set website/linkedin if non-null (never overwrite with null)
  if (co.website)  row.portfolio_company_website  = co.website;
  if (co.linkedin) row.portfolio_company_linkedin = co.linkedin;
  if (co.slug)     row.portfolio_company_slug     = co.slug;

  if (existing) {
    // Merge: only overwrite if incoming data is higher confidence OR fills a gap
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (!existing.portfolio_company_website && co.website)  updates.portfolio_company_website  = co.website;
    if (!existing.portfolio_company_linkedin && co.linkedin) updates.portfolio_company_linkedin = co.linkedin;

    // Upgrade investment_status if we have a better value
    const statusPriority: Record<string, number> = { ipo: 4, exited: 3, acquired: 3, active: 2, unknown: 1 };
    const existingP = statusPriority[existing.investment_status || "unknown"] ?? 1;
    const newP      = statusPriority[co.investment_status || "unknown"] ?? 1;
    if (newP > existingP) updates.investment_status = co.investment_status;

    // Mark as merged if now seen from multiple sources
    if (existing.source_name && existing.source_name !== co.source_name && existing.source_name !== "merged") {
      updates.source_name = "merged";
    }

    // If higher confidence data is coming in, update confidence
    if (co.source_confidence > (existing.source_confidence ?? 0.70)) {
      updates.source_confidence = co.source_confidence;
    }

    // Mark is_notable if either source says so
    if (co.is_notable && !existing.is_notable) {
      updates.is_notable = true;
    }

    if (DRY_RUN) {
      log(`  [DRY] UPDATE portfolio link: ${co.company_name} (${firmId})`);
      return { action: "updated", id: existing.id };
    }

    if (Object.keys(updates).length > 1) {
      await supabase.from("firm_recent_deals").update(updates).eq("id", existing.id);
      return { action: "updated", id: existing.id };
    }
    return { action: "skipped", id: existing.id };
  }

  if (DRY_RUN) {
    log(`  [DRY] INSERT portfolio link: ${co.company_name} (${firmId})`);
    return { action: "inserted", id: null };
  }

  const { data: inserted, error } = await supabase
    .from("firm_recent_deals")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    // Conflict on (firm_id, normalized_company_name) — treat as update
    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      return { action: "skipped", id: null };
    }
    log(`  ❌ upsertPortfolioLink: ${error.message}`);
    return { action: "skipped", id: null };
  }

  return { action: "inserted", id: inserted?.id ?? null };
}

async function insertSourceEvidence(
  firmId: string,
  linkId: string | null,  // maps to investment_id in the existing table
  co: PortfolioCompany
): Promise<void> {
  if (!co.normalized_name) return;

  // Parse investment_date string → ISO timestamptz string or null
  // The existing table stores investment_date as timestamptz
  let investmentDateTs: string | null = null;
  if (co.investment_date) {
    const d = new Date(co.investment_date);
    if (!isNaN(d.getTime())) investmentDateTs = d.toISOString();
  }

  const row: Record<string, any> = {
    // investment_id is the FK to firm_recent_deals.id
    investment_id:                     linkId,
    firm_id:                           firmId,
    source_name:                       co.source_name,
    source_firm_name:                  co.source_firm_name,
    portfolio_company_name:            co.company_name,
    normalized_portfolio_company_name: co.normalized_name,
    portfolio_company_website:         co.website,
    portfolio_company_linkedin:        co.linkedin,
    portfolio_company_slug:            co.slug,
    investment_status:                 co.investment_status,
    investment_stage:                  co.investment_stage,
    investment_date:                   investmentDateTs,
    is_notable:                        co.is_notable,
    source_url:                        co.source_url,
    source_confidence:                 co.source_confidence,
    raw_payload:                       co.raw_payload,
    // category maps to our is_notable classification
    category:                          co.is_notable ? "notable" : "recent",
    discovered_at:                     new Date().toISOString(),
  };

  if (DRY_RUN) {
    log(`  [DRY] INSERT source evidence: ${co.source_name}/${co.company_name}`);
    return;
  }

  const { error } = await supabase
    .from("portfolio_source_evidence")
    .upsert(row, { onConflict: "firm_id,source_name,normalized_portfolio_company_name" });

  if (error && !error.message.includes("duplicate")) {
    log(`  ⚠ insertSourceEvidence: ${error.message}`);
  } else {
    audit.sourceEvidenceAdded++;
  }
}

async function createReviewItem(
  entityType: "portfolio_link" | "portfolio_company_match" | "portfolio_firm_mapping",
  entityId: string,
  reason: string,
  reviewData: object
): Promise<void> {
  if (DRY_RUN) {
    log(`  [DRY] REVIEW item: ${entityType}/${entityId} — ${reason}`);
    audit.reviewItemsCreated++;
    return;
  }

  const { error } = await supabase.from("enrichment_review_queue").insert({
    entity_type: entityType,
    entity_id:   entityId,
    reason,
    review_data: reviewData,
    status:      "pending",
  });

  if (error && !error.message.includes("duplicate")) {
    log(`  ⚠ createReviewItem: ${error.message}`);
  } else {
    audit.reviewItemsCreated++;
  }
}

// ── Signal NFX: read past_investments from firm_investors already in DB ───────
//
// Signal NFX stores portfolio data on individual investor pages (/investors/{slug}),
// not on firm pages (/firms/{slug}). The scrape-signal-nfx.ts script already
// collected this data into firm_investors.past_investments as a JSONB array:
//   [{company, stage, date, round_size_usd, total_raised_usd, co_investors[]}]
//
// We aggregate across all investors for a given firm_id and emit one
// PortfolioCompany per unique normalized company name.

async function getSignalPortfolioFromDB(
  firmId: string,
  firmName: string,
  signalUrl: string | null
): Promise<PortfolioCompany[]> {
  // Load all firm_investors for this firm that have past_investments
  const { data: investors, error } = await supabase
    .from("firm_investors")
    .select("id, full_name, past_investments")
    .eq("firm_id", firmId)
    .not("past_investments", "is", null)
    .is("deleted_at", null);

  if (error) {
    log(`  ⚠ Signal DB query error: ${error.message}`);
    return [];
  }
  if (!investors?.length) return [];

  const results: PortfolioCompany[] = [];
  const seen = new Set<string>();

  for (const investor of investors) {
    const investments = investor.past_investments as any[];
    if (!Array.isArray(investments)) continue;

    for (const inv of investments) {
      const rawName = typeof inv === "string" ? inv : (inv?.company || inv?.name || "");
      if (!rawName || rawName.length < 2) continue;

      const norm = normalizeCompanyName(rawName);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);

      // Parse date string like "Feb 2020" or "2020-01-01"
      let investDate: string | null = null;
      const dateStr = inv?.date || inv?.announced_at || null;
      if (dateStr) {
        const monthMatch = String(dateStr).match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i);
        const isoMatch   = String(dateStr).match(/(\d{4}-\d{2}-\d{2})/);
        const yearMatch  = String(dateStr).match(/^(\d{4})$/);
        if (monthMatch) {
          const months: Record<string,string> = {
            jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
            jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
          };
          investDate = `${monthMatch[2]}-${months[monthMatch[1].toLowerCase()]}-01`;
        } else if (isoMatch) {
          investDate = isoMatch[1];
        } else if (yearMatch) {
          investDate = `${yearMatch[1]}-01-01`;
        }
      }

      // Heuristic: mark as recent if within last 3 years
      const year = investDate ? parseInt(investDate.slice(0, 4)) : null;
      const isRecent = year ? year >= 2022 : false;

      const stage = inv?.stage || null;

      results.push({
        company_name:      rawName.trim(),
        normalized_name:   norm,
        website:           null,
        linkedin:          null,
        slug:              null,
        investment_status: "active",
        investment_stage:  stage,
        investment_date:   investDate,
        is_notable:        !isRecent && !!investDate, // older investments = more likely notable
        source_name:       "signal_nfx",
        source_firm_name:  firmName,
        source_url:        signalUrl || `https://signal.nfx.com/investors/${investor.full_name?.toLowerCase().replace(/\s+/g, "-")}`,
        source_confidence: 0.80,
        raw_payload:       inv,
      });
    }
  }

  return results;
}

// ── CB Insights: Playwright investments tab scraper ───────────────────────────

let _cbiBrowser:  Browser | null = null;
let _cbiCtx:      BrowserContext | null = null;
let _cbiPage:     Page | null = null;
let _cbiLoggedIn: boolean = false;

async function getCBIBrowser(): Promise<{ browser: Browser; ctx: BrowserContext; page: Page }> {
  if (_cbiBrowser?.isConnected() && _cbiCtx && _cbiPage) {
    return { browser: _cbiBrowser, ctx: _cbiCtx, page: _cbiPage };
  }
  if (_cbiBrowser) try { await _cbiBrowser.close(); } catch { /* ignore */ }

  _cbiBrowser = await chromium.launch({
    headless: HEADLESS,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  _cbiCtx = await _cbiBrowser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });

  await _cbiCtx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins",   { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    (window as any).chrome = { runtime: {} };
  });

  _cbiPage = await _cbiCtx.newPage();

  // Block heavy resources
  await _cbiPage.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,mp4,webm}", r => r.abort());

  _cbiLoggedIn = false;
  return { browser: _cbiBrowser, ctx: _cbiCtx, page: _cbiPage };
}

async function loginToCBI(page: Page): Promise<void> {
  if (_cbiLoggedIn) return;

  log("  🔑 Logging in to CB Insights...");

  await page.goto(`${CBI_APP}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await sleep(3000);

  const url = page.url();
  if (url.includes("app.cbinsights.com") && !url.includes("login")) {
    log("  ✅ Already authenticated");
    _cbiLoggedIn = true;
    return;
  }

  // Accept cookies
  try {
    const cookieBtn = page.locator('button:has-text("Accept"), button:has-text("Got it"), button:has-text("OK")');
    if (await cookieBtn.isVisible({ timeout: 3000 })) {
      await cookieBtn.click();
      await sleep(500);
    }
  } catch { /* no banner */ }

  // Fill email
  const emailInput = page.locator('input[name="email"], input[type="email"], input[id*="email" i], input[name="username"]');
  await emailInput.first().waitFor({ state: "visible", timeout: 20_000 });
  await emailInput.first().fill(CBI_EMAIL);
  await sleep(400);

  // Fill password
  const pwInput = page.locator('input[name="password"], input[type="password"]');
  await pwInput.fill(CBI_PWD);
  await sleep(400);

  // Submit
  const submitBtn = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Continue")');
  await submitBtn.first().click();

  try {
    await page.waitForURL(u => !u.pathname.includes("/login"), { timeout: 45_000 });
  } catch {
    if (!HEADLESS) {
      log("  ⏸️ Pausing 45s for manual CAPTCHA/2FA...");
      await sleep(45_000);
    } else {
      throw new Error("CBI login failed — still on login page. Try HEADLESS=false.");
    }
  }

  if (page.url().includes("/login")) throw new Error("CBI login failed");
  log(`  ✅ CBI logged in: ${page.url()}`);
  _cbiLoggedIn = true;
}

/**
 * Scrape the Investments/Portfolio tab on a CB Insights firm profile.
 * Handles both /profiles/c/ (company) and /profiles/i/ (investor) URL types.
 * Returns both recent and notable/historical investments.
 */
async function scrapeCBIInvestmentsTab(page: Page, profileUrl: string, firmName: string): Promise<PortfolioCompany[]> {
  const results: PortfolioCompany[] = [];

  try {
    // Determine base URL and preferred tab parameter
    // /profiles/i/ = investor profile → try "portfolio" tab
    // /profiles/c/ = company profile  → try "investments" tab
    const baseUrl = profileUrl.split("?")[0];
    const isInvestorProfile = baseUrl.includes("/profiles/i/");
    const primaryTabParam   = isInvestorProfile ? "portfolio" : "investments";
    const investUrl = `${baseUrl}?tab=${primaryTabParam}`;

    await page.goto(investUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await sleep(3000);

    // Click the matching tab if it exists as a nav item (try multiple labels)
    const tabLabels = isInvestorProfile
      ? ["Portfolio", "Investments", "portfolio", "investments"]
      : ["Investments", "Portfolio", "investments", "portfolio"];
    for (const label of tabLabels) {
      try {
        const tab = page.locator(`[role="tab"]:has-text("${label}"), a:has-text("${label}"), button:has-text("${label}")`);
        if (await tab.first().isVisible({ timeout: 2000 })) {
          await tab.first().click();
          await sleep(2000);
          break;
        }
      } catch { /* try next */ }
    }

    // Scroll down to load more investments (lazy loading)
    for (let scroll = 0; scroll < 5; scroll++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await sleep(1500);

      // Click "Load more" / "Show more" buttons if present
      try {
        const moreBtn = page.locator('button:has-text("Load more"), button:has-text("Show more"), button:has-text("See all"), a:has-text("View all investments")');
        if (await moreBtn.first().isVisible({ timeout: 1500 })) {
          await moreBtn.first().click();
          await sleep(2000);
        }
      } catch { /* no more button */ }
    }

    // Extract investment rows from the page DOM
    const raw = await page.evaluate((profUrl: string) => {
      const entries: any[] = [];
      const body = document.body.innerText || "";

      // Strategy 1: find investment table rows
      // CBI investment tables have company name + round + date + amount columns
      const rows = document.querySelectorAll(
        'tr, [data-testid*="investment"], [class*="investment-row"], [class*="InvestmentRow"], [class*="deal-row"]'
      );

      const seen = new Set<string>();

      for (const row of rows) {
        const text = (row as HTMLElement).innerText || "";
        if (!text.trim() || text.length < 3) continue;

        const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
        if (!lines.length) continue;

        // First line is usually the company name (a link)
        const nameLink = row.querySelector('a[href*="/profiles/"]') as HTMLAnchorElement | null;
        const name = nameLink?.textContent?.trim() || lines[0];
        if (!name || name.length < 2 || seen.has(name)) continue;
        seen.add(name);

        const href = nameLink?.href || "";

        // Round / Stage
        const stageMatch = text.match(/\b(Pre-Seed|Seed|Series [A-Z]+|Growth|Angel|Convertible Note|SAFE|Debt|IPO|Acquired|Merger|Buyout|Grant)\b/i);
        // Date
        const dateMatch = text.match(/\b(\w+ \d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4})\b/);
        // Amount
        const amountMatch = text.match(/\$[\d,.]+\s*[BMK]?/i);

        entries.push({
          name,
          href,
          stage: stageMatch ? stageMatch[1] : null,
          date:  dateMatch  ? dateMatch[1]  : null,
          amount: amountMatch ? amountMatch[0] : null,
          raw_text: text.slice(0, 400),
          is_notable: false,
        });
      }

      // Strategy 2: if table approach found nothing, parse company links from profile page
      if (entries.length === 0) {
        const profileLinks = document.querySelectorAll('a[href*="/profiles/c/"]');
        for (const link of profileLinks) {
          const name = (link as HTMLElement).innerText?.trim();
          if (!name || name.length < 2 || seen.has(name)) continue;
          seen.add(name);

          entries.push({
            name,
            href: (link as HTMLAnchorElement).href,
            stage: null,
            date: null,
            amount: null,
            raw_text: (link.closest("[class]") as HTMLElement)?.innerText?.slice(0, 200) || name,
            is_notable: false,
          });
        }
      }

      // Strategy 3: look for "Notable Exits" / "Most Valuable" sections
      const notableHeadings = [...document.querySelectorAll("*")].filter(el => {
        const t = (el as HTMLElement).textContent?.trim() || "";
        return /notable exits?|most valued|biggest exits?|flagships?/i.test(t) && el.children.length <= 3;
      });

      for (const heading of notableHeadings) {
        const section = heading.closest("[class]") || heading.parentElement;
        if (!section) continue;
        const links = section.querySelectorAll('a[href*="/profiles/"]');
        for (const link of links) {
          const name = (link as HTMLElement).innerText?.trim();
          if (!name || seen.has(name)) continue;
          seen.add(name);
          entries.push({
            name,
            href: (link as HTMLAnchorElement).href,
            stage: "exited",
            date: null,
            amount: null,
            raw_text: (link.closest("[class]") as HTMLElement)?.innerText?.slice(0, 200) || name,
            is_notable: true,
          });
        }
      }

      return entries;
    }, profileUrl);

    // Parse dates
    for (const inv of raw) {
      if (!inv.name) continue;
      const norm = normalizeCompanyName(inv.name);
      if (!norm) continue;

      // Parse date
      let investDate: string | null = null;
      if (inv.date) {
        const d = new Date(inv.date);
        if (!isNaN(d.getTime())) {
          investDate = d.toISOString().slice(0, 10);
        } else if (/^\d{4}$/.test(inv.date)) {
          investDate = `${inv.date}-01-01`;
        }
      }

      // Infer status
      let status: string = "active";
      if (/ipo/i.test(inv.stage || "")) status = "ipo";
      else if (/acquired|merger|buyout/i.test(inv.stage || "")) status = "acquired";
      else if (inv.is_notable) status = "exited";

      // Determine is_notable: either tagged above, or stage=exited, or appeared in notable section
      const isNotable = inv.is_notable || /notable|flagship/i.test(inv.raw_text || "");

      // Is this a recent company? Heuristic: date within last 3 years
      let isRecent = false;
      if (investDate) {
        const year = parseInt(investDate.slice(0, 4));
        isRecent = year >= 2022;
      }

      results.push({
        company_name:      inv.name,
        normalized_name:   norm,
        website:           null,
        linkedin:          null,
        slug:              null,
        investment_status: status,
        investment_stage:  inv.stage,
        investment_date:   investDate,
        is_notable:        isNotable,
        source_name:       "cb_insights",
        source_firm_name:  firmName,
        source_url:        profileUrl,
        source_confidence: 0.80,
        raw_payload:       inv,
      });
    }

    log(`  🔬 CBI: ${results.length} companies from ${profileUrl}`);
  } catch (err: any) {
    log(`  ⚠ CBI investments scrape error (${profileUrl}): ${err.message}`);
    if (err.message?.includes("closed") || err.message?.includes("crashed")) {
      _cbiCtx = null; _cbiBrowser = null; _cbiPage = null; _cbiLoggedIn = false;
    }
  }

  return results;
}

// ── Merge logic ───────────────────────────────────────────────────────────────

/**
 * Given companies from multiple sources, merge by normalized name.
 * Returns one merged PortfolioCompany per unique normalized name,
 * plus the list of duplicates that should be flagged for review if
 * normalized names are similar but not identical.
 */
function mergeCompanies(all: PortfolioCompany[]): {
  merged: PortfolioCompany[];
  reviewPairs: Array<{ a: PortfolioCompany; b: PortfolioCompany; reason: string }>;
} {
  const byName = new Map<string, PortfolioCompany[]>();

  for (const co of all) {
    const key = co.normalized_name;
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(co);
  }

  const merged: PortfolioCompany[] = [];
  const reviewPairs: Array<{ a: PortfolioCompany; b: PortfolioCompany; reason: string }> = [];

  for (const [, group] of byName) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    // Multiple sources — pick the best values
    const base = { ...group[0] };

    for (const co of group.slice(1)) {
      if (!base.website && co.website)        base.website = co.website;
      if (!base.linkedin && co.linkedin)      base.linkedin = co.linkedin;
      if (!base.slug && co.slug)              base.slug = co.slug;
      if (!base.investment_stage && co.investment_stage) base.investment_stage = co.investment_stage;
      if (!base.investment_date && co.investment_date)   base.investment_date = co.investment_date;
      if (co.is_notable) base.is_notable = true;

      // Prefer higher confidence data
      if (co.source_confidence > base.source_confidence) {
        base.source_confidence = co.source_confidence;
        if (co.investment_status) base.investment_status = co.investment_status;
      }

      // Mark as merged across sources
      if (co.source_name !== base.source_name) {
        base.source_name = "merged" as any;
      }
    }

    merged.push(base);
  }

  // Check for near-duplicate pairs (different normalized names but similar)
  // Simple prefix-based similarity: if one name starts with the other
  const mergedNames = Array.from(byName.keys());
  for (let i = 0; i < mergedNames.length; i++) {
    for (let j = i + 1; j < mergedNames.length; j++) {
      const a = mergedNames[i];
      const b = mergedNames[j];
      if (a.length < 3 || b.length < 3) continue;

      // Check if one is a prefix of the other (length >= 6)
      const shorter = a.length < b.length ? a : b;
      const longer  = a.length < b.length ? b : a;
      if (shorter.length >= 6 && longer.startsWith(shorter)) {
        reviewPairs.push({
          a: byName.get(a)![0],
          b: byName.get(b)![0],
          reason: `Near-duplicate names: "${a}" / "${b}"`,
        });
      }
    }
  }

  return { merged, reviewPairs };
}

// ── Per-firm orchestration ────────────────────────────────────────────────────

async function processFirm(
  firm: FirmRow,
  cbiBrowserReady: boolean
): Promise<void> {
  const { id: firmId, firm_name, signal_nfx_url, cb_insights_url } = firm;
  log(`\n─── ${firm_name} (${firmId}) ───`);

  const beforeCount = await countExistingLinks(firmId);
  const allCompanies: PortfolioCompany[] = [];
  let gotSignal = false;
  let gotCBI    = false;

  // ── Signal NFX ──
  // Source: firm_investors.past_investments (already collected by scrape-signal-nfx.ts).
  // Signal NFX stores portfolio data on individual investor pages, not firm pages,
  // so we aggregate across all partners/investors for this firm from the DB.
  if (RUN_SIGNAL) {
    const signalCompanies = await getSignalPortfolioFromDB(firmId, firm_name, signal_nfx_url);

    if (signalCompanies.length > 0) {
      gotSignal = true;
      audit.firmsWithSignal++;
      allCompanies.push(...signalCompanies);
      log(`  ✅ Signal (DB): ${signalCompanies.length} companies from investor past_investments`);
    } else {
      log(`  ℹ Signal: 0 past_investments found for this firm's investors`);
    }
  }

  // ── CB Insights ──
  if (RUN_CBI && cb_insights_url) {
    try {
      const { page } = await getCBIBrowser();
      await loginToCBI(page);

      let cbiCompanies: PortfolioCompany[] = [];
      let attempt = 0;

      while (attempt < MAX_RETRIES && cbiCompanies.length === 0) {
        attempt++;
        try {
          cbiCompanies = await scrapeCBIInvestmentsTab(page, cb_insights_url, firm_name);
        } catch (err: any) {
          log(`  ⚠ CBI attempt ${attempt}/${MAX_RETRIES}: ${err.message}`);
          if (attempt < MAX_RETRIES) {
            await sleep(DELAY_MS);
            // Reset to app home
            try {
              const { page: p } = await getCBIBrowser();
              await p.goto(`${CBI_APP}/chat-cbi`, { waitUntil: "domcontentloaded", timeout: 20_000 });
              await sleep(2000);
            } catch { /* ignore nav error */ }
          }
        }
      }

      if (cbiCompanies.length > 0) {
        gotCBI = true;
        audit.firmsWithCBI++;
        allCompanies.push(...cbiCompanies);
        log(`  ✅ CBI: ${cbiCompanies.length} companies`);
      } else {
        log(`  ℹ CBI: 0 companies found`);
      }
    } catch (err: any) {
      log(`  ❌ CBI error for ${firm_name}: ${err.message}`);
    }
  }

  // ── Merge ──
  const { merged, reviewPairs } = mergeCompanies(allCompanies);
  audit.portfolioLinksDiscovered += merged.length;

  log(`  🔀 Merged: ${merged.length} unique companies (from ${allCompanies.length} raw entries)`);

  // ── Write ──
  let recentAdded = 0;
  let notableAdded = 0;

  for (const co of merged) {
    try {
      const { action, id: linkId } = await upsertPortfolioLink(firmId, co);

      if (action === "inserted") {
        audit.newLinksInserted++;
        if (co.is_notable) notableAdded++;
        else recentAdded++;
      } else if (action === "updated") {
        audit.existingLinksUpdated++;
      }

      // Insert per-source evidence for every original company (not the merged one)
      const sourceCos = allCompanies.filter(ac => ac.normalized_name === co.normalized_name);
      for (const sc of sourceCos) {
        await insertSourceEvidence(firmId, linkId, sc);
      }
    } catch (err: any) {
      log(`  ❌ write error for ${co.company_name}: ${err.message}`);
      audit.failures++;
    }
  }

  // ── Review items ──
  for (const { a, b, reason } of reviewPairs) {
    await createReviewItem("portfolio_company_match", `${firmId}:${a.normalized_name}:${b.normalized_name}`, reason, {
      firm_id: firmId,
      firm_name,
      company_a: { name: a.company_name, normalized: a.normalized_name, source: a.source_name },
      company_b: { name: b.company_name, normalized: b.normalized_name, source: b.source_name },
    });
  }

  const afterTotal = await countExistingLinks(firmId);

  firmDiags.push({
    id:           firmId,
    name:         firm_name,
    before:       beforeCount,
    afterSignal:  gotSignal ? allCompanies.filter(c => c.source_name === "signal_nfx").length : 0,
    afterCBI:     gotCBI    ? allCompanies.filter(c => c.source_name === "cb_insights").length : 0,
    afterTotal,
    recentAdded,
    notableAdded,
    signalOnly:   gotSignal && !gotCBI,
    cbiOnly:      gotCBI   && !gotSignal,
  });

  audit.firmsProcessed++;
  log(`  📋 Before: ${beforeCount} → After: ${afterTotal} (+${afterTotal - beforeCount})`);
}

// ── Audit / diagnostics output ────────────────────────────────────────────────

function printAudit(): void {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              PORTFOLIO ENRICHMENT AUDIT SUMMARY             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  console.log("\n📊 Run Summary:");
  console.log(`   Firms processed:              ${audit.firmsProcessed}`);
  console.log(`   Firms with Signal data:        ${audit.firmsWithSignal}`);
  console.log(`   Firms with CB Insights data:   ${audit.firmsWithCBI}`);
  console.log(`   Portfolio links discovered:    ${audit.portfolioLinksDiscovered}`);
  console.log(`   New portfolio links inserted:  ${audit.newLinksInserted}`);
  console.log(`   Existing links updated:        ${audit.existingLinksUpdated}`);
  console.log(`   Source evidence rows added:    ${audit.sourceEvidenceAdded}`);
  console.log(`   Review items created:          ${audit.reviewItemsCreated}`);
  console.log(`   Failures:                      ${audit.failures}`);

  // ── Diagnostic 1: Firms with zero portfolio companies after run ──
  const zeroCoverage = firmDiags.filter(d => d.afterTotal === 0);
  console.log(`\n🔴 Firms with ZERO portfolio companies after run (${zeroCoverage.length}):`);
  for (const d of zeroCoverage.slice(0, 20)) {
    console.log(`   - ${d.name} (${d.id})`);
  }
  if (zeroCoverage.length > 20) console.log(`   ... and ${zeroCoverage.length - 20} more`);

  // ── Diagnostic 2: Signal-only ──
  const signalOnly = firmDiags.filter(d => d.signalOnly);
  console.log(`\n🟡 Firms where Signal found companies but CBI found none (${signalOnly.length}):`);
  for (const d of signalOnly.slice(0, 15)) {
    console.log(`   - ${d.name}: ${d.afterSignal} from Signal`);
  }

  // ── Diagnostic 3: CBI-only ──
  const cbiOnly = firmDiags.filter(d => d.cbiOnly);
  console.log(`\n🟠 Firms where CBI found companies but Signal found none (${cbiOnly.length}):`);
  for (const d of cbiOnly.slice(0, 15)) {
    console.log(`   - ${d.name}: ${d.afterCBI} from CBI`);
  }

  // ── Diagnostic 4: Material coverage increase ──
  const materiallyCovered = firmDiags
    .filter(d => d.afterTotal - d.before >= 5)
    .sort((a, b) => (b.afterTotal - b.before) - (a.afterTotal - a.before));
  console.log(`\n🟢 Firms where coverage increased materially (≥5 new) (${materiallyCovered.length}):`);
  for (const d of materiallyCovered.slice(0, 15)) {
    console.log(`   - ${d.name}: ${d.before} → ${d.afterTotal} (+${d.afterTotal - d.before})`);
  }

  // ── Diagnostic 5: Top firms by recent companies added ──
  const topRecent = firmDiags
    .filter(d => d.recentAdded > 0)
    .sort((a, b) => b.recentAdded - a.recentAdded)
    .slice(0, 10);
  console.log("\n📈 Top firms by recent companies added:");
  for (const d of topRecent) {
    console.log(`   - ${d.name}: +${d.recentAdded} recent`);
  }

  // ── Diagnostic 6: Top firms by notable companies added ──
  const topNotable = firmDiags
    .filter(d => d.notableAdded > 0)
    .sort((a, b) => b.notableAdded - a.notableAdded)
    .slice(0, 10);
  console.log("\n⭐ Top firms by notable companies added:");
  for (const d of topNotable) {
    console.log(`   - ${d.name}: +${d.notableAdded} notable`);
  }

  console.log("\n" + "─".repeat(64) + "\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║         Portfolio Company Coverage Enrichment Pipeline       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`  Mode:     ${DRY_RUN ? "🧪 DRY RUN" : "🔴 LIVE"}`);
  console.log(`  Headless: ${HEADLESS}`);
  console.log(`  Sources:  ${[RUN_SIGNAL ? "Signal NFX" : null, RUN_CBI ? "CB Insights" : null].filter(Boolean).join(" + ")}`);
  console.log(`  Limit:    ${LIMIT === 9999 ? "all" : LIMIT} firms`);
  if (FIRM_IDS_FILTER.length) console.log(`  Filter:   ${FIRM_IDS_FILTER.length} specific firm IDs`);
  console.log();

  // Validate CB Insights credentials
  if (RUN_CBI && (!CBI_EMAIL || !CBI_PWD)) {
    log("⚠ CBI_EMAIL or CBI_PASSWORD not set — CB Insights scraping will be skipped");
  }

  // Load firms
  log("📋 Loading firms from firm_records...");
  const firms = await loadFirms();
  log(`  Found ${firms.length} firms to process`);

  if (!firms.length) {
    log("No firms to process. Exiting.");
    return;
  }

  // Initialise CB Insights browser (warm up session once, not per firm)
  let cbiBrowserReady = false;
  if (RUN_CBI && CBI_EMAIL && CBI_PWD) {
    try {
      const { page } = await getCBIBrowser();
      await loginToCBI(page);
      cbiBrowserReady = true;
    } catch (err: any) {
      log(`❌ CB Insights login failed: ${err.message}. CBI scraping will be skipped.`);
    }
  }

  // Process each firm
  for (const firm of firms) {
    try {
      await processFirm(firm, cbiBrowserReady);
    } catch (err: any) {
      log(`❌ Fatal error for firm ${firm.firm_name}: ${err.message}`);
      audit.failures++;
    }
    await sleep(DELAY_MS);
  }

  // Tear down CBI browser
  if (_cbiBrowser) try { await _cbiBrowser.close(); } catch { /* ignore */ }

  // Print audit + diagnostics
  printAudit();
}

main().catch(err => {
  log(`💥 Unhandled error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
