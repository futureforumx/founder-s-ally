/**
 * scrape-yc-founder-avatars.ts
 *
 * Visits each YC company page with Playwright, extracts founder avatar hashes
 * from the embedded Inertia.js JSON, and updates people.avatarUrl with
 * publicly-accessible unsigned S3 URLs.
 *
 * WHY PLAYWRIGHT: YC blocks curl/fetch from non-browser clients.
 * WHY UNSIGNED: bookface-images.s3.amazonaws.com/avatars/{hash}.jpg works
 *               without AWS signing — confirmed 200×200 public JPEG.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/scrape-yc-founder-avatars.ts
 *
 * Optional env overrides:
 *   YC_MAX_COMPANIES=100      cap how many company pages to visit (default: all)
 *   YC_CONCURRENCY=3          parallel browser pages (default 3, be polite)
 *   YC_DELAY_MS=400           ms between requests (default 400)
 *   YC_HEADLESS=false         show the browser window while running (default true)
 *   YC_SKIP_EXISTING=true     skip people who already have a bookface avatarUrl (default true)
 *   YC_DRY_RUN=true           log matches but don't write to Supabase (default false)
 */

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadAllEnv } from "./lib/loadDatabaseUrl";

// ── Bootstrap ─────────────────────────────────────────────────────────────────
loadAllEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MAX_COMPANIES = process.env.YC_MAX_COMPANIES ? parseInt(process.env.YC_MAX_COMPANIES) : Infinity;
const CONCURRENCY = parseInt(process.env.YC_CONCURRENCY || "3");
const DELAY_MS = parseInt(process.env.YC_DELAY_MS || "400");
const HEADLESS = process.env.YC_HEADLESS !== "false";
const SKIP_EXISTING = process.env.YC_SKIP_EXISTING !== "false";
const DRY_RUN = process.env.YC_DRY_RUN === "true";

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ── Types ────────────────────────────────────────────────────────────────────
interface PersonRow {
  id: string;
  canonicalName: string | null;
  firstName: string | null;
  lastName: string | null;
  linkedinUrl: string | null;
  avatarUrl: string | null;
}

interface FounderFromPage {
  full_name: string;
  linkedin_url: string | null;
  avatar_medium: string | null; // signed S3 URL
}

interface UpdatePayload {
  personId: string;
  name: string;
  unsignedUrl: string;
  matchedBy: "linkedin" | "name";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the 40-char hex hash from a signed or unsigned bookface-images URL */
function extractHash(url: string): string | null {
  const m = url.match(/\/avatars\/([0-9a-f]{40})\.jpg/i);
  return m ? m[1] : null;
}

/** Build the publicly-accessible unsigned avatar URL */
function buildUnsignedUrl(hash: string): string {
  return `https://bookface-images.s3.amazonaws.com/avatars/${hash}.jpg`;
}

/** Normalize a LinkedIn URL to its canonical slug for matching */
function normalizeLinkedin(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? m[1].toLowerCase().replace(/\/$/, "") : null;
}

/** Normalize a name for fuzzy matching: lowercase, trim, collapse spaces */
function normalizeName(s: string | null | undefined): string {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

async function loadOrgsWithSlugs(): Promise<Array<{ id: string; slug: string; canonicalName: string }>> {
  // Slug is stored inside ycRawJson, not as a top-level column
  const PAGE = 1000;
  const all: Array<{ id: string; slug: string; canonicalName: string }> = [];
  let from = 0;

  for (;;) {
    const { data, error } = await (supabase as any)
      .from("organizations")
      .select('id, "canonicalName", "ycRawJson"')
      .eq("isYcBacked", true)
      .not("ycRawJson", "is", null)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to load orgs: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const o of data) {
      const slug = o.ycRawJson?.slug?.trim();
      if (slug) all.push({ id: o.id, slug, canonicalName: o.canonicalName || "" });
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

async function loadPeopleForOrgs(orgIds: string[]): Promise<Map<string, PersonRow[]>> {
  // Map: orgId → founder PersonRows
  // Step 1: get personIds for founder roles in these orgs
  const batchSize = 500;
  const allRoles: Array<{ personId: string; organizationId: string }> = [];

  for (let i = 0; i < orgIds.length; i += batchSize) {
    const batch = orgIds.slice(i, i + batchSize);
    const { data, error } = await (supabase as any)
      .from("roles")
      .select("personId, organizationId")
      .in("organizationId", batch)
      .in("roleType", ["founder", "cofounder", "ceo", "cto", "coo"])
      .eq("isCurrent", true);

    if (error) {
      console.warn(`Failed to load roles batch: ${error.message}`);
      continue;
    }
    allRoles.push(...(data || []));
  }

  if (allRoles.length === 0) return new Map();

  // Step 2: load people
  const personIds = [...new Set(allRoles.map((r: any) => r.personId))];
  const people: PersonRow[] = [];

  for (let i = 0; i < personIds.length; i += batchSize) {
    const batch = personIds.slice(i, i + batchSize);
    const { data, error } = await (supabase as any)
      .from("people")
      .select('id, "canonicalName", "firstName", "lastName", "linkedinUrl", "avatarUrl"')
      .in("id", batch);

    if (error) {
      console.warn(`Failed to load people batch: ${error.message}`);
      continue;
    }
    people.push(...(data || []));
  }

  // Step 3: build orgId → [PersonRow] map
  const personById = new Map<string, PersonRow>(people.map((p) => [p.id, p]));
  const result = new Map<string, PersonRow[]>();

  for (const role of allRoles) {
    const p = personById.get(role.personId);
    if (!p) continue;
    if (!result.has(role.organizationId)) result.set(role.organizationId, []);
    result.get(role.organizationId)!.push(p);
  }

  return result;
}

// ── Page scraping ─────────────────────────────────────────────────────────────

/**
 * Visit a YC company page and extract founders from the embedded Inertia JSON.
 * Returns an empty array on any failure (non-fatal).
 */
async function scrapeFounders(page: Page, slug: string): Promise<FounderFromPage[]> {
  const url = `https://www.ycombinator.com/companies/${slug}`;
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    if (!response || !response.ok()) {
      console.warn(`  [skip] ${slug}: HTTP ${response?.status()}`);
      return [];
    }

    // Extract Inertia page data from the app div's data-page attribute
    const pageData = await page.evaluate(() => {
      const el = document.getElementById("app");
      if (!el) return null;
      const raw = el.getAttribute("data-page");
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    });

    if (!pageData) {
      console.warn(`  [skip] ${slug}: no Inertia data-page found`);
      return [];
    }

    const founders: FounderFromPage[] = (pageData?.props?.company?.founders || []).map((f: any) => ({
      full_name: f.full_name || "",
      linkedin_url: f.linkedin_url || null,
      avatar_medium: f.avatar_medium || null,
    }));

    return founders.filter((f) => f.full_name);
  } catch (err) {
    console.warn(`  [error] ${slug}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

// ── Matching ──────────────────────────────────────────────────────────────────

function matchFounderToPerson(
  founder: FounderFromPage,
  candidates: PersonRow[],
): { person: PersonRow; matchedBy: "linkedin" | "name" } | null {
  // Try LinkedIn match first (most reliable)
  const founderLinkedin = normalizeLinkedin(founder.linkedin_url);
  if (founderLinkedin) {
    for (const p of candidates) {
      if (normalizeLinkedin(p.linkedinUrl) === founderLinkedin) {
        return { person: p, matchedBy: "linkedin" };
      }
    }
  }

  // Fall back to name match
  const founderName = normalizeName(founder.full_name);
  if (founderName.length < 3) return null;

  for (const p of candidates) {
    const fullName = normalizeName(
      p.canonicalName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
    );
    if (fullName === founderName) {
      return { person: p, matchedBy: "name" };
    }
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Loading organizations with YC slugs...");
  const orgs = await loadOrgsWithSlugs();
  const limited = orgs.slice(0, MAX_COMPANIES === Infinity ? orgs.length : MAX_COMPANIES);
  console.log(`   ${limited.length} orgs to process (${orgs.length} total with slugs)`);

  console.log("👥 Loading people for those orgs...");
  const orgIds = limited.map((o) => o.id);
  const orgToPeople = await loadPeopleForOrgs(orgIds);

  // Filter out orgs with no people in our DB (saves browser trips)
  const orgsWithPeople = limited.filter((o) => (orgToPeople.get(o.id) || []).length > 0);
  console.log(`   ${orgsWithPeople.length} orgs have founder people in our DB`);

  // Optionally skip people who already have a bookface avatar
  let orgsToScrape = orgsWithPeople;
  if (SKIP_EXISTING) {
    orgsToScrape = orgsWithPeople.filter((o) => {
      const people = orgToPeople.get(o.id) || [];
      // Only scrape if at least one person is missing a bookface avatar
      return people.some((p) => !p.avatarUrl?.includes("bookface-images.s3.amazonaws.com/avatars"));
    });
    console.log(`   ${orgsToScrape.length} orgs need avatar scraping (others already have bookface URLs)`);
  }

  // Launch browser
  console.log(`\n🌐 Launching Playwright (headless=${HEADLESS}, concurrency=${CONCURRENCY})...`);
  const browser: Browser = await chromium.launch({ headless: HEADLESS });
  const context: BrowserContext = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });

  const updates: UpdatePayload[] = [];
  let visited = 0;
  let skipped = 0;
  let matched = 0;
  let noAvatar = 0;

  // Process in parallel batches
  const pages: Page[] = await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, orgsToScrape.length) }, () => context.newPage()),
  );

  async function processOrg(org: (typeof orgsToScrape)[0], browserPage: Page): Promise<void> {
    visited++;
    if (visited % 50 === 0) {
      console.log(`  [${visited}/${orgsToScrape.length}] ...processing (${matched} matched so far)`);
    }

    const founders = await scrapeFounders(browserPage, org.slug);
    await sleep(DELAY_MS);

    const candidates = orgToPeople.get(org.id) || [];

    for (const founder of founders) {
      if (!founder.avatar_medium) {
        noAvatar++;
        continue;
      }

      const hash = extractHash(founder.avatar_medium);
      if (!hash) {
        console.warn(`  [warn] ${org.slug}/${founder.full_name}: couldn't parse hash from ${founder.avatar_medium.slice(0, 80)}`);
        continue;
      }

      const unsignedUrl = buildUnsignedUrl(hash);
      const match = matchFounderToPerson(founder, candidates);

      if (!match) {
        console.warn(`  [no-match] ${org.slug}: "${founder.full_name}" not found in people table`);
        skipped++;
        continue;
      }

      // Skip if already has this exact URL
      if (match.person.avatarUrl === unsignedUrl) {
        skipped++;
        continue;
      }

      // Skip if already has a bookface avatar and SKIP_EXISTING is on
      if (SKIP_EXISTING && match.person.avatarUrl?.includes("bookface-images.s3.amazonaws.com/avatars")) {
        skipped++;
        continue;
      }

      matched++;
      updates.push({
        personId: match.person.id,
        name: match.person.canonicalName || founder.full_name,
        unsignedUrl,
        matchedBy: match.matchedBy,
      });

      console.log(`  ✓ [${match.matchedBy}] ${match.person.canonicalName || founder.full_name} → ${unsignedUrl}`);
    }
  }

  // Worker pool: each worker owns one Page and processes orgs sequentially
  let orgCursor = 0;
  async function runWorker(browserPage: Page): Promise<void> {
    for (;;) {
      const idx = orgCursor++;
      if (idx >= orgsToScrape.length) return;
      await processOrg(orgsToScrape[idx], browserPage);
    }
  }

  await Promise.all(pages.map((p) => runWorker(p)));

  // Close browser
  await Promise.all(pages.map((p) => p.close()));
  await context.close();
  await browser.close();

  console.log(`\n📊 Results:`);
  console.log(`   Visited:  ${visited} company pages`);
  console.log(`   Matched:  ${matched} founders`);
  console.log(`   Skipped:  ${skipped} (already up-to-date or no DB match)`);
  console.log(`   NoAvatar: ${noAvatar} founders had no avatar on YC page`);

  if (updates.length === 0) {
    console.log("\n✅ Nothing to update.");
    return;
  }

  if (DRY_RUN) {
    console.log(`\n🔍 DRY RUN — would update ${updates.length} people:`);
    for (const u of updates.slice(0, 20)) {
      console.log(`   ${u.name} (${u.matchedBy}) → ${u.unsignedUrl}`);
    }
    if (updates.length > 20) console.log(`   ... and ${updates.length - 20} more`);
    return;
  }

  // Write to Supabase in batches
  console.log(`\n💾 Writing ${updates.length} avatar updates to Supabase...`);
  const BATCH = 50;
  let written = 0;
  let errors = 0;

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (u) => {
        const { error } = await (supabase as any)
          .from("people")
          .update({ avatarUrl: u.unsignedUrl })
          .eq("id", u.personId);
        if (error) {
          console.warn(`  [error] ${u.name}: ${error.message}`);
          errors++;
        } else {
          written++;
        }
      }),
    );
    console.log(`  wrote batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(updates.length / BATCH)}`);
  }

  console.log(`\n✅ Done! ${written} updated, ${errors} errors.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
