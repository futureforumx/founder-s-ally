#!/usr/bin/env tsx
/**
 * enrich-investors-phase1.ts
 * ===========================
 * Phase 1: Large-scale investor enrichment via Signal NFX and CB Insights.
 *
 * Targets firm_investors rows where:
 *   - ready_for_live = true
 *   - enrichment_status != 'complete'
 *   - One or more key fields are empty (linkedin_url, bio, sector_focus, email, etc.)
 *
 * For each investor it:
 *   1. Looks up the investor's firm in firm_records to get known source URLs
 *   2. For Signal NFX: navigates to the firm's team page OR derives investor slug
 *      from full_name, extracts profile data
 *   3. For CB Insights: navigates to the firm's People tab, matches by name
 *   4. Writes ONLY NULL/empty fields back (never overwrites populated data)
 *   5. Advances enrichment_status to 'partial' or 'complete' based on score
 *
 * Usage:
 *   npx tsx scripts/enrich-investors-phase1.ts
 *   DRY_RUN=1 npx tsx scripts/enrich-investors-phase1.ts
 *   SOURCES=signal_nfx npx tsx scripts/enrich-investors-phase1.ts
 *   LIMIT=200 npx tsx scripts/enrich-investors-phase1.ts
 *   OFFSET=500 npx tsx scripts/enrich-investors-phase1.ts
 *
 * Env:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SIGNAL_AUTH_FILE   (default: data/sessions/signal-nfx.json)
 *   CBI_AUTH_FILE      (default: data/sessions/cbinsights.json)
 *   SOURCES            Comma list: signal_nfx,cbinsights (default: both)
 *   LIMIT              Max investors to process (default: 1000)
 *   OFFSET             Skip first N records for resume (default: 0)
 *   DELAY_MS           ms between requests per source (default: 1500)
 *   CONCURRENCY        Parallel investor fetches per source (default: 1)
 *   DRY_RUN            1 = print changes, skip DB writes
 *   HEADLESS           false = show the browser (default: true)
 *
 * Prerequisites:
 *   Run `npx tsx scripts/capture-auth.ts` first to save auth sessions.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

// ─── Config ───────────────────────────────────────────────────────────────────

const e    = (n: string) => (process.env[n] || "").trim();
const eInt = (n: string, fb: number) => { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; };
const eBool = (n: string, def = false) => {
  const v = e(n).toLowerCase();
  if (!v) return def;
  return ["1", "true", "yes"].includes(v);
};

const SUPA_URL   = e("SUPABASE_URL") || e("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY   = e("SUPABASE_SERVICE_ROLE_KEY");
const DRY_RUN    = eBool("DRY_RUN");
const HEADLESS   = !["false", "0", "no"].includes(e("HEADLESS") || "true");
const LIMIT      = eInt("LIMIT", 1000);
const OFFSET     = eInt("OFFSET", 0);
const DELAY_MS   = eInt("DELAY_MS", 1500);
const SOURCES_RAW = e("SOURCES") || "signal_nfx,cbinsights";
const SOURCES    = SOURCES_RAW.split(",").map(s => s.trim()).filter(Boolean);

const SIGNAL_AUTH = e("SIGNAL_AUTH_FILE") || join(process.cwd(), "data", "sessions", "signal-nfx.json");
const CBI_AUTH    = e("CBI_AUTH_FILE")    || join(process.cwd(), "data", "sessions", "cbinsights.json");

const LOG_DIR  = join(process.cwd(), "data", "enrichment-logs");
const LOG_FILE = join(LOG_DIR, `phase1-investors-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const PROGRESS_FILE = join(process.cwd(), "data", "phase1-progress.json");

if (!SUPA_URL) throw new Error("SUPABASE_URL not set");
if (!SUPA_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvestorRow {
  id: string;
  firm_id: string;
  full_name: string;
  title: string;
  bio: string;
  email: string;
  linkedin_url: string;
  x_url: string;
  city: string;
  avatar_url: string;
  sector_focus: string[];
  stage_focus: string[];
  check_size_min: number | null;
  check_size_max: number | null;
  enrichment_status: string;
  completeness_score: number;
  signal_nfx_url?: string | null;
  cb_insights_url?: string | null;
  // from firm_records join
  firm_name?: string;
  firm_signal_nfx_url?: string | null;
  firm_cb_insights_url?: string | null;
  firm_website_url?: string | null;
}

interface EnrichmentPatch {
  bio?: string;
  email?: string;
  linkedin_url?: string;
  x_url?: string;
  city?: string;
  avatar_url?: string;
  sector_focus?: string[];
  check_size_min?: number;
  check_size_max?: number;
  enrichment_status?: string;
  completeness_score?: number;
  last_enriched_at?: string;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function log(obj: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj });
  console.log(line);
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, line + "\n");
  } catch { /* ignore */ }
}

function slugify(name: string): string {
  return name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Only return values that aren't already set on the investor */
function filterNewFields(investor: InvestorRow, candidate: Partial<InvestorPatch>): EnrichmentPatch {
  const patch: EnrichmentPatch = {};
  for (const [key, val] of Object.entries(candidate) as Array<[keyof InvestorPatch, unknown]>) {
    if (val == null || val === "") continue;
    const existing = (investor as Record<string, unknown>)[key];
    if (Array.isArray(existing)) {
      if (existing.length === 0 && Array.isArray(val) && (val as unknown[]).length > 0) {
        (patch as Record<string, unknown>)[key] = val;
      }
    } else if (!existing) {
      (patch as Record<string, unknown>)[key] = val;
    }
  }
  return patch;
}

type InvestorPatch = Omit<EnrichmentPatch, "enrichment_status" | "completeness_score" | "last_enriched_at">;

function computeCompleteness(investor: InvestorRow, patch: EnrichmentPatch): number {
  const merged = { ...investor, ...patch };
  const fields: Array<keyof typeof merged> = [
    "bio", "email", "linkedin_url", "x_url", "city", "avatar_url",
  ];
  const array_fields: Array<keyof typeof merged> = ["sector_focus", "stage_focus"];

  let score = 0;
  const total = fields.length + array_fields.length + 2; // +2 for check sizes

  for (const f of fields) if (merged[f]) score++;
  for (const f of array_fields) {
    const v = merged[f] as unknown[];
    if (Array.isArray(v) && v.length > 0) score++;
  }
  if (merged.check_size_min) score++;
  if (merged.check_size_max) score++;

  return Math.round((score / total) * 100);
}

// ─── Load Progress ────────────────────────────────────────────────────────────

function loadProgress(): Set<string> {
  if (!existsSync(PROGRESS_FILE)) return new Set();
  try {
    const data = JSON.parse(readFileSync(PROGRESS_FILE, "utf8"));
    return new Set(data.processed ?? []);
  } catch { return new Set(); }
}

function saveProgress(processed: Set<string>) {
  writeFileSync(PROGRESS_FILE, JSON.stringify({ processed: [...processed], updated: new Date().toISOString() }));
}

// ─── DB Fetch ─────────────────────────────────────────────────────────────────

async function fetchInvestors(): Promise<InvestorRow[]> {
  log({ event: "fetch.start", limit: LIMIT, offset: OFFSET });

  // Fetch firm_investors joined with firm_records source URLs
  const { data, error } = await sb
    .from("firm_investors")
    .select(`
      id, firm_id, full_name, title, bio, email, linkedin_url, x_url,
      city, avatar_url, sector_focus, stage_focus, check_size_min, check_size_max,
      enrichment_status, completeness_score,
      firm_records!inner(firm_name, signal_nfx_url, cb_insights_url, website_url)
    `)
    .eq("ready_for_live", true)
    .neq("enrichment_status", "complete")
    .range(OFFSET, OFFSET + LIMIT - 1);

  if (error) throw new Error(`DB fetch failed: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const firm = (row["firm_records"] as Record<string, unknown>) ?? {};
    return {
      ...row,
      firm_name: firm["firm_name"] as string,
      firm_signal_nfx_url: firm["signal_nfx_url"] as string | null,
      firm_cb_insights_url: firm["cb_insights_url"] as string | null,
      firm_website_url: firm["website_url"] as string | null,
    } as InvestorRow;
  });
}

// ─── Signal NFX Scraper ────────────────────────────────────────────────────────

class SignalNfxScraper {
  private browser: Browser | null = null;
  private ctx: BrowserContext | null = null;
  private page: Page | null = null;
  private authenticated = false;

  async init() {
    if (!existsSync(SIGNAL_AUTH)) {
      console.warn(`[signal_nfx] ⚠️  No auth file at ${SIGNAL_AUTH}. Run capture-auth.ts first.`);
      return false;
    }

    this.browser = await chromium.launch({
      headless: HEADLESS,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    });
    this.ctx = await this.browser.newContext({
      storageState: SIGNAL_AUTH,
      viewport: { width: 1280, height: 900 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    });
    this.page = await this.ctx.newPage();

    // Verify auth is still valid
    await this.page.goto("https://signal.nfx.com/investors", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    const isLoggedIn = !this.page.url().includes("/login");
    if (!isLoggedIn) {
      console.warn("[signal_nfx] ⚠️  Auth session expired. Re-run capture-auth.ts.");
      await this.browser.close();
      return false;
    }

    this.authenticated = true;
    log({ event: "signal_nfx.init", status: "ok" });
    return true;
  }

  async scrapeInvestor(investor: InvestorRow): Promise<Partial<InvestorPatch> | null> {
    if (!this.page || !this.authenticated) return null;

    const slug = slugify(investor.full_name);
    const directUrl = `https://signal.nfx.com/investors/${slug}`;

    // Also try firm page if we have a firm NFX URL
    const firmNfxUrl = investor.firm_signal_nfx_url;

    try {
      // Try direct investor slug first
      await this.page.goto(directUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      await sleep(800);

      const currentUrl = this.page.url();
      if (currentUrl.includes("/login") || currentUrl.includes("/search") || currentUrl.includes("404")) {
        // Try firm page team section as fallback
        if (firmNfxUrl) {
          const firmTeamUrl = firmNfxUrl.endsWith("/team") ? firmNfxUrl : `${firmNfxUrl}/team`;
          await this.page.goto(firmTeamUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
          await sleep(800);
          // Look for the investor by name in the team section
          const investorCard = this.page.locator(`text="${investor.full_name}"`).first();
          const cardVisible = await investorCard.isVisible().catch(() => false);
          if (cardVisible) {
            const link = await investorCard.locator("..").locator('a[href*="/investors/"]').first()
              .getAttribute("href").catch(() => null);
            if (link) {
              const profileUrl = new URL(link, "https://signal.nfx.com").toString();
              await this.page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
              await sleep(800);
            }
          } else {
            return null;
          }
        } else {
          return null;
        }
      }

      return await this.extractFromPage();
    } catch (err) {
      log({ event: "signal_nfx.scrape.error", investor_id: investor.id, err: String(err) });
      return null;
    }
  }

  private async extractFromPage(): Promise<Partial<InvestorPatch>> {
    const page = this.page!;
    const result: Partial<InvestorPatch> = {};

    // Bio / description
    const bio = await page.locator('[data-testid="about"], .investor-bio, .bio-text, section:has-text("About") p').first()
      .textContent().catch(() => null);
    if (bio?.trim()) result.bio = bio.trim();

    // LinkedIn
    const linkedin = await page.locator('a[href*="linkedin.com/in/"]').first()
      .getAttribute("href").catch(() => null);
    if (linkedin) result.linkedin_url = linkedin;

    // Twitter/X
    const twitter = await page.locator('a[href*="twitter.com/"], a[href*="x.com/"]').first()
      .getAttribute("href").catch(() => null);
    if (twitter) result.x_url = twitter;

    // Avatar
    const avatar = await page.locator('img[data-testid="avatar"], img.investor-avatar, .profile-photo img').first()
      .getAttribute("src").catch(() => null);
    if (avatar && !avatar.includes("placeholder") && !avatar.includes("default")) result.avatar_url = avatar;

    // Location
    const location = await page.locator('[data-testid="location"], .investor-location, .location-text').first()
      .textContent().catch(() => null);
    if (location?.trim()) result.city = location.trim().split(",")[0].trim();

    // Check sizes — "Investment Range" or "Sweet Spot" labels
    const checkRangeText = await page.locator(
      'section:has-text("Investment Range"), [data-testid="check-size"], .investment-range'
    ).first().textContent().catch(() => null);
    if (checkRangeText) {
      const minMatch = checkRangeText.match(/\$([0-9,.]+)K?M?/i);
      const maxMatch = checkRangeText.match(/–\s*\$([0-9,.]+)K?M?/i) ??
                       checkRangeText.match(/to\s+\$([0-9,.]+)K?M?/i);
      if (minMatch) {
        const raw = minMatch[1].replace(/,/g, "");
        const mult = checkRangeText.includes("M") ? 1_000_000 : checkRangeText.includes("K") ? 1_000 : 1;
        result.check_size_min = Math.round(parseFloat(raw) * mult);
      }
      if (maxMatch) {
        const raw = maxMatch[1].replace(/,/g, "");
        const mult = checkRangeText.includes("M") ? 1_000_000 : checkRangeText.includes("K") ? 1_000 : 1;
        result.check_size_max = Math.round(parseFloat(raw) * mult);
      }
    }

    // Sector focus tags
    const sectorEls = await page.locator('[data-testid="sector-tag"], .focus-sector, .sector-tag').all();
    const sectors: string[] = [];
    for (const el of sectorEls.slice(0, 15)) {
      const t = await el.textContent().catch(() => null);
      if (t?.trim()) sectors.push(t.trim());
    }
    if (sectors.length) result.sector_focus = sectors;

    return result;
  }

  async close() {
    await this.browser?.close();
  }
}

// ─── CB Insights Scraper ─────────────────────────────────────────────────────

class CbInsightsScraper {
  private browser: Browser | null = null;
  private ctx: BrowserContext | null = null;
  private page: Page | null = null;
  private authenticated = false;

  async init() {
    if (!existsSync(CBI_AUTH)) {
      console.warn(`[cbinsights] ⚠️  No auth file at ${CBI_AUTH}. Run capture-auth.ts first.`);
      return false;
    }

    this.browser = await chromium.launch({
      headless: HEADLESS,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    });
    this.ctx = await this.browser.newContext({
      storageState: CBI_AUTH,
      viewport: { width: 1280, height: 900 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    });
    this.page = await this.ctx.newPage();

    // Verify auth
    await this.page.goto("https://app.cbinsights.com/home", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    const isLoggedIn = !this.page.url().includes("/login");
    if (!isLoggedIn) {
      console.warn("[cbinsights] ⚠️  Auth session expired. Re-run capture-auth.ts.");
      await this.browser.close();
      return false;
    }

    this.authenticated = true;
    log({ event: "cbinsights.init", status: "ok" });
    return true;
  }

  async scrapeInvestor(investor: InvestorRow): Promise<Partial<InvestorPatch> | null> {
    if (!this.page || !this.authenticated) return null;
    if (!investor.firm_cb_insights_url && !investor.firm_name) return null;

    try {
      // Use firm page if we have a CB Insights URL
      let firmUrl = investor.firm_cb_insights_url;

      if (!firmUrl) {
        // Search for the firm to get its CB Insights URL
        const searchResults = await this.page.evaluate(async (name: string) => {
          try {
            const r = await fetch(`/api/search/live?q=${encodeURIComponent(name)}&type=investor&limit=5`, {
              credentials: "include",
              headers: { Accept: "application/json" },
            });
            return r.ok ? await r.json() : null;
          } catch { return null; }
        }, investor.firm_name ?? "");

        const hits = (searchResults?.results ?? searchResults?.hits ?? []) as Array<Record<string, string>>;
        if (hits.length === 0) return null;

        const bestHit = hits[0];
        const id = bestHit.id ?? bestHit.entityId ?? bestHit.orgId;
        if (!id) return null;
        firmUrl = `https://app.cbinsights.com/profiles/i/${id}`;
      }

      // Navigate to the firm's People/Team tab
      const teamUrl = firmUrl.replace(/\?.*$/, "") + "?tab=people";
      await this.page.goto(teamUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
      await sleep(1500);

      // Find the investor by name in the people section
      const nameNorm = investor.full_name.toLowerCase().trim();
      const personCards = await this.page.locator('.person-card, [data-test="person-card"], .team-member').all();

      for (const card of personCards) {
        const cardName = await card.locator('.person-name, [data-test="person-name"], h3, h4').first()
          .textContent().catch(() => null);
        if (!cardName) continue;
        if (cardName.toLowerCase().trim() !== nameNorm) continue;

        // Found the matching person — extract data from their card
        const result: Partial<InvestorPatch> = {};

        const bio = await card.locator('.person-bio, .bio, p').first().textContent().catch(() => null);
        if (bio?.trim()) result.bio = bio.trim();

        const linkedin = await card.locator('a[href*="linkedin.com"]').first()
          .getAttribute("href").catch(() => null);
        if (linkedin) result.linkedin_url = linkedin;

        const avatar = await card.locator("img").first().getAttribute("src").catch(() => null);
        if (avatar && !avatar.includes("placeholder")) result.avatar_url = avatar;

        return result;
      }

      return null;
    } catch (err) {
      log({ event: "cbinsights.scrape.error", investor_id: investor.id, err: String(err) });
      return null;
    }
  }

  async close() {
    await this.browser?.close();
  }
}

// ─── DB Write ─────────────────────────────────────────────────────────────────

async function writeInvestorPatch(
  supabase: SupabaseClient,
  investor: InvestorRow,
  patch: EnrichmentPatch,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;

  const completeness = computeCompleteness(investor, patch);
  const fullPatch: EnrichmentPatch = {
    ...patch,
    completeness_score: completeness,
    enrichment_status: completeness >= 70 ? "complete" : "partial",
    last_enriched_at: new Date().toISOString(),
  };

  if (DRY_RUN) {
    log({ event: "dry_run.would_write", investor_id: investor.id, name: investor.full_name, patch: fullPatch });
    return;
  }

  const { error } = await supabase
    .from("firm_investors")
    .update(fullPatch)
    .eq("id", investor.id);

  if (error) {
    log({ event: "db.write.error", investor_id: investor.id, error: error.message });
  } else {
    log({ event: "db.write.ok", investor_id: investor.id, name: investor.full_name, fields: Object.keys(patch) });
  }
}

// ─── Main Orchestration ───────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  Vekta Phase 1 — Investor Enrichment");
  console.log(`  Sources: ${SOURCES.join(", ")}`);
  console.log(`  Limit: ${LIMIT} | Offset: ${OFFSET} | Dry run: ${DRY_RUN}`);
  console.log("=".repeat(60));

  const processed = loadProgress();
  console.log(`[progress] ${processed.size} investors already processed from prior runs.`);

  // Initialise scrapers
  const signal = SOURCES.includes("signal_nfx") ? new SignalNfxScraper() : null;
  const cbi    = SOURCES.includes("cbinsights")  ? new CbInsightsScraper() : null;

  const signalReady = signal ? await signal.init() : false;
  const cbiReady    = cbi    ? await cbi.init()    : false;

  if (!signalReady && !cbiReady) {
    console.error("❌ No scrapers could initialise. Run capture-auth.ts first.");
    process.exit(1);
  }

  // Fetch investors
  const investors = await fetchInvestors();
  const todo = investors.filter(inv => !processed.has(inv.id));
  console.log(`\n[fetch] ${investors.length} investors fetched. ${todo.length} to process.\n`);

  let enriched = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const investor of todo) {
    const patches: Partial<InvestorPatch>[] = [];

    // Signal NFX
    if (signalReady && signal) {
      await sleep(DELAY_MS);
      const result = await signal.scrapeInvestor(investor);
      if (result && Object.keys(result).length > 0) {
        patches.push(result);
        log({ event: "signal_nfx.hit", investor_id: investor.id, name: investor.full_name, fields: Object.keys(result) });
      }
    }

    // CB Insights
    if (cbiReady && cbi) {
      await sleep(DELAY_MS);
      const result = await cbi.scrapeInvestor(investor);
      if (result && Object.keys(result).length > 0) {
        patches.push(result);
        log({ event: "cbinsights.hit", investor_id: investor.id, name: investor.full_name, fields: Object.keys(result) });
      }
    }

    // Merge patches — Signal NFX wins on conflicts (more structured)
    const merged: Partial<InvestorPatch> = Object.assign({}, ...patches.reverse());
    const filteredPatch = filterNewFields(investor, merged);

    if (Object.keys(filteredPatch).length > 0) {
      try {
        await writeInvestorPatch(sb, investor, filteredPatch);
        enriched++;
      } catch (err) {
        log({ event: "write.error", investor_id: investor.id, err: String(err) });
        errors++;
      }
    } else {
      skipped++;
    }

    processed.add(investor.id);
    if (processed.size % 50 === 0) saveProgress(processed);
  }

  saveProgress(processed);
  await signal?.close();
  await cbi?.close();

  console.log("\n" + "=".repeat(60));
  console.log(`  Phase 1 Complete`);
  console.log(`  Enriched:  ${enriched}`);
  console.log(`  No change: ${skipped}`);
  console.log(`  Errors:    ${errors}`);
  console.log(`  Log:       ${LOG_FILE}`);
  console.log("=".repeat(60));
  console.log("\nNext step — run Phase 2 LLM inference:");
  console.log("  npx tsx scripts/phase2-llm-inference.ts\n");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
