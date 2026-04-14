/**
 * enrich-wikipedia.ts
 *
 * Fills missing fields on firm_records by scraping each firm's Wikipedia page.
 *
 * Fields populated (only when currently NULL / empty):
 *   website_url       — from infobox `website` field
 *   logo_url          — from Wikipedia REST API thumbnail
 *   aum               — from infobox `aum` field
 *   email             — from infobox `email` field (rare)
 *   hq_city           — parsed from infobox `headquarters / location / hq`
 *   hq_state          — parsed from infobox `headquarters / location / hq`
 *   hq_country        — parsed from infobox `headquarters / location / hq`
 *   total_headcount   — from infobox `num_employees / employees` field
 *   founded_year      — from infobox `founded` field
 *
 * Strategy:
 *   1. Query Supabase for firm_records missing ≥1 of the above fields.
 *   2. For each firm, try three Wikipedia lookup strategies in order:
 *      a) Direct title fetch (exact firm name)
 *      b) OpenSearch autocomplete (best for name variants)
 *      c) Full-text search (broad fallback)
 *   3. Parse the infobox from raw wikitext.
 *   4. Fetch the REST Summary API for the thumbnail/logo.
 *   5. Write back only fields that are still NULL.
 *
 * Usage:
 *   npx tsx scripts/enrich-wikipedia.ts
 *   WIKI_MAX=50 npx tsx scripts/enrich-wikipedia.ts
 *   WIKI_DRY_RUN=1 npx tsx scripts/enrich-wikipedia.ts
 *   WIKI_DELAY_MS=800 npx tsx scripts/enrich-wikipedia.ts
 *
 * Env vars (from .env / .env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   WIKI_MAX          — max firms to process (default: 500)
 *   WIKI_DRY_RUN      — "1" / "true" to skip DB writes
 *   WIKI_DELAY_MS     — ms delay between Wikipedia requests (default: 600)
 */

import { createClient } from "@supabase/supabase-js";
import { augmentFirmRecordsPatchWithSupabase } from "./lib/firmRecordsCanonicalHqPolicy";
import { loadEnvFiles } from "./lib/loadEnvFiles";

// ── Env & config ─────────────────────────────────────────────────────────────

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set.");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

function envInt(name: string, fallback: number): number {
  const v = parseInt(process.env[name] || "", 10);
  return isFinite(v) && v > 0 ? v : fallback;
}
function envBool(name: string): boolean {
  return ["1", "true", "yes"].includes((process.env[name] || "").toLowerCase());
}

const MAX      = envInt("WIKI_MAX", 500);
const DELAY_MS = envInt("WIKI_DELAY_MS", 600);
const DRY_RUN  = envBool("WIKI_DRY_RUN");
const TIMEOUT  = 12_000;

// Wikipedia REQUIRES a descriptive User-Agent — requests without one are blocked/throttled.
const WIKI_HEADERS = {
  "User-Agent": "VektaApp/1.0 (VC firm enrichment; contact@vekta.so) node-fetch",
  Accept: "application/json",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ── Types ─────────────────────────────────────────────────────────────────────

type FirmRow = {
  id: string;
  firm_name: string;
  website_url: string | null;
  logo_url: string | null;
  aum: string | null;
  email: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  total_headcount: number | null;
  founded_year: number | null;
};

type WikiPatch = Partial<{
  website_url: string;
  logo_url: string;
  aum: string;
  email: string;
  hq_city: string;
  hq_state: string;
  hq_country: string;
  total_headcount: number;
  founded_year: number;
}>;

// ── Wikipedia fetch helpers ───────────────────────────────────────────────────

async function wikiGet(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: WIKI_HEADERS,
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Strategy A — direct title lookup.
 * Tries the exact firm name as a Wikipedia title.
 */
async function lookupDirect(firmName: string): Promise<string | null> {
  const encoded = encodeURIComponent(firmName);
  const data = await wikiGet(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=info&format=json&utf8=1`
  );
  if (!data) return null;
  const pages = Object.values(data?.query?.pages || {}) as any[];
  const page = pages[0];
  if (!page || page.missing !== undefined || page.invalid !== undefined) return null;
  return page.title as string;
}

/**
 * Strategy B — OpenSearch autocomplete.
 * Best for name variants and partial matches.
 */
async function lookupOpenSearch(firmName: string): Promise<string | null> {
  const encoded = encodeURIComponent(firmName);
  const data = await wikiGet(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encoded}&limit=5&namespace=0&format=json&utf8=1`
  );
  if (!data || !Array.isArray(data)) return null;
  const titles: string[] = data[1] || [];
  if (titles.length === 0) return null;

  const normFirm = norm(firmName);
  // Prefer a title that closely matches the firm name
  for (const t of titles) {
    if (norm(t).includes(normFirm) || normFirm.includes(norm(t))) return t;
  }
  return titles[0]; // best autocomplete match
}

/**
 * Strategy C — full-text search (broad fallback).
 * Tries multiple query variants to maximize recall.
 */
async function lookupSearch(firmName: string): Promise<string | null> {
  const FINANCE_KEYWORDS = ["venture capital", "private equity", "investment firm", "asset management", "fund"];
  const normFirm = norm(firmName);

  for (const kw of ["", ...FINANCE_KEYWORDS]) {
    const query = encodeURIComponent(kw ? `${firmName} ${kw}` : firmName);
    const data = await wikiGet(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&format=json&utf8=1&srlimit=5`
    );
    const results: Array<{ title: string; snippet: string }> = data?.query?.search || [];
    for (const r of results) {
      const normTitle = norm(r.title);
      const snippet = r.snippet.toLowerCase();
      const titleMatch = normTitle.includes(normFirm) || normFirm.includes(normTitle);
      const snippetMatch = FINANCE_KEYWORDS.some((k) => snippet.includes(k));
      if (titleMatch || snippetMatch) return r.title;
    }
    if (results.length > 0) return results[0].title; // take best match even without keywords
    await sleep(200); // small gap between variant queries
  }
  return null;
}

/** Try all three strategies, stop at first hit. */
async function findWikipediaTitle(firmName: string): Promise<string | null> {
  return (
    (await lookupDirect(firmName)) ??
    (await lookupOpenSearch(firmName)) ??
    (await lookupSearch(firmName))
  );
}

/** Fetch raw wikitext for a title. Returns null if missing / disambiguation. */
async function fetchWikitext(title: string): Promise<string | null> {
  const data = await wikiGet(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&format=json&utf8=1&rvslots=*`
  );
  if (!data) return null;
  const pages = Object.values(data?.query?.pages || {}) as any[];
  const page = pages[0];
  if (!page || page.missing !== undefined) return null;
  // Handle both old and new slot formats
  const content: string =
    page?.revisions?.[0]?.slots?.main?.["*"] ||
    page?.revisions?.[0]?.["*"] ||
    "";
  if (!content || content.toLowerCase().includes("#redirect")) return null;
  if (content.toLowerCase().includes("disambiguation")) return null;
  return content;
}

/** Fetch the REST summary (thumbnail / original image). */
async function fetchWikiSummary(title: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: WIKI_HEADERS, signal: AbortSignal.timeout(TIMEOUT) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.originalimage?.source || data?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

// ── Wikitext parsing ──────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Extract a URL from typical Wikipedia website field patterns:
 *   {{URL|https://example.com}}
 *   {{URL|https://example.com|Example}}
 *   [https://example.com Example]
 *   https://example.com
 */
function extractUrl(raw: string): string | null {
  // {{URL|...}} template
  const tplMatch = raw.match(/\{\{URL\s*\|\s*(https?:\/\/[^|}[\]\s]+)/i);
  if (tplMatch) return tplMatch[1].replace(/\/$/, "");

  // [https://... label] external link
  const extMatch = raw.match(/\[?(https?:\/\/[^|\]}\s]+)/);
  if (extMatch) return extMatch[1].replace(/\/$/, "");

  // Plain URL
  const plainMatch = raw.match(/https?:\/\/[^\s|}\]]+/);
  if (plainMatch) return plainMatch[0].replace(/\/$/, "");

  return null;
}

/** Strip wiki markup from a plain-text field value. */
function stripMarkup(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/\[https?:[^\]]*\]/g, "")
    .trim();
}

/**
 * Extract a field value from a wikitext infobox.
 * Handles multi-key aliases and nested {{ }} by scanning character by character.
 */
function infoboxField(wikitext: string, ...keys: string[]): string | null {
  for (const key of keys) {
    // Match "| key = value" or "| key= value"
    const re = new RegExp(`\\|\\s*${key}\\s*=\\s*`, "i");
    const m = re.exec(wikitext);
    if (!m) continue;

    const start = m.index + m[0].length;
    // Collect characters until we hit an unbalanced | or }} (infobox end)
    let depth = 0;
    let i = start;
    while (i < wikitext.length) {
      const ch = wikitext[i];
      if (ch === "{" && wikitext[i + 1] === "{") { depth++; i += 2; continue; }
      if (ch === "}" && wikitext[i + 1] === "}") {
        if (depth === 0) break;
        depth--; i += 2; continue;
      }
      // Unescaped pipe at depth 0 = next field
      if (ch === "|" && depth === 0) break;
      if (ch === "\n" && depth === 0) break;
      i++;
    }

    const raw = wikitext.slice(start, i).trim();
    if (raw.length > 0) return raw;
  }
  return null;
}

/** Parse city / state / country from a raw HQ string. */
function parseHq(raw: string): { hq_city?: string; hq_state?: string; hq_country?: string } {
  const clean = stripMarkup(raw).replace(/\s+/g, " ").trim();
  const parts = clean.split(/[,/]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return {};

  const US_STATE_ABBR = new Set([
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC",
  ]);
  const US_STATE_NAMES = new Set([
    "california","new york","texas","florida","massachusetts","washington",
    "illinois","georgia","colorado","connecticut","new jersey","pennsylvania",
    "ohio","north carolina","virginia","maryland","minnesota","michigan",
    "utah","oregon","arizona","nevada","wisconsin","indiana","tennessee",
    "missouri","louisiana","kentucky","alabama","south carolina","iowa",
  ]);

  const result: { hq_city?: string; hq_state?: string; hq_country?: string } = {};
  result.hq_city = parts[0];

  if (parts.length >= 2) {
    const p2 = parts[1].trim();
    if (US_STATE_ABBR.has(p2.toUpperCase()) || US_STATE_NAMES.has(p2.toLowerCase())) {
      result.hq_state = p2;
      result.hq_country = parts[2] || "USA";
    } else if (parts.length >= 3) {
      result.hq_state = p2;
      result.hq_country = parts[2];
    } else {
      result.hq_country = p2;
    }
  }

  return result;
}

/** Parse AUM into a tidy label like "$500M" or "$1.2B". */
function parseAum(raw: string): string | null {
  const clean = stripMarkup(raw)
    .replace(/US\$?|USD|\$|,/gi, "")
    .trim();
  if (!clean) return null;
  const m = clean.match(/([\d.]+)\s*([BMKbmk](?:illion)?)?/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!isFinite(num) || num <= 0) return null;
  const suffix = (m[2] || "").toLowerCase();
  let usd = num;
  if (suffix.startsWith("b"))      usd = num * 1e9;
  else if (suffix.startsWith("m")) usd = num * 1e6;
  else if (suffix.startsWith("k")) usd = num * 1e3;
  else if (num < 500)              usd = num * 1e9; // bare number, assume billions
  else if (num < 500_000)          usd = num * 1e6; // assume millions
  else                             usd = num;

  if (usd >= 1e9) return `$${+(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${Math.round(usd / 1e6)}M`;
  if (usd >= 1e3) return `$${Math.round(usd / 1e3)}K`;
  return null;
}

/** Parse headcount from a raw string. */
function parseHeadcount(raw: string): number | null {
  const clean = stripMarkup(raw).replace(/,/g, "");
  const range = clean.match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (range) return Math.round((+range[1] + +range[2]) / 2);
  const n = parseInt(clean, 10);
  return isFinite(n) && n > 0 ? n : null;
}

// ── Core per-firm logic ───────────────────────────────────────────────────────

async function enrichFirm(firm: FirmRow): Promise<{ title: string | null; patch: WikiPatch }> {
  const patch: WikiPatch = {};

  const title = await findWikipediaTitle(firm.firm_name);
  if (!title) return { title: null, patch };

  // Verify the found title actually relates to this firm
  const normFirm = norm(firm.firm_name);
  const normTitle = norm(title);
  const titleRelevant =
    normTitle.includes(normFirm) ||
    normFirm.includes(normTitle) ||
    normTitle.includes(normFirm.slice(0, Math.max(4, normFirm.length - 2)));
  if (!titleRelevant) {
    // Do a quick content check before giving up
    const preview = await wikiGet(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&exintro=1&exsentences=2&format=json&utf8=1`
    );
    const extract: string = Object.values(preview?.query?.pages || {})?.[0]?.extract || "";
    const isFinanceFirm = /venture capital|private equity|investment firm|fund manager|asset manager/i.test(extract);
    if (!isFinanceFirm) return { title: null, patch }; // not a VC/PE firm article
  }

  const [wikitext, logoUrl] = await Promise.all([
    fetchWikitext(title),
    !firm.logo_url ? fetchWikiSummary(title) : Promise.resolve(null),
  ]);

  // ── logo_url ──────────────────────────────────────────────────────────────
  if (!firm.logo_url && logoUrl) patch.logo_url = logoUrl;

  if (!wikitext) return { title, patch };

  // ── website_url ───────────────────────────────────────────────────────────
  if (!firm.website_url) {
    const raw = infoboxField(wikitext, "website", "url", "homepage", "web");
    if (raw) {
      const url = extractUrl(raw);
      if (url) patch.website_url = url;
    }
  }

  // ── aum ───────────────────────────────────────────────────────────────────
  if (!firm.aum) {
    const raw = infoboxField(wikitext, "aum", "assets_under_management", "assets", "fund_size");
    if (raw) {
      const parsed = parseAum(raw);
      if (parsed) patch.aum = parsed;
    }
  }

  // ── founded_year ──────────────────────────────────────────────────────────
  if (!firm.founded_year) {
    const raw = infoboxField(wikitext, "founded", "foundation", "year_founded", "established", "inception");
    const currentYear = new Date().getFullYear();
    const tryYear = (s: string) => {
      const yr = parseInt(s.match(/\d{4}/)?.[0] || "", 10);
      return yr > 1900 && yr <= currentYear ? yr : null;
    };
    const yr = raw ? tryYear(raw) : null;
    if (yr) {
      patch.founded_year = yr;
    } else {
      // Prose fallback
      const m = wikitext.match(/(?:founded|established|formed)\s+(?:in\s+)?(\d{4})/i);
      if (m) {
        const y = tryYear(m[1]);
        if (y) patch.founded_year = y;
      }
    }
  }

  // ── hq / location ─────────────────────────────────────────────────────────
  if (!firm.hq_city || !firm.hq_state || !firm.hq_country) {
    const raw = infoboxField(wikitext, "headquarters", "location", "hq", "city", "base");
    if (raw) {
      const hq = parseHq(raw);
      if (!firm.hq_city    && hq.hq_city)    patch.hq_city    = hq.hq_city;
      if (!firm.hq_state   && hq.hq_state)   patch.hq_state   = hq.hq_state;
      if (!firm.hq_country && hq.hq_country) patch.hq_country = hq.hq_country;
    }
  }

  // ── total_headcount ───────────────────────────────────────────────────────
  if (!firm.total_headcount) {
    const raw = infoboxField(wikitext, "num_employees", "employees", "headcount", "staff", "num_staff");
    if (raw) {
      const n = parseHeadcount(raw);
      if (n) patch.total_headcount = n;
    }
  }

  // ── email ─────────────────────────────────────────────────────────────────
  if (!firm.email) {
    const raw = infoboxField(wikitext, "email");
    if (raw && raw.includes("@")) patch.email = stripMarkup(raw);
  }

  return { title, patch };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"═".repeat(66)}`);
  console.log(`  Wikipedia Enrichment  ${DRY_RUN ? "(DRY RUN — no DB writes)" : ""}`);
  console.log(`${"═".repeat(66)}`);
  console.log(`  Max: ${MAX}  |  Delay: ${DELAY_MS}ms  |  Timeout: ${TIMEOUT}ms\n`);

  const { data: firms, error } = await supabase
    .from("firm_records")
    .select(
      "id, firm_name, website_url, logo_url, aum, email, hq_city, hq_state, hq_country, total_headcount, founded_year"
    )
    .or(
      [
        "website_url.is.null",
        "logo_url.is.null",
        "aum.is.null",
        "email.is.null",
        "hq_city.is.null",
        "total_headcount.is.null",
        "founded_year.is.null",
      ].join(",")
    )
    .is("deleted_at", null)
    .limit(MAX);

  if (error) {
    console.error("❌  Failed to load firms:", error.message);
    process.exit(1);
  }

  const total = firms?.length ?? 0;
  console.log(`  Loaded ${total} firms to process.\n`);

  let updated = 0;
  let skipped = 0;
  let noWiki  = 0;

  for (let i = 0; i < total; i++) {
    const firm = firms![i] as FirmRow;
    const prefix = `[${String(i + 1).padStart(4, " ")}/${total}]`;

    const { title, patch } = await enrichFirm(firm);

    if (!title) {
      console.log(`${prefix} ⚫  ${firm.firm_name}`);
      noWiki++;
    } else if (Object.keys(patch).length === 0) {
      console.log(`${prefix} ✔   ${firm.firm_name}  (wiki: "${title}")`);
      skipped++;
    } else {
      const fields = Object.keys(patch).join(", ");
      console.log(`${prefix} ✏️   ${firm.firm_name}  →  [${fields}]  (wiki: "${title}")`);

      if (!DRY_RUN) {
        const merged = (await augmentFirmRecordsPatchWithSupabase(supabase, firm.id, patch, "wikipedia_enrich")) as Record<
          string,
          unknown
        >;
        const { error: err } = await supabase
          .from("firm_records")
          .update({ ...merged, updated_at: new Date().toISOString() })
          .eq("id", firm.id);
        if (err) console.error(`       ❌  ${err.message}`);
        else updated++;
      } else {
        for (const [k, v] of Object.entries(patch)) {
          console.log(`       • ${k}: ${JSON.stringify(v)}`);
        }
        updated++;
      }
    }

    if (i < total - 1) await sleep(DELAY_MS);
  }

  console.log(`\n${"─".repeat(66)}`);
  console.log(`  ✏️   Updated : ${updated}`);
  console.log(`  ✔   Skipped : ${skipped}`);
  console.log(`  ⚫  No wiki : ${noWiki}`);
  console.log(`${"─".repeat(66)}\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
