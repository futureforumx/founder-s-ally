/**
 * enrich-fund-data.mjs
 * =====================
 * Enriches empty fields in the fund_data table using three sources:
 *   1. CBInsights  — portfolio companies, fund sizes, pct_deployed, deal history
 *   2. NFX Signal  — investment thesis, sectors, stages, geographies, check sizes
 *   3. Tracxn      — fund details, portfolio, investment pace
 *
 * NEVER overwrites existing non-null values — only fills empty/null fields.
 * Progress is saved after each firm so you can resume if interrupted.
 *
 * Usage:
 *   node scripts/enrich-fund-data.mjs                    # all three sources
 *   node scripts/enrich-fund-data.mjs --source=cbi       # CBInsights only
 *   node scripts/enrich-fund-data.mjs --source=nfx       # NFX Signal only
 *   node scripts/enrich-fund-data.mjs --source=tracxn    # Tracxn only
 *   DRY_RUN=true node scripts/enrich-fund-data.mjs       # scrape, no DB writes
 *   HEADLESS=false node scripts/enrich-fund-data.mjs     # show browser
 *   MAX_FIRMS=50 node scripts/enrich-fund-data.mjs       # cap for testing
 *
 * Required env (.env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CBI_EMAIL + CBI_PASSWORD          (for CBInsights)
 *   SIGNAL_NFX_EMAIL + SIGNAL_NFX_PASSWORD  (for NFX Signal)
 *
 * Progress files:
 *   data/enrich-fund-data-progress.json
 *   data/enrich-fund-data-results.jsonl
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { writeFileSync, appendFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Load env from root .env.local first, then cb-insights-scraper/.env
config({ path: join(ROOT, ".env.local") });
config({ path: join(ROOT, "scripts/cb-insights-scraper/.env") });

const SUPABASE_URL        = process.env.SUPABASE_URL || "https://zmnlsdohtwztneamvwaq.supabase.co";
const SUPABASE_KEY        = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const CBI_EMAIL           = process.env.CBI_EMAIL;
const CBI_PASSWORD        = process.env.CBI_PASSWORD;
const NFX_EMAIL           = process.env.SIGNAL_NFX_EMAIL;
const NFX_PASSWORD        = process.env.SIGNAL_NFX_PASSWORD;
const HEADLESS            = process.env.HEADLESS !== "false";
const DRY_RUN             = process.env.DRY_RUN === "true";
const DELAY_MS            = parseInt(process.env.DELAY_MS || "2000", 10);
const MAX_FIRMS           = parseInt(process.env.MAX_FIRMS || "9999", 10);

const args        = process.argv.slice(2);
const sourceFlag  = args.find(a => a.startsWith("--source="))?.split("=")[1];
const RUN_CBI     = !sourceFlag || sourceFlag === "cbi";
const RUN_NFX     = !sourceFlag || sourceFlag === "nfx";
const RUN_TRACXN  = !sourceFlag || sourceFlag === "tracxn";

if (!SUPABASE_KEY) { console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

mkdirSync(join(ROOT, "data"), { recursive: true });
const PROGRESS_FILE = join(ROOT, "data/enrich-fund-data-progress.json");
const RESULTS_FILE  = join(ROOT, "data/enrich-fund-data-results.jsonl");

// ─── Progress tracking ───────────────────────────────────────────────────────

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(readFileSync(PROGRESS_FILE, "utf8")); } catch {}
  }
  return { done: [], failed: [] };
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function logResult(firmName, source, data) {
  appendFileSync(RESULTS_FILE, JSON.stringify({ ts: new Date().toISOString(), firm: firmName, source, data }) + "\n");
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

/** Get all distinct firm names from fund_data that still have empty fields */
async function getFirmsToEnrich() {
  // NOTE: tracxn_raw is excluded here — it may not exist yet.
  // The column is added by ensureSchema() before writing.
  const { data, error } = await db
    .from("fund_data")
    .select("firm_name, firm_slug, nfx_raw, cbinsights_raw, themes, sectors, stages, geographies, portfolio_companies, total_amount_usd, pct_deployed, investment_pace")
    .order("firm_name");

  if (error) { console.error("❌ Failed to fetch firms:", error.message); process.exit(1); }

  // Deduplicate by firm name, check which need enrichment
  const byFirm = new Map();
  for (const row of data) {
    if (!byFirm.has(row.firm_name)) {
      byFirm.set(row.firm_name, {
        firm_name: row.firm_name,
        firm_slug: row.firm_slug,
        needs_cbi:    !row.cbinsights_raw || JSON.stringify(row.cbinsights_raw) === "{}",
        needs_nfx:    !row.nfx_raw        || JSON.stringify(row.nfx_raw) === "{}",
        needs_tracxn: !row.tracxn_raw     || JSON.stringify(row.tracxn_raw) === "{}",
        needs_themes:       !row.themes?.length,
        needs_sectors:      !row.sectors?.length,
        needs_stages:       !row.stages?.length,
        needs_geographies:  !row.geographies?.length,
        needs_portfolio:    !row.portfolio_companies?.length,
        needs_amount:       row.total_amount_usd == null,
        needs_pct:          row.pct_deployed == null,
        needs_pace:         row.investment_pace == null,
      });
    }
  }
  return [...byFirm.values()];
}

/** Update fund_data rows for a firm — only fills null/empty fields */
async function patchFirmRows(firmName, patch) {
  if (DRY_RUN) { console.log(`  [DRY RUN] Would patch "${firmName}":`, JSON.stringify(patch).substring(0, 120)); return; }

  // Remove undefined values from patch
  let cleanPatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (!Object.keys(cleanPatch).length) return;

  const { error } = await db
    .from("fund_data")
    .update(cleanPatch)
    .eq("firm_name", firmName);

  if (error) {
    // If tracxn_raw column is missing, retry without it
    if (error.message?.includes("tracxn_raw")) {
      const { tracxn_raw, ...withoutTracxn } = cleanPatch;
      if (Object.keys(withoutTracxn).length) {
        const { error: e2 } = await db.from("fund_data").update(withoutTracxn).eq("firm_name", firmName);
        if (e2) console.warn(`  ⚠️  DB update failed for "${firmName}": ${e2.message}`);
      }
    } else {
      console.warn(`  ⚠️  DB update failed for "${firmName}": ${error.message}`);
    }
  }
}

// ─── Sleep helper ─────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── CBInsights scraper ───────────────────────────────────────────────────────

async function loginCBI(page) {
  await page.goto("https://app.cbinsights.com/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"], input[name="email"], #email', CBI_EMAIL);
  await page.fill('input[type="password"], input[name="password"], #password', CBI_PASSWORD);
  await page.click('button[type="submit"], .login-btn, [data-testid="login-submit"]');
  await page.waitForURL("**/app.cbinsights.com/**", { timeout: 20000 }).catch(() => {});
  await sleep(2000);
  console.log("  ✅ CBInsights logged in");
}

async function scrapeCBI(page, firmName) {
  try {
    // Search for the firm via CBInsights internal search API
    const searchUrl = `https://app.cbinsights.com/api/search/live?q=${encodeURIComponent(firmName)}&type=investor&limit=5`;
    const searchResp = await page.evaluate(async (url) => {
      const r = await fetch(url, { credentials: "include" });
      return r.ok ? r.json() : null;
    }, searchUrl);

    const hit = searchResp?.results?.find(r =>
      r.name?.toLowerCase().includes(firmName.toLowerCase().split(" ")[0]) ||
      firmName.toLowerCase().includes(r.name?.toLowerCase().split(" ")[0] || "zzz")
    ) || searchResp?.results?.[0];

    if (!hit?.id) return null;

    const profileUrl = `https://app.cbinsights.com/profiles/i/${hit.id}`;
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(2000);

    // Extract data from profile
    const data = await page.evaluate(() => {
      const getText = sel => document.querySelector(sel)?.textContent?.trim() || null;
      const getAll = sel => [...document.querySelectorAll(sel)].map(el => el.textContent?.trim()).filter(Boolean);

      // Portfolio companies
      const portfolioLinks = [...document.querySelectorAll('[data-testid="portfolio-company"], .portfolio-company-name, .company-card-name')].map(el => el.textContent?.trim()).filter(Boolean);

      // Fund data from financials tab (may not be loaded)
      const fundSizes = getAll('.fund-size, [data-field="fundSize"]');

      // Sectors / verticals
      const sectors = getAll('.sector-tag, .vertical-tag, [data-testid="sector"], .tag-pill');

      // Stages
      const stages = getAll('.stage-tag, [data-testid="stage"], .investment-stage');

      // Geographies
      const geos = getAll('.geo-tag, [data-testid="geography"], .location-tag');

      // Description / thesis
      const description = getText('.about-description, [data-testid="description"], .firm-description, .about p');

      // AUM / fund size
      const aum = getText('[data-testid="aum"], .aum-value, .fund-size-value');

      // Total investments count
      const totalInvestments = getText('[data-testid="total-investments"], .investments-count');

      // Deals from deal list
      const deals = [...document.querySelectorAll('.deal-row, .investment-row, [data-testid="deal-item"]')].slice(0, 20).map(el => ({
        company: el.querySelector('.company-name, .deal-company')?.textContent?.trim(),
        amount: el.querySelector('.deal-amount, .amount')?.textContent?.trim(),
        stage: el.querySelector('.deal-stage, .stage')?.textContent?.trim(),
        date: el.querySelector('.deal-date, .date')?.textContent?.trim(),
      })).filter(d => d.company);

      return { portfolioLinks, fundSizes, sectors, stages, geos, description, aum, totalInvestments, deals, profileUrl: window.location.href };
    });

    return { ...data, cbi_id: hit.id, cbi_name: hit.name, cbi_url: profileUrl };
  } catch (e) {
    console.warn(`  ⚠️  CBI scrape failed for "${firmName}": ${e.message}`);
    return null;
  }
}

// ─── NFX Signal scraper ───────────────────────────────────────────────────────

async function loginNFX(page) {
  // Check for saved auth state
  const authFile = join(ROOT, "data/signal-nfx-auth.json");
  if (existsSync(authFile)) {
    console.log("  ✅ NFX Signal using saved auth");
    return; // Context was loaded with storageState
  }
  await page.goto("https://signal.nfx.com/login", { waitUntil: "domcontentloaded" });
  await sleep(2000);
  try {
    await page.fill('input[type="email"], input[name="email"]', NFX_EMAIL, { timeout: 5000 });
    await page.fill('input[type="password"], input[name="password"]', NFX_PASSWORD, { timeout: 5000 });
    await page.click('button[type="submit"]');
    await page.waitForURL("**/signal.nfx.com/**", { timeout: 20000 }).catch(() => {});
    await sleep(3000);
    console.log("  ✅ NFX Signal logged in");
  } catch (e) {
    console.warn("  ⚠️  NFX Signal login failed:", e.message);
  }
}

async function scrapeNFX(page, firmName, firmSlug) {
  try {
    // Try slug first, then search
    const slug = firmSlug || firmName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const url = `https://signal.nfx.com/investors/${slug}`;
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });

    if (!resp?.ok() && resp?.status() !== 200) {
      // Try search API
      const searchUrl = `https://signal.nfx.com/api/v1/search?q=${encodeURIComponent(firmName)}&type=firm`;
      const searchData = await page.evaluate(async (u) => {
        const r = await fetch(u, { credentials: "include" });
        return r.ok ? r.json() : null;
      }, searchUrl);
      const hit = searchData?.results?.[0];
      if (!hit?.slug) return null;
      await page.goto(`https://signal.nfx.com/investors/${hit.slug}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    }

    await sleep(1500);

    const data = await page.evaluate(() => {
      const getText = sel => document.querySelector(sel)?.textContent?.trim() || null;
      const getAll = sel => [...document.querySelectorAll(sel)].map(el => el.textContent?.trim()).filter(Boolean);

      // Thesis / description
      const thesis = getText('.investor-thesis, .about-text, [data-testid="thesis"], .description');

      // Check sizes
      const checkSize = getText('.check-size, [data-testid="check-size"], .investment-range');

      // Sectors
      const sectors = getAll('.sector-tag, .focus-area, [data-testid="sector-tag"]');

      // Stages
      const stages = getAll('.stage-tag, .investment-stage, [data-testid="stage-tag"]');

      // Geographies
      const geos = getAll('.geo-tag, .location, [data-testid="geo-tag"]');

      // Portfolio / past investments
      const portfolio = getAll('.portfolio-company, .past-investment-name, [data-testid="investment-company"]').slice(0, 50);

      // Fund size / AUM
      const aum = getText('.fund-size, [data-testid="aum"], .aum');

      // Themes
      const themes = getAll('.theme-tag, .focus-theme, [data-testid="theme"]');

      // Co-investors
      const coInvestors = getAll('.co-investor-name').slice(0, 20);

      // Signal score if visible
      const signalScore = getText('.signal-score, [data-testid="signal-score"]');

      return { thesis, checkSize, sectors, stages, geos, portfolio, aum, themes, coInvestors, signalScore, profileUrl: window.location.href };
    });

    return data;
  } catch (e) {
    console.warn(`  ⚠️  NFX scrape failed for "${firmName}": ${e.message}`);
    return null;
  }
}

// ─── Tracxn scraper ───────────────────────────────────────────────────────────

async function scrapeTracxn(page, firmName) {
  try {
    // Search Tracxn for the firm
    const searchUrl = `https://tracxn.com/api/3.0/search/investors?q=${encodeURIComponent(firmName)}&limit=5`;
    await page.goto(`https://tracxn.com/explore/Venture-Capital`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(1000);

    // Use search API via fetch (in-page context picks up Tracxn auth cookies)
    const searchData = await page.evaluate(async (name) => {
      try {
        const r = await fetch(`https://tracxn.com/api/3.0/search/investors?q=${encodeURIComponent(name)}&limit=5`, {
          credentials: "include",
          headers: { "Accept": "application/json" }
        });
        return r.ok ? r.json() : null;
      } catch { return null; }
    }, firmName);

    const hit = searchData?.result?.find(r =>
      r.name?.toLowerCase().includes(firmName.toLowerCase().split(" ")[0])
    ) || searchData?.result?.[0];

    if (!hit?.slug && !hit?.id) {
      // Try navigating to the firm page directly
      const directSlug = firmName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await page.goto(`https://tracxn.com/a/investors/${directSlug}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    } else {
      const profilePath = hit.slug ? `/a/investors/${hit.slug}` : `/a/investors/${hit.id}`;
      await page.goto(`https://tracxn.com${profilePath}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    }

    await sleep(2000);

    const data = await page.evaluate(() => {
      const getText = sel => document.querySelector(sel)?.textContent?.trim() || null;
      const getAll = sel => [...document.querySelectorAll(sel)].map(el => el.textContent?.trim()).filter(Boolean);

      // Fund details
      const funds = [...document.querySelectorAll('.fund-row, .fund-item, [data-testid="fund"]')].map(el => ({
        name: el.querySelector('.fund-name')?.textContent?.trim(),
        size: el.querySelector('.fund-size, .fund-amount')?.textContent?.trim(),
        year: el.querySelector('.fund-year, .vintage-year')?.textContent?.trim(),
        status: el.querySelector('.fund-status')?.textContent?.trim(),
      })).filter(f => f.name || f.size);

      // Portfolio
      const portfolio = getAll('.portfolio-company-name, .investment-company, [data-testid="portfolio-item"]').slice(0, 60);

      // Investment pace / deal frequency
      const recentDeals = [...document.querySelectorAll('.deal-item, .investment-row')].slice(0, 24).map(el => ({
        company: el.querySelector('.company-name')?.textContent?.trim(),
        amount: el.querySelector('.amount')?.textContent?.trim(),
        stage: el.querySelector('.stage')?.textContent?.trim(),
        date: el.querySelector('.date')?.textContent?.trim(),
      })).filter(d => d.company);

      // Sectors
      const sectors = getAll('.sector-tag, .vertical-tag, .focus-sector');

      // Stages
      const stages = getAll('.stage-focus, .investment-stage-tag');

      // Geographies
      const geos = getAll('.geography-tag, .location-focus');

      // AUM / fund size total
      const aum = getText('[data-testid="total-aum"], .total-aum, .aum-value');

      // Themes
      const themes = getAll('.theme-tag, .focus-theme');

      return { funds, portfolio, recentDeals, sectors, stages, geos, aum, themes, profileUrl: window.location.href };
    });

    return data;
  } catch (e) {
    console.warn(`  ⚠️  Tracxn scrape failed for "${firmName}": ${e.message}`);
    return null;
  }
}

// ─── Investment pace calculator ───────────────────────────────────────────────

function calcInvestmentPace(deals) {
  if (!deals?.length) return null;
  const datedDeals = deals.filter(d => d.date).map(d => new Date(d.date)).filter(d => !isNaN(d));
  if (datedDeals.length < 2) return deals.length > 5 ? "active" : "moderate";
  datedDeals.sort((a, b) => b - a);
  const newestMs = datedDeals[0].getTime();
  const oldestMs = datedDeals[datedDeals.length - 1].getTime();
  const monthsSpan = (newestMs - oldestMs) / (1000 * 60 * 60 * 24 * 30);
  const dealsPerMonth = datedDeals.length / Math.max(monthsSpan, 1);
  if (dealsPerMonth >= 2) return "rapid";
  if (dealsPerMonth >= 0.5) return "active";
  if (dealsPerMonth >= 0.2) return "moderate";
  return "slow";
}

// ─── Build patch from scraped data ───────────────────────────────────────────

function buildPatch(firm, cbiData, nfxData, tracxnData) {
  const patch = {};

  // CBInsights data
  if (cbiData) {
    patch.cbinsights_raw = cbiData;
    if (firm.needs_portfolio && cbiData.portfolioLinks?.length) {
      patch.portfolio_companies = cbiData.portfolioLinks.map(name => ({ name, source: "cbinsights" }));
      patch.portfolio_count = cbiData.portfolioLinks.length;
    }
    if (firm.needs_sectors && cbiData.sectors?.length)     patch.sectors = cbiData.sectors.slice(0, 8);
    if (firm.needs_stages  && cbiData.stages?.length)      patch.stages  = cbiData.stages.slice(0, 6);
    if (firm.needs_geographies && cbiData.geos?.length)    patch.geographies = cbiData.geos.slice(0, 6);
    if (firm.needs_pace && cbiData.deals?.length)          patch.investment_pace = calcInvestmentPace(cbiData.deals);
  }

  // NFX data (fills in gaps)
  if (nfxData) {
    patch.nfx_raw = nfxData;
    if (firm.needs_themes && nfxData.themes?.length)        patch.themes = nfxData.themes.slice(0, 8);
    if (firm.needs_sectors && !patch.sectors && nfxData.sectors?.length) patch.sectors = nfxData.sectors.slice(0, 8);
    if (firm.needs_stages  && !patch.stages  && nfxData.stages?.length)  patch.stages  = nfxData.stages.slice(0, 6);
    if (firm.needs_geographies && !patch.geographies && nfxData.geos?.length) patch.geographies = nfxData.geos.slice(0, 6);
    if (firm.needs_portfolio && !patch.portfolio_companies && nfxData.portfolio?.length) {
      patch.portfolio_companies = nfxData.portfolio.map(name => ({ name, source: "nfx" }));
      patch.portfolio_count = nfxData.portfolio.length;
    }
  }

  // Tracxn data (fills remaining gaps)
  if (tracxnData) {
    patch.tracxn_raw = tracxnData;
    if (firm.needs_sectors && !patch.sectors && tracxnData.sectors?.length)    patch.sectors = tracxnData.sectors.slice(0, 8);
    if (firm.needs_stages  && !patch.stages  && tracxnData.stages?.length)     patch.stages  = tracxnData.stages.slice(0, 6);
    if (firm.needs_themes  && !patch.themes  && tracxnData.themes?.length)     patch.themes  = tracxnData.themes.slice(0, 8);
    if (firm.needs_geographies && !patch.geographies && tracxnData.geos?.length) patch.geographies = tracxnData.geos.slice(0, 6);
    if (firm.needs_portfolio && !patch.portfolio_companies && tracxnData.portfolio?.length) {
      patch.portfolio_companies = tracxnData.portfolio.map(name => ({ name, source: "tracxn" }));
      patch.portfolio_count = tracxnData.portfolio.length;
    }
    if (firm.needs_pace && !patch.investment_pace && tracxnData.recentDeals?.length) {
      patch.investment_pace = calcInvestmentPace(tracxnData.recentDeals);
    }
  }

  return patch;
}

// ─── Schema migration (adds tracxn_raw if missing) ───────────────────────────

async function ensureSchema() {
  // Verify fund_data is accessible and count rows
  const { count, error: countErr } = await db
    .from("fund_data")
    .select("*", { count: "exact", head: true });

  if (countErr) {
    console.error("❌ Cannot access fund_data table:", countErr.message);
    console.error("   Make sure SUPABASE_SERVICE_ROLE_KEY is set correctly in .env.local");
    process.exit(1);
  }
  console.log(`✅ fund_data accessible — ${count} rows`);

  // Add tracxn_raw column via a test-insert approach:
  // Try inserting a dummy value into tracxn_raw on a non-existent row — if it 404s the column
  // is missing, so we add it via the Supabase management REST endpoint.
  const { error: colErr } = await db
    .from("fund_data")
    .update({ tracxn_raw: {} })
    .eq("id", "00000000-0000-0000-0000-000000000000"); // no row will match

  if (colErr?.message?.includes("tracxn_raw")) {
    console.log("🔧 Adding missing tracxn_raw column...");
    // Use the pg REST endpoint with the service key
    const mgmtUrl = `${SUPABASE_URL.replace("https://", "https://api.")}/v1/projects/${SUPABASE_URL.split("//")[1].split(".")[0]}/database/query`;
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ sql: "ALTER TABLE public.fund_data ADD COLUMN IF NOT EXISTS tracxn_raw JSONB DEFAULT '{}'::jsonb;" })
      });
      if (r.ok) { console.log("  ✅ tracxn_raw column added"); }
      else {
        console.warn("  ⚠️  Could not auto-add tracxn_raw column. Run this SQL in Supabase dashboard:");
        console.warn("      ALTER TABLE public.fund_data ADD COLUMN IF NOT EXISTS tracxn_raw JSONB DEFAULT '{}'::jsonb;");
        console.warn("      https://supabase.com/dashboard/project/zmnlsdohtwztneamvwaq/sql/new");
        console.warn("  Continuing — Tracxn data will be skipped until column exists.\n");
      }
    } catch {
      console.warn("  ⚠️  Run this in Supabase SQL editor to enable Tracxn storage:");
      console.warn("      ALTER TABLE public.fund_data ADD COLUMN IF NOT EXISTS tracxn_raw JSONB DEFAULT '{}'::jsonb;");
      console.warn("      https://supabase.com/dashboard/project/zmnlsdohtwztneamvwaq/sql/new\n");
    }
  } else {
    console.log("  ✅ tracxn_raw column present");
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 fund_data enrichment — CBInsights:${RUN_CBI} NFX:${RUN_NFX} Tracxn:${RUN_TRACXN} DryRun:${DRY_RUN}\n`);

  await ensureSchema();
  const firms = await getFirmsToEnrich();
  console.log(`📋 Found ${firms.length} firms in fund_data`);

  const progress = loadProgress();
  const toProcess = firms
    .filter(f => !progress.done.includes(f.firm_name))
    .filter(f => RUN_CBI ? f.needs_cbi : true || RUN_NFX ? f.needs_nfx : true || RUN_TRACXN ? f.needs_tracxn : true)
    .slice(0, MAX_FIRMS);

  console.log(`⏭️  Skipping ${progress.done.length} already done. Processing ${toProcess.length} firms.\n`);

  if (!toProcess.length) { console.log("✅ Nothing to enrich."); return; }

  // Launch browser
  const browser = await chromium.launch({ headless: HEADLESS });
  let cbiContext, nfxContext, tracxnContext;
  let cbiPage, nfxPage, tracxnPage;

  try {
    // ── CBInsights session ────────────────────────────────────────────────────
    if (RUN_CBI && CBI_EMAIL && CBI_PASSWORD) {
      cbiContext = await browser.newContext();
      cbiPage = await cbiContext.newPage();
      await loginCBI(cbiPage);
    } else if (RUN_CBI) {
      console.warn("⚠️  CBI_EMAIL/CBI_PASSWORD not set — skipping CBInsights");
    }

    // ── NFX Signal session ────────────────────────────────────────────────────
    if (RUN_NFX) {
      const authFile = join(ROOT, "data/signal-nfx-auth.json");
      const ctxOptions = existsSync(authFile) ? { storageState: authFile } : {};
      nfxContext = await browser.newContext(ctxOptions);
      nfxPage = await nfxContext.newPage();
      if (NFX_EMAIL && NFX_PASSWORD) await loginNFX(nfxPage);
      else console.warn("⚠️  SIGNAL_NFX_EMAIL/PASSWORD not set — will attempt with saved cookies only");
    }

    // ── Tracxn session ────────────────────────────────────────────────────────
    if (RUN_TRACXN) {
      tracxnContext = await browser.newContext();
      tracxnPage = await tracxnContext.newPage();
      // Tracxn may allow some public access — attempt without auth first
      await tracxnPage.goto("https://tracxn.com", { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      await sleep(1000);
    }

    // ── Main loop ─────────────────────────────────────────────────────────────
    let done = 0;
    for (const firm of toProcess) {
      done++;
      const pct = Math.round((done / toProcess.length) * 100);
      console.log(`\n[${done}/${toProcess.length} ${pct}%] ${firm.firm_name}`);

      let cbiData = null, nfxData = null, tracxnData = null;

      if (RUN_CBI && cbiPage) {
        process.stdout.write("  CBI... ");
        cbiData = await scrapeCBI(cbiPage, firm.firm_name);
        console.log(cbiData ? `✓ (${cbiData.portfolioLinks?.length || 0} portfolio cos)` : "—");
        await sleep(DELAY_MS);
      }

      if (RUN_NFX && nfxPage) {
        process.stdout.write("  NFX... ");
        nfxData = await scrapeNFX(nfxPage, firm.firm_name, firm.firm_slug);
        console.log(nfxData ? `✓ (${nfxData.sectors?.length || 0} sectors)` : "—");
        await sleep(DELAY_MS);
      }

      if (RUN_TRACXN && tracxnPage) {
        process.stdout.write("  Tracxn... ");
        tracxnData = await scrapeTracxn(tracxnPage, firm.firm_name);
        console.log(tracxnData ? `✓ (${tracxnData.funds?.length || 0} funds)` : "—");
        await sleep(DELAY_MS);
      }

      // Build patch and write to DB
      const patch = buildPatch(firm, cbiData, nfxData, tracxnData);
      const patchKeys = Object.keys(patch).filter(k => !k.endsWith("_raw"));
      if (Object.keys(patch).length) {
        await patchFirmRows(firm.firm_name, patch);
        if (!DRY_RUN) console.log(`  💾 Wrote: ${Object.keys(patch).join(", ")}`);
      } else {
        console.log("  — No new data found");
      }

      logResult(firm.firm_name, "all", { cbi: !!cbiData, nfx: !!nfxData, tracxn: !!tracxnData, fields: patchKeys });
      progress.done.push(firm.firm_name);
      saveProgress(progress);
    }

    console.log(`\n✅ Done. ${progress.done.length} firms enriched.`);

  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error("❌ Fatal:", e); process.exit(1); });
