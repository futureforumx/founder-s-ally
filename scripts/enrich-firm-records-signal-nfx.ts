/**
 * enrich-firm-records-signal-nfx.ts
 *
 * Fills missing fields in firm_records using a multi-tier strategy:
 *
 *   Pass 1 — locations_jsonb:  Extract hq_city/state/country from stored
 *            locations jsonb on firm_records (no network).
 *
 *   Pass 2 — cross_pollinate:  Match individual-investor stub firm_records
 *            to their firm_investors record, pull data from the parent firm.
 *
 *   Pass 3 — signal_fetch:    For firm_records with signal_nfx_url LIKE '/firms/%'
 *            that are still missing fields:
 *              Tier A: Signal NFX GraphQL API (fast, structured JSON)
 *              Tier B: Local Playwright stealth browser + saved auth cookies
 *            Only attempted for firms with /firms/ slugs and missing fields.
 *
 *   Pass 4 — check_sizes:     Aggregate min/max check_size from firm_investors.
 *
 * Usage:
 *   npx tsx scripts/enrich-firm-records-signal-nfx.ts
 *   DRY_RUN=1 npx tsx scripts/enrich-firm-records-signal-nfx.ts
 *   SIGNAL_PASS=locations_jsonb   # only pass 1
 *   SIGNAL_PASS=cross_pollinate   # only pass 2
 *   SIGNAL_PASS=signal_fetch      # only pass 3 (GraphQL → Playwright)
 *   SIGNAL_PASS=check_sizes       # only pass 4
 *   SIGNAL_PASS=all               # default — all four passes
 *   SIGNAL_LIMIT=500              # cap records for pass 3 (default 500)
 *   SIGNAL_CONCURRENCY=2          # parallel requests for pass 3 (default 2)
 *   SIGNAL_DELAY_MS=300           # delay between requests (default 300)
 *
 * Env:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SIGNAL_NFX_PROXY     (optional: http://user:pass@host:port)
 *   SIGNAL_HEADLESS      (default: true — set "false" to see the browser)
 *   SIGNAL_AUTH_FILE    (default: data/signal-nfx-auth.json)
 */

import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "playwright";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

// ── Config ────────────────────────────────────────────────────────────────────
const e     = (n: string) => (process.env[n] || "").trim();
const eInt  = (n: string, fb: number) => { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; };
const eBool = (n: string) => ["1", "true", "yes"].includes(e(n).toLowerCase());

const SUPA_URL      = e("SUPABASE_URL") || e("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY      = e("SUPABASE_SERVICE_ROLE_KEY");
const DRY_RUN       = eBool("DRY_RUN");
const PASS          = e("SIGNAL_PASS") || "all";
const LIMIT         = eInt("SIGNAL_LIMIT", 500);
const CONCURRENCY   = eInt("SIGNAL_CONCURRENCY", 2);
const DELAY_MS      = eInt("SIGNAL_DELAY_MS", 300);
const LOG_FILE      = "/tmp/enrich-firm-records-signal-nfx.log";
const AUTH_FILE     = e("SIGNAL_AUTH_FILE") || join(process.cwd(), "data", "signal-nfx-auth.json");
const DB_PAGE_SIZE  = eInt("SIGNAL_DB_PAGE_SIZE", 200);
const DB_RETRIES    = eInt("SIGNAL_DB_RETRIES", 4);

// Browser fallback config (local Playwright with stealth + auth cookies)
const HEADLESS = !["false", "0", "no"].includes((e("SIGNAL_HEADLESS") || "true").toLowerCase());
const PROXY_URL = e("SIGNAL_NFX_PROXY") || null;

if (!SUPA_URL) throw new Error("SUPABASE_URL not set");
if (!SUPA_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// ── Logging ───────────────────────────────────────────────────────────────────
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + "\n"); } catch { /* ignore */ }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryDbQuery<T>(label: string, fn: () => Promise<{ data: T; error: { message: string } | null }>): Promise<T> {
  let attempt = 0;
  let lastError: string | null = null;

  while (attempt < DB_RETRIES) {
    attempt += 1;
    const { data, error } = await fn();
    if (!error) return data;
    lastError = error.message;
    const delay = Math.min(8_000, 750 * attempt);
    log(`  ⚠ ${label} failed (attempt ${attempt}/${DB_RETRIES}): ${error.message}`);
    if (attempt < DB_RETRIES) await sleep(delay);
  }

  throw new Error(`${label}: ${lastError ?? "unknown error"}`);
}

// ── Counters for pass 3 ──────────────────────────────────────────────────────
const stats = {
  graphql_ok: 0,
  graphql_403: 0,
  graphql_err: 0,
  browser_ok: 0,
  browser_err: 0,
  patched: 0,
  skipped: 0,
};

// ── Auth (for GraphQL API — may or may not work) ─────────────────────────────
function loadIdJwt(): string | null {
  if (!existsSync(AUTH_FILE)) { log(`  ⚠ Auth file not found: ${AUTH_FILE}`); return null; }
  try {
    const auth = JSON.parse(readFileSync(AUTH_FILE, "utf8"));
    for (const c of auth.cookies) {
      if (c.name === "SIGNAL_ID_JWT") return decodeURIComponent(c.value).replace(/^"|"$/g, "");
    }
    log("  ⚠ SIGNAL_ID_JWT cookie not found in auth file");
    return null;
  } catch (err: any) {
    log(`  ⚠ Failed to parse auth file: ${err.message}`);
    return null;
  }
}

// ── GraphQL client (Tier A) ──────────────────────────────────────────────────
const GQL = "https://signal-api.nfx.com/graphql";

const FIRM_QUERY = `
query FirmDetail($slug: String!) {
  firm(slug: $slug) {
    id slug name description founding_year linkedin_url website_url
    locations { id name display_name }
    investor_lists { id stage_name slug vertical { id display_name } }
  }
}`;

type GqlResult = { ok: boolean; data?: any; blocked?: boolean; message?: string };

async function gql(idJwt: string, query: string, variables: Record<string, any>): Promise<GqlResult> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15_000);

    const resp = await fetch(GQL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idJwt}`,
        "Content-Type": "application/json",
        Origin: "https://signal.nfx.com",
        Referer: "https://signal.nfx.com/investors",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    clearTimeout(t);

    if (!resp.ok) {
      const body = await resp.text();
      const blocked = resp.status === 403 && body.includes("Just a moment");
      return { ok: false, blocked, message: `HTTP ${resp.status}` };
    }

    const json = await resp.json();
    if (json.errors) {
      return { ok: false, blocked: false, message: json.errors.map((e: any) => e.message).join("; ") };
    }
    return { ok: true, data: json.data };
  } catch (err: any) {
    return { ok: false, blocked: false, message: err.message };
  }
}

// ── Playwright browser client (Tier B) ───────────────────────────────────────
// Local Playwright with stealth mode + saved Signal NFX auth cookies.
// Same pattern as scrape-signal-nfx.ts — proven to bypass Cloudflare.

let _browser: Browser | null = null;
let _context: import("playwright").BrowserContext | null = null;

function buildProxy(proxyUrl: string | null): object | undefined {
  if (!proxyUrl) return undefined;
  try {
    const u = new URL(proxyUrl);
    return {
      server: `${u.protocol}//${u.hostname}:${u.port}`,
      ...(u.username ? { username: u.username, password: u.password } : {}),
    };
  } catch { return undefined; }
}

async function getStealthBrowser(): Promise<{ browser: Browser; context: import("playwright").BrowserContext }> {
  if (_browser?.isConnected() && _context) return { browser: _browser, context: _context };

  // Close stale handles
  if (_browser) try { await _browser.close(); } catch { /* ignore */ }

  log(`  Launching stealth Playwright browser (headless=${HEADLESS})…`);
  _browser = await chromium.launch({
    headless: HEADLESS,
    proxy: buildProxy(PROXY_URL) as any,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  // Create context with saved auth cookies (same as scrape-signal-nfx.ts)
  _context = await _browser.newContext({
    ...(existsSync(AUTH_FILE) ? { storageState: AUTH_FILE } : {}),
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });

  await _context.addInitScript(`
    Object.defineProperty(navigator, "webdriver", { get: function() { return false; } });
    window.chrome = { runtime: {} };
  `);

  return { browser: _browser, context: _context };
}

async function closeBrowser(): Promise<void> {
  if (_context) try { await _context.close(); } catch { /* ignore */ }
  if (_browser) try { await _browser.close(); } catch { /* ignore */ }
  _context = null;
  _browser = null;
}

async function playwrightFetch(url: string): Promise<string | null> {
  let page: Page | null = null;
  try {
    const { context } = await getStealthBrowser();
    page = await context.newPage();

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Wait for Cloudflare challenge to clear — poll for up to 15s
    let attempts = 0;
    while (attempts < 5) {
      const title = await page.title();
      const bodySnippet = await page.evaluate(() => document.body?.innerText?.slice(0, 200) ?? "");
      if (!title.includes("Just a moment") && !bodySnippet.includes("Checking your browser")) break;
      await page.waitForTimeout(3000);
      attempts++;
    }

    // Extract page content: meta tags + rendered text
    const content = await page.evaluate(() => {
      const meta: string[] = [];
      document.querySelectorAll("meta").forEach((m) => {
        const name = m.getAttribute("name") || m.getAttribute("property") || "";
        const val = m.getAttribute("content") || "";
        if (val && (name.includes("description") || name.includes("og:"))) {
          meta.push(`${name}="${val}"`);
        }
      });
      const canonical = document.querySelector("link[rel=canonical]")?.getAttribute("href") || "";
      if (canonical) meta.push(`canonical="${canonical}"`);

      // Also grab any href links (for linkedin_url, website_url extraction)
      const links: string[] = [];
      document.querySelectorAll("a[href]").forEach((a) => {
        const h = a.getAttribute("href") || "";
        if (h.includes("linkedin.com/company") || (!h.includes("signal.nfx.com") && h.startsWith("http"))) {
          links.push(`Website: ${h}`);
        }
      });

      return meta.join("\n") + "\n" + links.slice(0, 10).join("\n") + "\n\n" + (document.body?.innerText ?? "");
    });

    await page.close();

    if (content && content.length > 100 && !content.includes("Just a moment")) {
      return content;
    }
    return null;
  } catch (err: any) {
    log(`  ⚠ Playwright error: ${err.message}`);
    if (page) try { await page.close(); } catch { /* ignore */ }
    // If browser crashed, reset so next call relaunches
    if (err.message?.includes("closed") || err.message?.includes("crashed") || err.message?.includes("disconnected")) {
      _context = null;
      _browser = null;
    }
    return null;
  }
}

// ── Signal firm page parser ──────────────────────────────────────────────────
// Extracts structured fields from Signal NFX firm page content (HTML or markdown)
type ParsedFirmPage = {
  description: string | null;
  founded_year: number | null;
  linkedin_url: string | null;
  website_url: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
};

function parseSignalFirmPage(content: string): ParsedFirmPage {
  const result: ParsedFirmPage = {
    description: null,
    founded_year: null,
    linkedin_url: null,
    website_url: null,
    hq_city: null,
    hq_state: null,
    hq_country: null,
  };

  if (!content || content.length < 50) return result;

  // ── LinkedIn URL ──
  const linkedinMatch = content.match(/https?:\/\/(?:www\.)?linkedin\.com\/company\/[a-zA-Z0-9_-]+\/?/);
  if (linkedinMatch) result.linkedin_url = linkedinMatch[0].replace(/\/$/, "");

  // ── Website URL ──
  // Look for "Website" label followed by a URL, or og:url / canonical
  const websitePatterns = [
    /(?:Website|Homepage|Web)\s*[:\]]\s*(https?:\/\/[^\s"<>]+)/i,
    /(?:og:url|canonical)[^>]*content="(https?:\/\/(?!signal\.nfx\.com)[^\s"]+)"/i,
    /\[(?:Website|Visit|Homepage)\]\((https?:\/\/[^\s)]+)\)/i,
  ];
  for (const pat of websitePatterns) {
    const m = content.match(pat);
    if (m && m[1] && !m[1].includes("signal.nfx.com") && !m[1].includes("linkedin.com")) {
      result.website_url = m[1].replace(/\/$/, "");
      break;
    }
  }

  // ── Founding year ──
  const yearPatterns = [
    /(?:Founded|Established|Since|Year Founded)[:\s]*(\d{4})/i,
    /founded\s+in\s+(\d{4})/i,
    /(\d{4})\s*[-–—]\s*(?:present|today|now)/i,
  ];
  for (const pat of yearPatterns) {
    const m = content.match(pat);
    if (m) {
      const yr = parseInt(m[1], 10);
      if (yr >= 1950 && yr <= 2026) { result.founded_year = yr; break; }
    }
  }

  // ── Description ──
  // Prefer og:description or meta description
  const descPatterns = [
    /(?:og:description|name="description")[^>]*content="([^"]{30,500})"/i,
    /(?:description|about)\s*[:\]]\s*([^\n]{30,500})/i,
  ];
  for (const pat of descPatterns) {
    const m = content.match(pat);
    if (m && m[1] && !looksLikeChrome(m[1])) {
      result.description = m[1].trim().slice(0, 500);
      break;
    }
  }

  // Fallback description: first substantial paragraph that isn't nav/chrome
  if (!result.description) {
    const paragraphs = content
      .split(/\n\n+/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 60 && p.length < 800 && !looksLikeChrome(p));

    if (paragraphs.length) {
      result.description = paragraphs[0].slice(0, 500);
    }
  }

  // ── Location ──
  const locPatterns = [
    /(?:Headquarters|HQ|Location|Based in)[:\s]*([A-Z][a-zA-Z\s]+,\s*[A-Z][a-zA-Z\s]+)/i,
    /(?:Headquarters|HQ|Location|Based in)[:\s]*([A-Z][a-zA-Z\s]{2,30})/i,
  ];
  for (const pat of locPatterns) {
    const m = content.match(pat);
    if (m && m[1]) {
      const parts = m[1].split(",").map((p) => p.trim());
      if (parts.length >= 2) {
        result.hq_city = parts[0];
        if (COUNTRIES.has(parts[parts.length - 1])) {
          result.hq_country = parts[parts.length - 1];
        } else {
          result.hq_state = parts[parts.length - 1];
        }
      } else if (parts.length === 1 && parts[0].length > 2) {
        if (COUNTRIES.has(parts[0])) {
          result.hq_country = parts[0];
        } else {
          result.hq_city = parts[0];
        }
      }
      break;
    }
  }

  return result;
}

function looksLikeChrome(text: string): boolean {
  return /sign.?in|log.?in|cookie|subscribe|newsletter|terms of service|privacy|©|all rights|copyright|pricing|free trial|click here|toggle menu|skip to/i.test(text);
}

// ── Location parsing (from jsonb) ────────────────────────────────────────────
const COUNTRIES = new Set([
  "United States", "USA", "UK", "United Kingdom", "Canada", "Australia", "India",
  "Germany", "France", "Israel", "China", "Japan", "Singapore", "Brazil",
  "Netherlands", "Sweden", "Switzerland", "Spain", "Ireland", "Denmark",
  "Finland", "Norway", "New Zealand", "South Korea", "UAE", "South Africa",
  "Mexico", "Argentina", "Colombia", "Nigeria", "Middle East", "Saudi Arabia",
  "Italy", "Portugal", "Belgium", "Austria", "Poland", "Czech Republic",
  "Hungary", "Romania", "Turkey", "Indonesia", "Thailand", "Vietnam",
  "Philippines", "Malaysia", "Taiwan", "Hong Kong", "Kenya", "Egypt",
  "Chile", "Peru", "Uruguay", "Costa Rica",
]);

type ParsedLocation = { city: string | null; state: string | null; country: string | null };

function parseLocations(locs: Array<{ name?: string; display_name?: string }>): ParsedLocation {
  if (!locs?.length) return { city: null, state: null, country: null };

  let city: string | null = null;
  let state: string | null = null;
  let country: string | null = null;

  for (const loc of locs) {
    const dn = loc.display_name || loc.name || "";
    const parts = dn.split(",").map((p) => p.trim());
    if (parts.length >= 2) {
      const part0 = parts[0];
      const partLast = parts[parts.length - 1];
      if (!city && !COUNTRIES.has(part0)) city = part0;
      if (COUNTRIES.has(partLast)) {
        if (!country) country = partLast;
      } else {
        if (!state) state = partLast;
      }
    } else if (parts.length === 1) {
      if (COUNTRIES.has(parts[0])) {
        if (!country) country = parts[0];
      } else if (!city) {
        city = parts[0];
      }
    }
  }

  return { city, state, country };
}

// ── Stage mapping ─────────────────────────────────────────────────────────────
const VALID_STAGES = new Set(["Pre-Seed", "Seed", "Series A", "Growth"]);

function mapStage(label: string): string | null {
  if (VALID_STAGES.has(label)) return label;
  const lo = label.toLowerCase();
  if (lo.includes("pre-seed") || lo.includes("pre seed")) return "Pre-Seed";
  if (lo.includes("seed")) return "Seed";
  if (lo.includes("series a")) return "Series A";
  if (lo.includes("growth") || lo.includes("late") || lo.includes("series b") || lo.includes("series c")) return "Growth";
  return null;
}

// ── DB helpers ────────────────────────────────────────────────────────────────
type FirmRow = {
  id: string;
  firm_name: string;
  signal_nfx_url: string;
  description: string | null;
  founded_year: number | null;
  linkedin_url: string | null;
  website_url: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  thesis_verticals: string[] | null;
  stage_focus: string[] | null;
};

async function patchFirm(id: string, patch: Record<string, any>): Promise<boolean> {
  if (!Object.keys(patch).length) return false;
  if (DRY_RUN) {
    log(`  [DRY] ${id}: ${Object.keys(patch).join(", ")}`);
    return true;
  }
  const { error } = await supabase
    .from("firm_records")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    log(`  ❌ patch ${id}: ${error.message}`);
    return false;
  }
  return true;
}

// ── Concurrency helper ───────────────────────────────────────────────────────
async function pooled<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const item = items[idx++];
      try { await fn(item); } catch (err: any) { log(`  ❌ pooled error: ${err.message}`); }
      if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// ── Pass 1: Extract city from stored locations jsonb ─────────────────────────
async function enrichFromLocationsJsonb(): Promise<void> {
  log("\n═══ Pass 1: Extract hq_city/state/country from locations jsonb ═══");

  const allRows: Array<{ id: string; locations: any; hq_city: string | null; hq_state: string | null; hq_country: string | null }> = [];
  let from = 0;
  const PAGE = DB_PAGE_SIZE;

  while (true) {
    const data = await retryDbQuery(
      "loadLocations",
      () => supabase
        .from("firm_records")
        .select("id, locations, hq_city, hq_state, hq_country")
        .not("locations", "is", null)
        .is("deleted_at", null)
        .or("hq_city.is.null,hq_state.is.null,hq_country.is.null")
        .range(from, from + PAGE - 1),
    );
    if (!data?.length) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  log(`  Found ${allRows.length} firm_records with locations jsonb but missing hq fields`);
  if (!allRows.length) return;

  let done = 0;
  let skipped = 0;

  for (const row of allRows) {
    const locs = Array.isArray(row.locations) ? row.locations : [];
    if (!locs.length) { skipped++; continue; }

    const { city, state, country } = parseLocations(locs);
    const patch: Record<string, any> = {};

    if (!row.hq_city && city) patch.hq_city = city;
    if (!row.hq_state && state) patch.hq_state = state;
    if (!row.hq_country && country) patch.hq_country = country;

    if (Object.keys(patch).length) {
      const ok = await patchFirm(row.id, patch);
      if (ok) done++;
    } else {
      skipped++;
    }
  }

  log(`  ✅ Pass 1 done — patched=${done} skipped=${skipped}`);
}

// ── Pass 2: Cross-pollinate investor stubs from parent firms ────────────────
async function crossPollinateInvestorStubs(): Promise<void> {
  log("\n═══ Pass 2: Cross-pollinate investor stubs from parent firms ═══");

  const allStubs: Array<FirmRow> = [];
  let from = 0;
  const PAGE = DB_PAGE_SIZE;

  while (true) {
    const data = await retryDbQuery(
      "loadStubs",
      () => supabase
        .from("firm_records")
        .select("id, firm_name, signal_nfx_url, description, founded_year, linkedin_url, website_url, hq_city, hq_state, hq_country, stage_focus, thesis_verticals")
        .like("signal_nfx_url", "%signal.nfx.com/investors/%")
        .is("deleted_at", null)
        .or("description.is.null,founded_year.is.null,linkedin_url.is.null,hq_city.is.null")
        .range(from, from + PAGE - 1),
    );
    if (!data?.length) break;
    allStubs.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  log(`  Found ${allStubs.length} investor stubs with missing fields`);
  if (!allStubs.length) return;

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const stub of allStubs) {
    const searchName = stub.firm_name.replace(/\s*\(Individual\)\s*$/, "").trim();
    if (!searchName) { skipped++; continue; }

    try {
      const { data: invs, error: invErr } = await supabase
        .from("firm_investors")
        .select("firm_id, stage_focus, personal_thesis_tags")
        .eq("full_name", searchName)
        .is("deleted_at", null)
        .limit(1);

      if (invErr || !invs?.length) { skipped++; continue; }
      const inv = invs[0];
      if (!inv.firm_id) { skipped++; continue; }

      const { data: parentFirm, error: parentErr } = await supabase
        .from("firm_records")
        .select("description, founded_year, linkedin_url, website_url, hq_city, hq_state, hq_country")
        .eq("id", inv.firm_id)
        .is("deleted_at", null)
        .single();

      if (parentErr || !parentFirm) { skipped++; continue; }

      const patch: Record<string, any> = {};
      if (!stub.description && parentFirm.description) patch.description = parentFirm.description;
      if (!stub.founded_year && parentFirm.founded_year) patch.founded_year = parentFirm.founded_year;
      if (!stub.linkedin_url && parentFirm.linkedin_url) patch.linkedin_url = parentFirm.linkedin_url;
      if (!stub.hq_city && parentFirm.hq_city) patch.hq_city = parentFirm.hq_city;
      if (!stub.hq_state && parentFirm.hq_state) patch.hq_state = parentFirm.hq_state;
      if (!stub.hq_country && parentFirm.hq_country) patch.hq_country = parentFirm.hq_country;

      if ((!stub.stage_focus || !stub.stage_focus.length) && inv.stage_focus?.length) {
        const mapped = inv.stage_focus.map(mapStage).filter(Boolean) as string[];
        if (mapped.length) patch.stage_focus = Array.from(new Set(mapped));
      }
      if ((!stub.thesis_verticals || !stub.thesis_verticals.length) && inv.personal_thesis_tags?.length) {
        patch.thesis_verticals = inv.personal_thesis_tags;
      }

      if (Object.keys(patch).length) {
        const ok = await patchFirm(stub.id, patch);
        if (ok) {
          done++;
          if (done % 50 === 0) log(`  Progress: ${done} patched, ${failed} failed, ${skipped} skipped`);
        }
      } else {
        skipped++;
      }
    } catch (err: any) {
      log(`  ❌ ${searchName}: ${err.message}`);
      failed++;
    }
  }

  log(`  ✅ Pass 2 done — patched=${done} skipped=${skipped} failed=${failed}`);
}

// ── Pass 3: Signal fetch (GraphQL → Playwright browser fallback) ────────────
async function signalFetchEnrich(): Promise<void> {
  log("\n═══ Pass 3: Signal fetch (GraphQL → Playwright browser fallback) ═══");

  // Check available providers
  const idJwt = loadIdJwt();
  const hasGraphql = !!idJwt;
  const hasBrowser = existsSync(AUTH_FILE); // Need saved auth cookies for browser fallback

  if (!hasGraphql && !hasBrowser) {
    log("  ⚠ No providers available (no JWT, no auth file). Skipping pass 3.");
    return;
  }

  log(`  Providers: GraphQL=${hasGraphql ? "yes" : "no"}  Playwright=${hasBrowser ? "yes (auth cookies)" : "no auth file"}`);

  // Track if GraphQL is globally blocked (stop trying after N consecutive 403s)
  let graphqlConsecutive403 = 0;
  const GRAPHQL_BLACKOUT_THRESHOLD = 10;
  let graphqlBlackedOut = false;

  // Load firms with /firms/ slugs still missing fields
  const allRows: FirmRow[] = [];
  let from = 0;
  const PAGE = DB_PAGE_SIZE;

  while (true) {
    const data = await retryDbQuery(
      "loadFirms",
      () => supabase
        .from("firm_records")
        .select("id, firm_name, signal_nfx_url, description, founded_year, linkedin_url, website_url, hq_city, hq_state, hq_country, thesis_verticals, stage_focus")
        .like("signal_nfx_url", "%signal.nfx.com/firms/%")
        .is("deleted_at", null)
        .or("description.is.null,founded_year.is.null,linkedin_url.is.null,hq_city.is.null,website_url.is.null")
        .range(from, from + PAGE - 1),
    );
    if (!data?.length) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Apply limit
  const rows = allRows.slice(0, LIMIT);
  log(`  Found ${allRows.length} firm records to enrich (processing ${rows.length} with SIGNAL_LIMIT=${LIMIT})`);
  if (!rows.length) return;

  // Use concurrency=1 when browser is the primary path (pages are serial in one context)
  const effectiveConcurrency = hasBrowser && !hasGraphql ? 1 : Math.min(CONCURRENCY, hasBrowser ? 1 : CONCURRENCY);
  log(`  Effective concurrency: ${effectiveConcurrency}`);

  await pooled(rows, effectiveConcurrency, async (row) => {
    const slug = row.signal_nfx_url.split("/firms/")[1]?.replace(/\/$/, "");
    if (!slug) { stats.skipped++; return; }

    let patch: Record<string, any> = {};
    let via = "skipped_no_data";

    // ── Tier A: GraphQL API ──
    if (hasGraphql && !graphqlBlackedOut) {
      const result = await gql(idJwt!, FIRM_QUERY, { slug });

      if (result.ok) {
        graphqlConsecutive403 = 0; // Reset counter
        const firm = result.data?.firm;
        if (firm) {
          if (!row.description && firm.description) patch.description = firm.description;
          if (!row.founded_year && firm.founding_year) patch.founded_year = firm.founding_year;
          if (!row.linkedin_url && firm.linkedin_url) patch.linkedin_url = firm.linkedin_url;
          if (!row.website_url && firm.website_url) patch.website_url = firm.website_url;

          if (firm.locations?.length) {
            const { city, state, country } = parseLocations(firm.locations);
            if (!row.hq_city && city) patch.hq_city = city;
            if (!row.hq_state && state) patch.hq_state = state;
            if (!row.hq_country && country) patch.hq_country = country;

            // Store full locations jsonb
            patch.locations = firm.locations.map((l: any) => ({
              id: l.id, name: l.name, display_name: l.display_name,
            }));
          }

          if (firm.investor_lists?.length) {
            const stages = new Set<string>();
            const sectors = new Set<string>();
            for (const il of firm.investor_lists) {
              const ms = mapStage(il.stage_name || "");
              if (ms) stages.add(ms);
              if (il.vertical?.display_name) sectors.add(il.vertical.display_name);
            }
            if (!row.stage_focus?.length && stages.size) patch.stage_focus = Array.from(stages);
            if (!row.thesis_verticals?.length && sectors.size) patch.thesis_verticals = Array.from(sectors);
          }

          via = "graphql";
          stats.graphql_ok++;
        } else {
          stats.skipped++;
        }
      } else if (result.blocked) {
        graphqlConsecutive403++;
        stats.graphql_403++;
        if (graphqlConsecutive403 >= GRAPHQL_BLACKOUT_THRESHOLD) {
          graphqlBlackedOut = true;
          log(`  ⚠ GraphQL blackout after ${GRAPHQL_BLACKOUT_THRESHOLD} consecutive 403s — switching to Playwright browser only`);
        }
        // Fall through to Tier B
      } else {
        stats.graphql_err++;
        // Fall through to Tier B
      }
    }

    // ── Tier B: Local Playwright browser scrape (stealth + auth cookies) ──
    if (via === "skipped_no_data" && !Object.keys(patch).length && hasBrowser) {
      const pageUrl = `https://signal.nfx.com/firms/${slug}`;
      const content = await playwrightFetch(pageUrl);

      if (content && content.length > 100 && !content.includes("Just a moment")) {
        const parsed = parseSignalFirmPage(content);
        stats.browser_ok++;

        if (!row.description && parsed.description) patch.description = parsed.description;
        if (!row.founded_year && parsed.founded_year) patch.founded_year = parsed.founded_year;
        if (!row.linkedin_url && parsed.linkedin_url) patch.linkedin_url = parsed.linkedin_url;
        if (!row.website_url && parsed.website_url) patch.website_url = parsed.website_url;
        if (!row.hq_city && parsed.hq_city) patch.hq_city = parsed.hq_city;
        if (!row.hq_state && parsed.hq_state) patch.hq_state = parsed.hq_state;
        if (!row.hq_country && parsed.hq_country) patch.hq_country = parsed.hq_country;

        via = "playwright_fallback";
      } else {
        stats.browser_err++;
        via = content?.includes("Just a moment") ? "skipped_blocked" : "skipped_no_data";
      }
    }

    // ── Write patch ──
    if (Object.keys(patch).length) {
      const ok = await patchFirm(row.id, patch);
      if (ok) {
        stats.patched++;
        if (stats.patched % 25 === 0) {
          log(`  Progress: patched=${stats.patched} gql_ok=${stats.graphql_ok} gql_403=${stats.graphql_403} bb_ok=${stats.browser_ok} bb_err=${stats.browser_err}`);
        }
      }
    } else {
      stats.skipped++;
    }

    // Log access path for this record
    if (stats.patched + stats.skipped + stats.graphql_403 + stats.browser_err <= 5) {
      log(`  ${slug}: via=${via} fields=${Object.keys(patch).join(",") || "none"}`);
    }
  });

  // Clean up browser
  await closeBrowser();

  log(`\n  ✅ Pass 3 done`);
  log(`    GraphQL OK:      ${stats.graphql_ok}`);
  log(`    GraphQL 403:     ${stats.graphql_403}`);
  log(`    GraphQL err:     ${stats.graphql_err}`);
  log(`    Playwright OK:   ${stats.browser_ok}`);
  log(`    Playwright err:  ${stats.browser_err}`);
  log(`    Patched: ${stats.patched}`);
  log(`    Skipped: ${stats.skipped}`);
}

// ── Pass 4: Aggregate check sizes from firm_investors ───────────────────────
async function aggregateCheckSizes(): Promise<void> {
  log("\n═══ Pass 4: Aggregate check sizes from firm_investors ═══");

  const { data: firms, error } = await supabase
    .from("firm_records")
    .select("id")
    .or("min_check_size.is.null,max_check_size.is.null")
    .is("deleted_at", null)
    .limit(5000);

  if (error || !firms?.length) {
    log(`  No firms to aggregate (${error?.message ?? "none found"})`);
    return;
  }

  log(`  Found ${firms.length} firms missing check sizes`);
  if (DRY_RUN) { log("  [DRY] skipping batch aggregation"); return; }

  let done = 0;

  for (let i = 0; i < firms.length; i += 50) {
    const batch = firms.slice(i, i + 50).map((f) => f.id);

    const { data: invs } = await supabase
      .from("firm_investors")
      .select("firm_id, check_size_min, check_size_max")
      .in("firm_id", batch)
      .is("deleted_at", null)
      .not("check_size_min", "is", null);

    if (!invs?.length) continue;

    const byFirm = new Map<string, { min: number; max: number }>();
    for (const inv of invs) {
      const cur = byFirm.get(inv.firm_id) ?? { min: Infinity, max: 0 };
      if (inv.check_size_min != null && inv.check_size_min < cur.min) cur.min = inv.check_size_min;
      if (inv.check_size_max != null && inv.check_size_max > cur.max) cur.max = inv.check_size_max;
      byFirm.set(inv.firm_id, cur);
    }

    for (const [firmId, sizes] of Array.from(byFirm.entries())) {
      const patch: Record<string, any> = {};
      if (isFinite(sizes.min) && sizes.min > 0) patch.min_check_size = sizes.min;
      if (sizes.max > 0) patch.max_check_size = sizes.max;
      if (Object.keys(patch).length) {
        await supabase.from("firm_records").update(patch).eq("id", firmId);
        done++;
      }
    }
  }

  log(`  ✅ Pass 4 done — ${done} firms updated with aggregated check sizes`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  appendFileSync(LOG_FILE, `\n=== Enrich Firm Records — ${new Date().toISOString()} ===\n`);
  log(`DRY_RUN=${DRY_RUN}  PASS=${PASS}  LIMIT=${LIMIT}  CONCURRENCY=${CONCURRENCY}  DELAY_MS=${DELAY_MS}`);
  log(`Providers: GraphQL=${existsSync(AUTH_FILE) ? "auth_file_found" : "no_auth_file"}  Playwright=${existsSync(AUTH_FILE) ? "auth_cookies" : "no_auth_file"}`);

  if (PASS === "all" || PASS === "locations_jsonb") {
    await enrichFromLocationsJsonb();
  }

  if (PASS === "all" || PASS === "cross_pollinate") {
    await crossPollinateInvestorStubs();
  }

  if (PASS === "all" || PASS === "signal_fetch") {
    await signalFetchEnrich();
  }

  if (PASS === "all" || PASS === "check_sizes") {
    await aggregateCheckSizes();
  }

  log("\n  ✅ All done");
}

main().catch((err) => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  process.exit(1);
});
