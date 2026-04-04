/**
 * scrape-signal-nfx.ts
 *
 * Authenticated Playwright scraper for signal.nfx.com.
 * Runs headless Chromium, supports optional HTTP/SOCKS5 proxy for IP rotation.
 *
 * Phase auth — Open a headed browser so you can log in manually, then saves
 *              cookies to data/signal-nfx-auth.json for future headless runs.
 *              Run once: SIGNAL_PHASE=auth npm run scrape:signal-nfx
 *
 * Phase 1 — Collect all investor slugs from the /investors directory.
 * Phase 2 — Visit each /investors/{slug} profile and extract:
 *   • name, title, firm name, firm website
 *   • location: city, state, country
 *   • website_url (personal), x_url
 *   • check_size_min / check_size_max  (Investment Range)
 *   • sweet_spot                       (Sweet Spot dollar amount)
 *   • fund size / AUM                  (Current Fund Size → firm_records.aum)
 *   • avatar_url
 *   • networks[]                       e.g. ["Harvard Business School Network", "NFX Network"]
 *   • past_investments[]               [{company, stage, date, round_size_usd, total_raised_usd, co_investors[]}]
 *   • co_investors[]                   [{name, firm, slug}]  — "Investors who invest with"
 *   • sector_rankings[]                Sector & Stage ranking labels
 *
 * Phase 3 — Upsert into Supabase:
 *   firm_records    → website_url, aum, hq_city, hq_state, hq_country, signal_nfx_url, logo_url
 *   firm_investors  → all investor fields above
 *
 * Usage:
 *   npx tsx scripts/scrape-signal-nfx.ts
 *   SIGNAL_DRY_RUN=1 npx tsx scripts/scrape-signal-nfx.ts
 *   SIGNAL_PHASE=1   npx tsx scripts/scrape-signal-nfx.ts   # slugs only
 *   SIGNAL_PHASE=2   npx tsx scripts/scrape-signal-nfx.ts   # profiles only
 *   SIGNAL_MAX=100   npx tsx scripts/scrape-signal-nfx.ts
 *
 * Required env vars (.env.local):
 *   SIGNAL_NFX_EMAIL
 *   SIGNAL_NFX_PASSWORD
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env vars:
 *   SIGNAL_NFX_PROXY        http://user:pass@host:port  or  socks5://host:port
 *   SIGNAL_NFX_PROXY_LIST   comma-separated proxies, round-robined every ROTATE_EVERY profiles
 *   SIGNAL_MAX              cap on profiles to scrape (default: unlimited)
 *   SIGNAL_DELAY_MS         ms between profile requests (default: 1200)
 *   SIGNAL_DRY_RUN          "1" — print output, skip DB writes
 *   SIGNAL_PHASE            "auth" | "1" | "2" | unset = both
 *   SIGNAL_AUTH_FILE        path for saved auth state (default: data/signal-nfx-auth.json)
 *   SIGNAL_SLUGS_FILE       path for slug cache (default: data/signal-nfx-slugs.json)
 *   SIGNAL_HEADLESS         "false" to show the browser window
 *   SIGNAL_ROTATE_EVERY     profiles between IP rotations (default: 200)
 */

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "./lib/loadEnvFiles";

// ── Env ───────────────────────────────────────────────────────────────────────

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

const e   = (n: string) => (process.env[n] || "").trim();
const eInt = (n: string, fb: number) => { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; };
const eBool = (n: string) => ["1","true","yes"].includes(e(n).toLowerCase());

const EMAIL      = e("SIGNAL_NFX_EMAIL");
const PASSWORD   = e("SIGNAL_NFX_PASSWORD");
const SUPA_URL   = e("SUPABASE_URL") || e("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY   = e("SUPABASE_SERVICE_ROLE_KEY");
const DRY_RUN    = eBool("SIGNAL_DRY_RUN");
const HEADLESS   = !["false","0","no"].includes((e("SIGNAL_HEADLESS") || "true").toLowerCase());
const DELAY_MS   = eInt("SIGNAL_DELAY_MS", 1200);
const MAX        = eInt("SIGNAL_MAX", 999_999);
const PHASE      = e("SIGNAL_PHASE") || "both";
const ROTATE_EVERY = eInt("SIGNAL_ROTATE_EVERY", 200);
const SLUGS_FILE = e("SIGNAL_SLUGS_FILE") || join(process.cwd(), "data", "signal-nfx-slugs.json");
const AUTH_FILE  = e("SIGNAL_AUTH_FILE")  || join(process.cwd(), "data", "signal-nfx-auth.json");

const PROXY_LIST: string[] = [
  ...e("SIGNAL_NFX_PROXY_LIST").split(",").map(p => p.trim()).filter(Boolean),
  ...(e("SIGNAL_NFX_PROXY") ? [e("SIGNAL_NFX_PROXY")] : []),
];
let proxyIdx = 0;
const nextProxy = () => PROXY_LIST.length ? PROXY_LIST[proxyIdx++ % PROXY_LIST.length] : null;

const AUTH_AVAILABLE = existsSync(AUTH_FILE);
if (!AUTH_AVAILABLE && PHASE !== "auth") {
  console.warn(`  ⚠️  No auth file found at ${AUTH_FILE}.`);
  console.warn(`     Run once with SIGNAL_PHASE=auth to save your session, then re-run.`);
}
if (!SUPA_URL) throw new Error("SUPABASE_URL not set");
if (!SUPA_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// ── Types ─────────────────────────────────────────────────────────────────────

type InvestorSlug = { slug: string; name: string };

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
  // location
  city: string | null;
  state: string | null;
  country: string | null;
  // socials
  websiteUrl: string | null;
  xUrl: string | null;
  linkedinUrl: string | null;
  avatarUrl: string | null;
  // investment data
  checkSizeMin: number | null;
  checkSizeMax: number | null;
  sweetSpot: number | null;
  fundSizeAum: string | null;
  // enriched arrays
  networks: string[];
  pastInvestments: PastInvestment[];
  coInvestors: CoInvestor[];
  sectorRankings: string[];
};

// ── Browser helpers ───────────────────────────────────────────────────────────

function buildProxy(url: string | null) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return { server: `${u.protocol}//${u.hostname}:${u.port}`, username: u.username || undefined, password: u.password || undefined };
  } catch { return { server: url }; }
}

async function launchBrowser(proxyUrl: string | null = null): Promise<Browser> {
  return chromium.launch({
    headless: HEADLESS,
    proxy: buildProxy(proxyUrl) as any,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });
}

async function stealthContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });
  await ctx.addInitScript(`
    Object.defineProperty(navigator, "webdriver", { get: function() { return false; } });
    window.chrome = { runtime: {} };
  `);
  return ctx;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * PHASE=auth: open a headed browser, wait for the user to log in manually,
 * then save cookies+storage to AUTH_FILE for future headless runs.
 */
async function saveAuthState(): Promise<void> {
  console.log("  🔐 Opening headed browser — log in to signal.nfx.com, then press Enter here...");
  const browser = await chromium.launch({ headless: false, args: ["--no-sandbox"] });
  const ctx     = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page    = await ctx.newPage();
  await page.goto("https://signal.nfx.com/login");

  // Wait for user to complete login (URL changes away from /login)
  await page.waitForURL(url => !url.toString().includes("/login"), { timeout: 120_000 });
  await page.waitForLoadState("networkidle");
  console.log(`  ✅ Detected login → ${page.url()}`);

  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  await ctx.storageState({ path: AUTH_FILE });
  console.log(`  💾 Auth state saved to ${AUTH_FILE}`);
  await browser.close();
}

/**
 * Create a browser context pre-loaded with saved auth state.
 * Throws if AUTH_FILE doesn't exist.
 */
async function stealthContextWithAuth(browser: Browser): Promise<BrowserContext> {
  if (!existsSync(AUTH_FILE)) {
    throw new Error(`Auth file not found: ${AUTH_FILE}. Run SIGNAL_PHASE=auth first.`);
  }
  const ctx = await browser.newContext({
    storageState: AUTH_FILE,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });
  await ctx.addInitScript(`
    Object.defineProperty(navigator, "webdriver", { get: function() { return false; } });
    window.chrome = { runtime: {} };
  `);
  return ctx;
}

async function verifyAuth(page: Page): Promise<void> {
  console.log("  🔐 Verifying session...");
  await page.goto("https://signal.nfx.com/investors", { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  if (page.url().includes("login")) {
    throw new Error(`Session expired or invalid. Delete ${AUTH_FILE} and run SIGNAL_PHASE=auth again.`);
  }
  console.log(`  ✅ Session active → ${page.url()}`);
}

// ── Phase 1: Collect slugs ────────────────────────────────────────────────────

async function collectSlugs(page: Page): Promise<InvestorSlug[]> {
  console.log("\n── Phase 1: Collecting investor slugs ──");
  await page.goto("https://signal.nfx.com/investors", { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  // Clear any active filters
  const clearBtn = page.locator('button:has-text("CLEAR FILTERS"), a:has-text("Clear all")');
  if (await clearBtn.count() > 0) { await clearBtn.first().click(); await page.waitForTimeout(1000); }

  const seen = new Map<string, InvestorSlug>();
  let pageNum = 0;

  // Wait for investor cards to render before extracting slugs
  await page.waitForSelector('a[href^="/investors/"]', { timeout: 15_000 }).catch(() => {});

  while (true) {
    pageNum++;
    const found = await page.evaluate(`
      Array.from(document.querySelectorAll('a[href^="/investors/"]'))
        .map(function(a) { return { slug: (a.getAttribute("href") || "").replace("/investors/", ""), name: (a.textContent || "").trim() }; })
        .filter(function(s) { return s.slug && !s.slug.includes("/") && !s.slug.includes("?") && s.slug.length > 2; })
    `) as InvestorSlug[];
    let added = 0;
    for (const s of found) { if (!seen.has(s.slug)) { seen.set(s.slug, s); added++; } }
    console.log(`  Page ${pageNum}: +${added} new (total: ${seen.size})`);

    const loadMore = page.locator('button:has-text("Load More"), button:has-text("LOAD MORE"), button:has-text("Load More Investors"), button:has-text("LOAD MORE INVESTORS")');
    if (await loadMore.count() === 0) {
      // Fallback: scroll to bottom to trigger infinite scroll
      const prevCount = seen.size;
      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await page.waitForTimeout(2000);
      const newCount = await page.evaluate(`
        Array.from(document.querySelectorAll('a[href^="/investors/"]')).length
      `) as number;
      if (newCount <= prevCount) break; // nothing new loaded
    } else {
      await loadMore.scrollIntoViewIfNeeded();
      await loadMore.click();
      await page.waitForTimeout(2000);
      await page.waitForLoadState("networkidle").catch(() => {});
    }
  }

  const slugs = [...seen.values()];
  console.log(`  ✅ ${slugs.length} slugs collected`);
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(SLUGS_FILE, JSON.stringify(slugs, null, 2));
  console.log(`  💾 Saved → ${SLUGS_FILE}`);
  return slugs;
}

// ── Phase 2: Parse helpers ────────────────────────────────────────────────────

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

// ── Phase 2: Profile scraper ──────────────────────────────────────────────────

async function scrapeProfile(page: Page, slug: string): Promise<InvestorProfile | null> {
  const url = `https://signal.nfx.com/investors/${slug}`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
  } catch { return null; }

  if (page.url().includes("/login")) return null;

  // Pass as string so tsx/esbuild never transforms the browser-side code
  // (avoids "__name is not defined" from esbuild helper injection)
  const raw = await page.evaluate(`(function(profileUrl) {
    var bodyText = document.body.innerText;

    // Label -> value pairs
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

  // ── Post-process ──────────────────────────────────────────────────────────

  // Investment range
  const rangeParts = (raw.rangeRaw || "").match(/\$[\d.]+[BMK]?/gi) || [];
  const checkSizeMin = rangeParts[0] ? parseDollar(rangeParts[0]) : null;
  const checkSizeMax = rangeParts[1] ? parseDollar(rangeParts[1]) : null;
  const sweetSpot    = raw.sweetRaw ? parseDollar(raw.sweetRaw) : null;
  const fundSizeAum  = raw.fundRaw  ? formatAum(raw.fundRaw) : null;

  // Location — simple heuristic: if state looks like a US state keep it, else treat as country
  const US_STATES = new Set(["California","New York","Texas","Florida","Massachusetts",
    "Washington","Illinois","Georgia","Colorado","Connecticut","New Jersey","Pennsylvania",
    "Ohio","North Carolina","Virginia","Maryland","Minnesota","Michigan","Utah","Oregon",
    "Arizona","Nevada","Wisconsin","Indiana","Tennessee","Missouri","Louisiana","Kentucky",
    "Alabama","South Carolina","Iowa","DC","District of Columbia"]);
  const isUSState = US_STATES.has(raw.rawState || "");
  const city    = raw.rawCity  || null;
  const state   = isUSState ? (raw.rawState || null) : null;
  const country = !isUSState && raw.rawState ? raw.rawState : (isUSState ? "USA" : null);

  // Past investments
  const pastInvestments: PastInvestment[] = (raw.investments || []).map(inv => {
    // "Seed RoundFeb 2020$6M" → parse stage, date, round_size
    const stageMatch = inv.details.match(/^([\w\s]+?Round|Pre-Seed|Seed|Series [A-Z]+|Venture|Bridge|Convertible)/i);
    const dateMatch  = inv.details.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i);
    const sizeMatch  = inv.details.match(/\$[\d.]+[BMK]?/i);
    const totalMatch = inv.totalRaised.match(/\$[\d.]+[BMK]?/i);
    const coNames    = inv.coInvestorText
      ? inv.coInvestorText.split(",").map(s => s.replace(/\(.*?\)/g, "").trim()).filter(Boolean)
      : [];
    return {
      company:         inv.company,
      stage:           stageMatch?.[0]?.trim() || null,
      date:            dateMatch?.[0] || null,
      round_size_usd:  sizeMatch?.[0]  ? parseDollar(sizeMatch[0])  : null,
      total_raised_usd: totalMatch?.[0] ? parseDollar(totalMatch[0]) : null,
      co_investors:    coNames,
    };
  });

  // Co-investors — pair up lines (name, firm) and match to slugs
  const coInvSlugMap = new Map((raw.coInvLinks || []).map((l: any) => [l.name, l.slug]));
  const coInvestors: CoInvestor[] = [];
  const lines = raw.coInvLines || [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const name = lines[i];
    const firm = lines[i + 1];
    if (!name || /^[A-Z\s]+$/.test(name)) { i--; continue; } // skip section headers
    coInvestors.push({ name, firm: firm || null, slug: coInvSlugMap.get(name) || null });
  }

  return {
    slug,
    profileUrl: url,
    fullName:   raw.h1,
    title:      raw.title,
    firmName:   raw.firmName,
    firmWebsite: raw.firmWebsite,
    city, state, country,
    websiteUrl:  raw.personalWebsite,
    xUrl:        raw.xUrl,
    linkedinUrl: raw.linkedinUrl,
    avatarUrl:   raw.avatarUrl,
    checkSizeMin,
    checkSizeMax,
    sweetSpot,
    fundSizeAum,
    networks:     raw.networks || [],
    pastInvestments,
    coInvestors,
    sectorRankings: raw.sectorRankings || [],
  };
}

// ── Supabase upsert ───────────────────────────────────────────────────────────

async function upsertProfile(profile: InvestorProfile): Promise<void> {
  // 1. Find firm by name
  const { data: firms } = await supabase
    .from("firm_records")
    .select("id, website_url, aum, hq_city, hq_state, hq_country, signal_nfx_url, logo_url")
    .ilike("firm_name", profile.firmName || "__NOMATCH__")
    .is("deleted_at", null)
    .limit(1);

  const firm = firms?.[0];

  if (firm) {
    const fp: Record<string, any> = {};
    if (!firm.website_url  && profile.firmWebsite) fp.website_url = profile.firmWebsite;
    if (!firm.aum          && profile.fundSizeAum) fp.aum = profile.fundSizeAum;
    if (!firm.hq_city      && profile.city)        fp.hq_city = profile.city;
    if (!firm.hq_state     && profile.state)       fp.hq_state = profile.state;
    if (!firm.hq_country   && profile.country)     fp.hq_country = profile.country;
    if (!firm.logo_url     && profile.avatarUrl)   fp.logo_url = profile.avatarUrl;
    if (!firm.signal_nfx_url) fp.signal_nfx_url =
      `https://signal.nfx.com/firms/${(profile.firmName || "").toLowerCase().replace(/\s+/g, "-")}`;
    if (Object.keys(fp).length > 0) {
      fp.updated_at = new Date().toISOString();
      await supabase.from("firm_records").update(fp).eq("id", firm.id);
    }

    // 2. Upsert investor into firm_investors
    const ip: Record<string, any> = {
      firm_id:         firm.id,
      full_name:       profile.fullName,
      updated_at:      new Date().toISOString(),
    };
    if (profile.title)                          ip.title           = profile.title;
    if (profile.avatarUrl)                      ip.avatar_url      = profile.avatarUrl;
    if (profile.linkedinUrl)                    ip.linkedin_url    = profile.linkedinUrl;
    if (profile.xUrl)                           ip.x_url           = profile.xUrl;
    if (profile.websiteUrl)                     ip.website_url     = profile.websiteUrl;
    if (profile.city)                           ip.city            = profile.city;
    if (profile.state)                          ip.state           = profile.state;
    if (profile.country)                        ip.country         = profile.country;
    if (profile.checkSizeMin != null)           ip.check_size_min  = profile.checkSizeMin;
    if (profile.checkSizeMax != null)           ip.check_size_max  = profile.checkSizeMax;
    if (profile.sweetSpot    != null)           ip.sweet_spot      = profile.sweetSpot;
    if (profile.networks.length > 0)            ip.networks        = profile.networks;
    if (profile.pastInvestments.length > 0)     ip.past_investments = profile.pastInvestments;
    if (profile.coInvestors.length > 0)         ip.co_investors    = profile.coInvestors;
    if (profile.sectorRankings.length > 0)      ip.personal_thesis_tags = profile.sectorRankings;
                                                ip.signal_nfx_url  = profile.profileUrl;

    await supabase
      .from("firm_investors")
      .upsert(ip, { onConflict: "firm_id,full_name", ignoreDuplicates: false })
      .select("id");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── Phase auth ────────────────────────────────────────────────────────────
  if (PHASE === "auth") {
    await saveAuthState();
    return;
  }

  console.log(`\n${"═".repeat(68)}`);
  console.log(`  Signal NFX Scraper  ${DRY_RUN ? "(DRY RUN)" : ""}  headless=${HEADLESS}`);
  console.log(`  Proxies: ${PROXY_LIST.length || "none"}  |  Rotate every: ${ROTATE_EVERY}  |  Delay: ${DELAY_MS}ms`);
  console.log(`${"═".repeat(68)}\n`);

  let browser = await launchBrowser(nextProxy());
  let ctx     = await stealthContextWithAuth(browser);
  let page    = await ctx.newPage();

  try {
    await verifyAuth(page);

    // ── Phase 1 ──────────────────────────────────────────────────────────────
    let slugs: InvestorSlug[] = [];
    if (PHASE === "both" || PHASE === "1") {
      slugs = await collectSlugs(page);
    } else {
      if (!existsSync(SLUGS_FILE)) throw new Error(`Slug file not found: ${SLUGS_FILE}. Run Phase 1 first.`);
      slugs = JSON.parse(readFileSync(SLUGS_FILE, "utf8"));
      console.log(`  Loaded ${slugs.length} slugs from ${SLUGS_FILE}`);
    }
    if (PHASE === "1") { console.log("\n  Phase 1 complete.\n"); return; }

    // ── Phase 2 ──────────────────────────────────────────────────────────────
    const todo = slugs.slice(0, MAX);
    console.log(`\n── Phase 2: Scraping ${todo.length} profiles ──`);

    let saved = 0, failed = 0;

    for (let i = 0; i < todo.length; i++) {
      const { slug, name } = todo[i];
      const pfx = `[${String(i + 1).padStart(5)}/${todo.length}]`;

      // Rotate proxy/browser every ROTATE_EVERY profiles
      if (i > 0 && i % ROTATE_EVERY === 0 && PROXY_LIST.length > 0) {
        console.log(`\n  🔄 Rotating IP (proxy ${proxyIdx % PROXY_LIST.length + 1}/${PROXY_LIST.length})...`);
        await ctx.close().catch(() => {});
        await browser.close().catch(() => {});
        browser = await launchBrowser(nextProxy());
        ctx    = await stealthContextWithAuth(browser);
        page   = await ctx.newPage();
        await verifyAuth(page);
      }

      const profile = await scrapeProfile(page, slug);

      if (!profile || !profile.fullName) {
        console.log(`${pfx} ✗  ${name}`);
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

        console.log(`${pfx} ✓  ${profile.fullName}  ${tags}`);

        if (DRY_RUN) {
          // Print sample of each new field for verification
          if (profile.networks.length)     console.log(`       networks: ${profile.networks.slice(0,3).join(", ")}`);
          if (profile.pastInvestments[0])  console.log(`       invest[0]: ${profile.pastInvestments[0].company} ${profile.pastInvestments[0].stage} ${profile.pastInvestments[0].date}`);
          if (profile.coInvestors[0])      console.log(`       co-inv[0]: ${profile.coInvestors[0].name} @ ${profile.coInvestors[0].firm}`);
          if (profile.xUrl)               console.log(`       x: ${profile.xUrl}`);
          if (profile.websiteUrl)         console.log(`       site: ${profile.websiteUrl}`);
        } else {
          await upsertProfile(profile).catch(err =>
            console.error(`       ❌ DB: ${err.message}`)
          );
        }
        saved++;
      }

      if (i < todo.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log(`\n${"─".repeat(68)}`);
    console.log(`  ✓ Saved   : ${saved}`);
    console.log(`  ✗ Failed  : ${failed}`);
    console.log(`  Total     : ${todo.length}`);
    console.log(`${"─".repeat(68)}\n`);

  } finally {
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
