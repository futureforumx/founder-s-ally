#!/usr/bin/env tsx
/**
 * promote-firm-websites.ts
 * ────────────────────────
 * Promotion pass: upgrades the strongest review candidates from
 * firm_website_candidates into canonical firm_records.website_url.
 *
 * This script does NOT re-search. It operates only on candidates
 * already stored in the review queue by backfill-firm-websites.ts.
 *
 * Promotion criteria (ALL must be true):
 *   1. Domain strongly matches firm name
 *   2. No close competing candidate (gap > 1 point OR no competitor)
 *   3. Candidate is root domain or safely normalizable
 *   4. Page does not reveal a clearly DIFFERENT firm identity
 *   5. firm_records.website_url is still NULL (idempotent)
 *
 * The key difference from the main pipeline's validation:
 *   - Uses a smarter alien-identity check that ignores generic VC
 *     phrases ("venture capital", "growth capital", etc.) which caused
 *     false-positive rejections in the main pass.
 *   - Does NOT require firm name to appear verbatim on page — domain
 *     match + no contradictory identity is sufficient for promotion.
 *
 * ENV:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   JINA_API_KEY          (page re-validation)
 *
 * FLAGS (env):
 *   DRY_RUN=true          — log but don't write (default: true)
 *   LIMIT=50              — max candidates to process
 *   MIN_SCORE=5           — minimum review score to consider
 *   DELAY_MS=1000         — delay between candidates
 */

import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const JINA_KEY = process.env.JINA_API_KEY || "";
const SCRAPINGBEE_KEY =
  process.env.SCRAPING_BEE_API_KEY || process.env.SCRAPINGBEE_API_KEY || "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const DRY_RUN = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
const LIMIT = parseInt(process.env.LIMIT || "50", 10);
const MIN_SCORE = parseFloat(process.env.MIN_SCORE || "5");
const DELAY_MS = parseInt(process.env.DELAY_MS || "1000", 10);

const SB_HEADERS: Record<string, string> = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Data types ────────────────────────────────────────────────────

interface ReviewRow {
  id: string;
  firm_id: string;
  candidate_url: string;
  domain: string;
  score: number;
  reason: string;
  competing_url: string | null;
  competing_score: number | null;
  fetch_method: string | null;
  // joined from firm_records
  firm_name: string;
  website_url: string | null;
}

interface PromoteResult {
  firmName: string;
  domain: string;
  score: number;
  outcome: "promoted" | "kept-review" | "skipped";
  reason: string;
}

// ── Fetch candidates from review queue ────────────────────────────

async function fetchReviewCandidates(): Promise<ReviewRow[]> {
  // Join firm_website_candidates with firm_records to get firm_name
  // and check website_url is still null.
  // PostgREST embedded resource: select from firm_website_candidates
  // and pull firm_name, website_url from the foreign key.
  const params = new URLSearchParams({
    select: "id,firm_id,candidate_url,domain,score,reason,competing_url,competing_score,fetch_method,firm_records(firm_name,website_url)",
    confidence: "eq.review",
    order: "score.desc",
    limit: String(LIMIT),
  });
  // Filter score >= MIN_SCORE via gte
  params.append("score", `gte.${MIN_SCORE}`);

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/firm_website_candidates?${params}`,
    { headers: { ...SB_HEADERS, Prefer: "count=exact" } }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase fetch failed (${res.status}): ${txt}`);
  }
  const totalCount = res.headers.get("content-range")?.match(/\/(\d+)/)?.[1];
  const raw: any[] = await res.json();

  // Flatten the joined data
  const rows: ReviewRow[] = raw.map((r) => ({
    id: r.id,
    firm_id: r.firm_id,
    candidate_url: r.candidate_url,
    domain: r.domain,
    score: parseFloat(r.score),
    reason: r.reason || "",
    competing_url: r.competing_url,
    competing_score: r.competing_score ? parseFloat(r.competing_score) : null,
    fetch_method: r.fetch_method,
    firm_name: r.firm_records?.firm_name || "",
    website_url: r.firm_records?.website_url || null,
  }));

  console.log(
    `📋 Fetched ${rows.length} review candidates (score ≥ ${MIN_SCORE}) of ~${totalCount ?? "?"} total in review`
  );
  return rows;
}

// ── Name / domain helpers (duplicated from backfill for standalone use) ─

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function firmNameTokens(name: string): string[] {
  const stopwords = new Set([
    "the","a","an","and","or","of","for","in","at","by","to","on","is",
    "fund","capital","ventures","venture","partners","group","management",
    "advisors","investments","investing","holdings","llc","lp","inc","corp",
  ]);
  const tokens = normalize(name).split(" ");
  const meaningful = tokens.filter((t) => !stopwords.has(t) && t.length > 1);
  return meaningful.length > 0 ? meaningful : tokens.filter((t) => t.length > 1);
}

function domainMatchesName(domain: string, firmName: string): boolean {
  const d = domain.replace(/^www\./, "").split(".")[0].toLowerCase();
  const tokens = firmNameTokens(firmName);
  if (tokens.length === 0) return false;
  const primary = tokens[0];
  if (primary.length >= 3 && d.includes(primary)) return true;
  const matches = tokens.filter((t) => t.length >= 3 && d.includes(t));
  return matches.length >= Math.ceil(tokens.length * 0.5);
}

function isRootishUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter((s) => s.length > 0);
    return segments.length <= 1;
  } catch {
    return false;
  }
}

function normalizeToRoot(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter((s) => s.length > 0);
    if (segments.length <= 1) {
      u.pathname = "/";
      u.search = "";
      u.hash = "";
    }
    if (u.protocol === "http:") u.protocol = "https:";
    let result = u.origin;
    if (result.endsWith("/")) result = result.slice(0, -1);
    return result;
  } catch {
    return url;
  }
}

// ── Smarter alien-identity check ─────────────────────────────────
//
// v2 — Patched 2026-04-05 to fix false alien-identity rejections.
//
// Problem: generic homepage phrases like "total capital", "working
// capital", "our investments", "select investments", "and partners"
// were being flagged as alien firm identities.
//
// Fix:
//   1. Strips generic VC/finance phrases BEFORE scanning (unchanged)
//   2. NEW: maintains a GENERIC_VOCAB set of single words that are
//      common in VC/finance homepage text but are NOT proper nouns.
//      If every meaningful token in the "name" part of a match is in
//      this set, the match is ignored (it's generic marketing text,
//      not a brand name).
//   3. NEW: requires the name part to contain at least one token that
//      looks like a proper noun / brand (i.e. NOT in GENERIC_VOCAB).
//   4. Logs the exact token/entity that triggered any rejection.
//
// ── Test cases (for future maintenance) ──────────────────────────
//
// SHOULD BE IGNORED (generic homepage language):
//   detectAlienIdentityStrict("total capital deployed...", "aal vc")          → null
//   detectAlienIdentityStrict("our investments span...", "aal vc")            → null
//   detectAlienIdentityStrict("working capital solutions", "aal vc")          → null
//   detectAlienIdentityStrict("growth capital for founders", "aal vc")        → null
//   detectAlienIdentityStrict("select investments in biotech", "aal vc")      → null
//   detectAlienIdentityStrict("strategic capital allocation", "aal vc")       → null
//   detectAlienIdentityStrict("the partners at the firm", "aal vc")           → null
//   detectAlienIdentityStrict("and partners are experienced", "aal vc")       → null
//   detectAlienIdentityStrict("professional network can leverage capital", "aal vc") → null
//   detectAlienIdentityStrict("focusing on early growth investments", "aal vc") → null
//
// SHOULD STILL TRIGGER REJECTION (clearly different firm name):
//   detectAlienIdentityStrict("Bain Capital is a leading...", "aal vc")       → "bain capital"
//   detectAlienIdentityStrict("468 Capital invests in...", "aal vc")          → "468 capital"
//   detectAlienIdentityStrict("Sequoia Capital leads...", "aal vc")           → "sequoia capital"
//   detectAlienIdentityStrict("Andreessen Horowitz partners", "some fund")    → "andreessen horowitz partners"
//   detectAlienIdentityStrict("Acme Ventures is...", "aal vc")               → "acme ventures"
//

const GENERIC_PHRASES = [
  /\b(venture|growth|seed|impact|social|human|intellectual|private|public)\s+(capital|equity|fund|funding)\b/gi,
  /\b(early|late|multi|pre|post)\s*[-]?\s*(stage|seed|series)\b/gi,
  /\b(angel|institutional|strategic|corporate)\s+(invest(or|ing|ment)s?)\b/gi,
  /\b(portfolio|startups?|founders?|entrepreneurs?)\b/gi,
  /\b(invest(ment|or|ing|s)?|fund(s|ing|ed)?|rais(e|es|ing)|deploy(ing)?)\b/gi,
  /\bvc\b/gi,
  /\b(bio|fin|deep|clean|health|med|ag|prop|gov|ed|insur|reg)\s*tech\b/gi,
  /\b(login|sign\s*in|sign\s*up|cookie|privacy|terms|legal)\b/gi,
];

const VC_SUFFIXES = [
  "capital", "ventures", "partners", "advisors", "holdings",
  "fund", "group", "investments", "management", "equity",
];

/**
 * Generic VC/finance vocabulary — single words that commonly appear
 * on fund/firm homepages as descriptive language, NOT as brand names.
 * If EVERY token in the "name" part of a "<Name> Capital" match falls
 * into this set, the match is treated as generic text and ignored.
 *
 * This list is intentionally broad. A real brand like "Bain" or "468"
 * will NOT be in this set, so "Bain Capital" still triggers rejection.
 */
const GENERIC_VOCAB = new Set([
  // VC/finance descriptors
  "capital", "venture", "ventures", "growth", "investments", "investing",
  "investment", "partners", "partner", "fund", "funds", "portfolio",
  "strategic", "team", "investors", "investor", "seed", "series",
  "health", "biotech", "digital", "assets", "operator", "operators",
  "equity", "advisory", "advisors", "management", "holdings",
  // Common adjectives/nouns on homepages (NOT brand names)
  "total", "our", "the", "their", "his", "her", "its", "your", "my",
  "all", "new", "next", "first", "global", "leading", "select",
  "selected", "focused", "focusing", "working", "early", "late",
  "stage", "multi", "pre", "post", "and", "or", "with", "for",
  "from", "about", "real", "deep", "long", "term", "full",
  "professional", "network", "leverage", "can", "are", "is",
  "was", "been", "being", "more", "other", "some", "many",
  "key", "core", "primary", "emerging", "established", "diverse",
  "impact", "social", "responsible", "sustainable", "clean", "green",
  "tech", "technology", "innovation", "innovative", "disruptive",
  "transformative", "platform", "ecosystem", "market", "markets",
  "private", "public", "corporate", "institutional", "family",
  "office", "wealth", "asset", "credit", "debt", "return",
  "returns", "risk", "value", "active", "passive",
]);

function detectAlienIdentityStrict(
  pageText: string,
  targetFirmName: string
): string | null {
  const normalizedTarget = normalize(targetFirmName);
  const targetTokens = new Set(firmNameTokens(targetFirmName));

  // Focus on the header zone (title + first ~800 chars)
  let headerZone = pageText.slice(0, 1200).toLowerCase();

  // Strip generic VC/finance phrases so they don't trigger false positives
  for (const re of GENERIC_PHRASES) {
    headerZone = headerZone.replace(re, " ");
  }
  // Collapse whitespace
  headerZone = headerZone.replace(/\s+/g, " ");

  // Now scan for "<Name> Capital|Ventures|Partners|..." patterns
  for (const suffix of VC_SUFFIXES) {
    // Require at least one non-suffix word before the suffix
    const re = new RegExp(`\\b([a-z0-9][a-z0-9]+(?: [a-z0-9][a-z0-9]+){0,3}) ${suffix}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(headerZone)) !== null) {
      const found = normalize(m[0]); // full match: "acme capital"
      const namepart = normalize(m[1]); // just the name: "acme"
      const nameTokens = namepart.split(" ").filter((t) => t.length > 0);

      // Skip very short matches (likely noise after stripping)
      if (namepart.length < 3) continue;

      // ── NEW: Skip if ALL name tokens are generic vocabulary ────
      // e.g. "total capital", "working capital", "select investments"
      const nonGenericTokens = nameTokens.filter((t) => !GENERIC_VOCAB.has(t));
      if (nonGenericTokens.length === 0) {
        // Every word is generic — this is homepage marketing text, not a brand
        continue;
      }

      // ── NEW: Skip short fragments (1-2 char non-generic tokens) ──
      // e.g. leftover noise like "re capital" after stripping
      if (nonGenericTokens.every((t) => t.length <= 2)) continue;

      // Skip if it IS our target (or substantially overlaps)
      if (normalizedTarget.includes(namepart) || namepart.includes(normalize([...targetTokens].join(" ")))) continue;
      if (normalizedTarget.includes(found) || found.includes(normalizedTarget)) continue;

      // ── NEW: Skip if non-generic tokens materially overlap target ──
      const overlapping = nonGenericTokens.filter((t) => targetTokens.has(t) || normalizedTarget.includes(t));
      if (overlapping.length >= nonGenericTokens.length) continue;

      // This looks like a specific, different firm — log details
      const triggerEntity = m[0].trim();
      const triggerTokens = nonGenericTokens.join(", ");
      console.log(`  🚨 Alien identity triggered by: "${triggerEntity}" (non-generic tokens: [${triggerTokens}])`);
      return triggerEntity;
    }
  }
  return null;
}

// ── Page fetching (lightweight, same 3-tier as backfill) ──────────

function extractTextFromHtml(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const metaDesc = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i
  );
  const ogTitle = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i
  );
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 3000);
  return [titleMatch?.[1] || "", ogTitle?.[1] || "", metaDesc?.[1] || "", bodyText].join(" ");
}

async function fetchPageText(url: string): Promise<{ text: string; method: string }> {
  // Tier 1: Jina
  if (JINA_KEY) {
    try {
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          Authorization: `Bearer ${JINA_KEY}`,
          Accept: "text/plain",
          "X-Return-Format": "markdown",
        },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const text = await res.text();
        if (!/access denied|forbidden|blocked|captcha/i.test(text.slice(0, 500))) {
          const trimmed = text.slice(0, 5000);
          if (trimmed.length >= 50) return { text: trimmed, method: "jina" };
        }
      }
    } catch {}
  }

  // Tier 2: Raw fetch
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const html = await res.text();
      const extracted = extractTextFromHtml(html);
      if (extracted.length >= 50) return { text: extracted, method: "raw" };
    }
  } catch {}

  // Tier 3: ScrapingBee
  if (SCRAPINGBEE_KEY) {
    try {
      const params = new URLSearchParams({
        api_key: SCRAPINGBEE_KEY,
        url,
        render_js: "false",
        premium_proxy: "false",
      });
      const res = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const html = await res.text();
        const extracted = extractTextFromHtml(html);
        if (extracted.length >= 50) return { text: extracted, method: "scrapingbee" };
      }
    } catch {}
  }

  return { text: "", method: "none" };
}

// ── Blocked domains (same as backfill) ───────────────────────────

const BLOCKED_DOMAINS = new Set([
  "linkedin.com","crunchbase.com","pitchbook.com","cbinsights.com",
  "signal.nfx.com","angel.co","wellfound.com","twitter.com","x.com",
  "facebook.com","instagram.com","youtube.com","tiktok.com","medium.com",
  "substack.com","reddit.com","wikipedia.org","bloomberg.com","reuters.com",
  "techcrunch.com","forbes.com","wsj.com","nytimes.com","ft.com","cnbc.com",
  "businessinsider.com","venturebeat.com","theinformation.com",
  "prnewswire.com","globenewswire.com","sec.gov","google.com","bing.com",
  "yahoo.com","amazon.com","apple.com","github.com","glassdoor.com",
  "indeed.com","yelp.com","vcsheet.com","openvc.app","trustfinta.com",
  "dealroom.co","tracxn.com",
]);

function isBlockedDomain(hostname: string): boolean {
  const h = hostname.replace(/^www\./, "").toLowerCase();
  for (const blocked of BLOCKED_DOMAINS) {
    if (h === blocked || h.endsWith("." + blocked)) return true;
  }
  return false;
}

// ── Supabase write helpers ───────────────────────────────────────

async function promoteToCanonical(
  firmId: string,
  canonicalUrl: string
): Promise<boolean> {
  if (DRY_RUN) return true;
  // Double-check website_url is still null (idempotent)
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/firm_records?id=eq.${firmId}&select=website_url`,
    { headers: SB_HEADERS }
  );
  if (checkRes.ok) {
    const rows = await checkRes.json();
    if (rows[0]?.website_url) {
      console.log(`  ⚠️  website_url already set — skipping write`);
      return false;
    }
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/firm_records?id=eq.${firmId}`,
    {
      method: "PATCH",
      headers: { ...SB_HEADERS, Prefer: "return=minimal" },
      body: JSON.stringify({
        website_url: canonicalUrl,
        last_enriched_at: new Date().toISOString(),
      }),
    }
  );
  return res.ok;
}

async function markPromoted(candidateId: string): Promise<boolean> {
  if (DRY_RUN) return true;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/firm_website_candidates?id=eq.${candidateId}`,
    {
      method: "PATCH",
      headers: { ...SB_HEADERS, Prefer: "return=minimal" },
      body: JSON.stringify({ confidence: "canonical" }),
    }
  );
  return res.ok;
}

// ── Core promotion logic for a single candidate ──────────────────

async function evaluateCandidate(row: ReviewRow): Promise<PromoteResult> {
  const r: PromoteResult = {
    firmName: row.firm_name,
    domain: row.domain,
    score: row.score,
    outcome: "skipped",
    reason: "",
  };

  // Gate 1: website_url must still be null
  if (row.website_url) {
    r.reason = "website_url already set";
    return r;
  }

  // Gate 2: domain must not be blocked
  if (isBlockedDomain(row.domain)) {
    r.reason = `blocked domain: ${row.domain}`;
    return r;
  }

  // Gate 3: domain must strongly match firm name
  if (!domainMatchesName(row.domain, row.firm_name)) {
    r.outcome = "kept-review";
    r.reason = "domain does not strongly match firm name";
    return r;
  }

  // Gate 4: no close competing candidate
  if (
    row.competing_url &&
    row.competing_score !== null &&
    row.score - row.competing_score <= 1
  ) {
    r.outcome = "kept-review";
    r.reason = `close competitor: ${row.competing_url} (${row.competing_score}) delta=${(row.score - row.competing_score).toFixed(1)}`;
    return r;
  }

  // Gate 5: must be root-ish or normalizable
  const canonicalUrl = normalizeToRoot(row.candidate_url);
  if (!isRootishUrl(canonicalUrl)) {
    r.outcome = "kept-review";
    r.reason = "non-root URL, cannot normalize";
    return r;
  }

  // Gate 6: re-fetch page and run smarter alien-identity check
  // We do NOT require firm name to appear on page (that's the old
  // brittle check). We only check for CONTRADICTORY identity.
  const fetchResult = await fetchPageText(canonicalUrl);
  console.log(`  🔍 Fetch: ${fetchResult.method} (${fetchResult.text.length} chars)`);

  if (fetchResult.text.length >= 50) {
    const alien = detectAlienIdentityStrict(fetchResult.text, row.firm_name);
    if (alien) {
      r.outcome = "kept-review";
      r.reason = `alien identity (strict): "${alien}" on page`;
      return r;
    }
  }
  // If fetch failed entirely, we still promote IF domain match is strong
  // and score is high — the domain IS the evidence.
  if (fetchResult.text.length < 50 && row.score < 6) {
    r.outcome = "kept-review";
    r.reason = `fetch failed and score ${row.score} < 6 for unfetched promotion`;
    return r;
  }

  // ── All gates passed — promote ─────────────────────────────────
  const writeOk = await promoteToCanonical(row.firm_id, canonicalUrl);
  if (!writeOk) {
    r.outcome = "kept-review";
    r.reason = "supabase write failed or already set";
    return r;
  }

  await markPromoted(row.id);

  r.outcome = "promoted";
  r.reason = DRY_RUN
    ? `would promote (dry run) [${fetchResult.method}, score=${row.score}]`
    : `promoted → ${canonicalUrl} [${fetchResult.method}, score=${row.score}]`;
  return r;
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  promote-firm-websites.ts (review → canonical)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Mode:        ${DRY_RUN ? "🔍 DRY RUN" : "✏️  LIVE WRITE"}`);
  console.log(`  Limit:       ${LIMIT}`);
  console.log(`  Min score:   ${MIN_SCORE}`);
  console.log(`  Delay:       ${DELAY_MS}ms`);
  console.log(`  Jina:        ${JINA_KEY ? "✅" : "❌"}`);
  console.log(`  ScrapingBee: ${SCRAPINGBEE_KEY ? "✅" : "❌"}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const candidates = await fetchReviewCandidates();
  if (candidates.length === 0) {
    console.log("No review candidates found. Exiting.");
    return;
  }

  const startTime = Date.now();
  const results: PromoteResult[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    console.log(
      `\n[${i + 1}/${candidates.length}] ${row.firm_name} → ${row.domain} (score=${row.score})`
    );
    try {
      const result = await evaluateCandidate(row);
      results.push(result);
      const icon =
        result.outcome === "promoted" ? "✅" :
        result.outcome === "kept-review" ? "📝" : "⏭️";
      console.log(`  ${icon} ${result.outcome} — ${result.reason}`);
    } catch (e: any) {
      console.error(`  ❌ Error: ${e.message}`);
      results.push({
        firmName: row.firm_name,
        domain: row.domain,
        score: row.score,
        outcome: "skipped",
        reason: `error: ${e.message}`,
      });
    }
    if (i < candidates.length - 1) await sleep(DELAY_MS);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── Summary ────────────────────────────────────────────────────
  const promoted = results.filter((r) => r.outcome === "promoted");
  const kept = results.filter((r) => r.outcome === "kept-review");
  const skipped = results.filter((r) => r.outcome === "skipped");

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  PROMOTION SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Evaluated:       ${results.length}`);
  console.log(`  ✅ Promoted:      ${promoted.length} ${DRY_RUN ? "(would promote)" : "→ firm_records.website_url"}`);
  console.log(`  📝 Kept in review: ${kept.length}`);
  console.log(`  ⏭️  Skipped:       ${skipped.length}`);
  console.log(`  Time:            ${elapsed}s`);
  console.log(
    `  Promotion rate:  ${results.length > 0 ? ((promoted.length / results.length) * 100).toFixed(1) : 0}%`
  );
  console.log("═══════════════════════════════════════════════════════════\n");

  // Kept-in-review reasons
  if (kept.length > 0) {
    const reasonCounts: Record<string, number> = {};
    for (const k of kept) {
      reasonCounts[k.reason] = (reasonCounts[k.reason] || 0) + 1;
    }
    console.log("Review-kept reasons:");
    for (const [reason, count] of Object.entries(reasonCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${count}x — ${reason}`);
    }
  }

  // Promoted details
  if (promoted.length > 0) {
    console.log("\n✅ Promoted:");
    for (const p of promoted) {
      console.log(`  ${p.firmName} → ${p.domain} [score=${p.score}] ${p.reason}`);
    }
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
