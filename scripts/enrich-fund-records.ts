/**
 * enrich-fund-records.ts
 *
 * Deterministic fund enrichment pipeline:
 *   1. Candidate discovery   — Direct website fetch → subpage crawl → Exa search → Jina
 *   2. Extraction            — Gemini JSON extraction from collected text
 *   3. Normalization         — Normalize fund names, numbers, suffixes
 *   4. Deduplication         — Match against existing funds + aliases
 *   5. Firm linking          — Attach each fund to the correct firm_id
 *   6. Confidence scoring    — Score based on source quality
 *   7. Write or review queue — High confidence → upsert; low → review queue
 *
 * Idempotent: reruns will update existing records (if higher confidence) but never
 * create duplicates. Uses (firm_id, normalized_fund_name) as the dedup key.
 *
 * Usage:
 *   tsx scripts/enrich-fund-records.ts
 *   FUND_ENRICH_MAX=10 tsx scripts/enrich-fund-records.ts
 *   FUND_ENRICH_FIRM_SLUG=sequoia-capital tsx scripts/enrich-fund-records.ts
 *
 * Env vars (from .env / .env.local):
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *   GEMINI_API_KEY
 *   TAVILY_API_KEY            (optional — skipped if missing or FUND_ENRICH_DISABLE_TAVILY=true)
 *   JINA_API_KEY              (optional — skipped if missing or FUND_ENRICH_DISABLE_JINA=true)
 *   FUND_ENRICH_DISABLE_EXA     set "true" to bypass Exa search entirely
 *   FUND_ENRICH_DISABLE_JINA    set "true" to bypass Jina entirely
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeFundName,
  extractFundNumber,
  fundNameVariants,
  fundNameSimilarity,
} from "../src/lib/fundNameNormalizer";

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

function loadEnv(): void {
  const root = process.cwd();
  for (const name of [".env", ".env.local", ".env.enrichment"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] !== undefined) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const EXA_KEY = process.env.EXA_API_KEY || "";
const JINA_KEY = process.env.JINA_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GROQ_KEY = process.env.GROQ_API_KEY || "";
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || "";

const MAX_FIRMS = Math.max(1, parseInt(process.env.FUND_ENRICH_MAX || "50", 10));
const TARGET_FIRM_SLUG = process.env.FUND_ENRICH_FIRM_SLUG || "";
const DELAY_MS = Math.max(0, parseInt(process.env.FUND_ENRICH_DELAY_MS || "1000", 10));
const CONFIDENCE_THRESHOLD = parseFloat(process.env.FUND_CONFIDENCE_THRESHOLD || "0.75");
const MAX_RETRIES = parseInt(process.env.FUND_ENRICH_RETRIES || "1", 10);
const JACCARD_THRESHOLD = 0.90;
const MIN_TEXT_LENGTH = 1000;

const DISABLE_EXA = process.env.FUND_ENRICH_DISABLE_EXA?.toLowerCase() === "true";
const DISABLE_JINA = process.env.FUND_ENRICH_DISABLE_JINA?.toLowerCase() === "true";

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set.");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY is not set.");

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FirmRow {
  id: string;
  firm_name: string;
  website_url: string | null;
  slug: string | null;
}

interface CandidateFund {
  fund_name: string;
  normalized_fund_name: string;
  fund_number: number | null;
  fund_type: string | null;
  strategy: string | null;
  stage_focus: string[];
  sector_focus: string[];
  geo_focus: string[];
  vintage_year: number | null;
  target_size_usd: number | null;
  final_close_size_usd: number | null;
  size_usd: number | null;
  currency: string;
  status: string | null;
  source_url: string | null;
  source_type: string;
  source_confidence: number;
  evidence_quote: string | null;
  raw_payload: unknown;
}

interface AuditSummary {
  firms_processed: number;
  funds_discovered: number;
  funds_inserted: number;
  funds_updated: number;
  duplicates_merged: number;
  review_items_created: number;
  failures: number;
  details: string[];
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

const SOURCE_CONFIDENCE: Record<string, number> = {
  official_website: 0.95,
  sec_filing: 0.90,
  crunchbase: 0.85,
  pitchbook: 0.85,
  preqin: 0.85,
  press_release: 0.80,
  lp_disclosure: 0.80,
  news_article: 0.70,
  secondary_aggregator: 0.60,
  ai_inferred: 0.40,
  manual: 0.90,
  other: 0.50,
};

function extractDomain(raw: string): string | null {
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function classifySource(sourceUrl: string | null, firmWebsiteUrl: string | null): string {
  if (!sourceUrl) return "ai_inferred";
  const lower = sourceUrl.toLowerCase();
  if (lower.includes("sec.gov") || lower.includes("edgar")) return "sec_filing";
  if (lower.includes("crunchbase.com")) return "crunchbase";
  if (lower.includes("pitchbook.com")) return "pitchbook";
  if (lower.includes("preqin.com")) return "preqin";
  if (lower.includes("prnewswire.com") || lower.includes("businesswire.com") || lower.includes("globenewswire.com"))
    return "press_release";
  if (firmWebsiteUrl) {
    const firmDomain = extractDomain(firmWebsiteUrl);
    const sourceDomain = extractDomain(sourceUrl);
    if (firmDomain && sourceDomain && (sourceDomain === firmDomain || sourceDomain.endsWith(`.${firmDomain}`)))
      return "official_website";
  }
  if (/techcrunch|bloomberg|reuters|wsj|fortune|forbes|axios|theinformation/i.test(lower))
    return "news_article";
  return "secondary_aggregator";
}

function scoreConfidence(sourceType: string, hasMultipleSources: boolean, hasQuote: boolean): number {
  let base = SOURCE_CONFIDENCE[sourceType] ?? 0.50;
  if (hasMultipleSources) base = Math.min(1.0, base + 0.05);
  if (hasQuote) base = Math.min(1.0, base + 0.03);
  return Math.round(base * 100) / 100;
}

// ---------------------------------------------------------------------------
// HTML → plain text (minimal, no deps)
// ---------------------------------------------------------------------------

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Source 1: Direct website fetch (homepage + subpages)
// ---------------------------------------------------------------------------

const FUND_SUBPATHS = [
  "/funds",
  "/portfolio",
  "/about",
  "/team",
  "/strategy",
  "/venture",
  "/investments",
];

async function directFetch(url: string, label: string): Promise<{ text: string; len: number }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VektaBot/1.0; +https://vekta.co)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.log(`    [direct] ${label} → HTTP ${res.status}`);
      return { text: "", len: 0 };
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml")) {
      console.log(`    [direct] ${label} → non-HTML (${contentType.split(";")[0]})`);
      return { text: "", len: 0 };
    }
    const raw = await res.text();
    const text = htmlToText(raw);
    console.log(`    [direct] ${label} → ${text.length} chars`);
    return { text: text.slice(0, 60_000), len: text.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`    [direct] ${label} → FAIL (${msg.slice(0, 80)})`);
    return { text: "", len: 0 };
  }
}

function normalizeBaseUrl(raw: string): string {
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  // Strip trailing slash
  return u.replace(/\/+$/, "");
}

async function fetchWebsiteContent(websiteUrl: string): Promise<{ pages: { url: string; text: string }[]; totalLen: number }> {
  const base = normalizeBaseUrl(websiteUrl);
  const pages: { url: string; text: string }[] = [];
  let totalLen = 0;

  // 1a. Homepage
  const home = await directFetch(base, "homepage");
  if (home.len > 0) {
    pages.push({ url: base, text: home.text });
    totalLen += home.len;
  }

  // 1b. Fund-related subpages — fetch concurrently
  const subResults = await Promise.allSettled(
    FUND_SUBPATHS.map(async (path) => {
      const url = `${base}${path}`;
      const result = await directFetch(url, path);
      return { url, ...result };
    })
  );

  for (const r of subResults) {
    if (r.status === "fulfilled" && r.value.len > 200) {
      pages.push({ url: r.value.url, text: r.value.text });
      totalLen += r.value.len;
    }
  }

  return { pages, totalLen };
}

// ---------------------------------------------------------------------------
// Source 2: Exa search (replaces Tavily)
// Docs: https://docs.exa.ai/reference/search
// ---------------------------------------------------------------------------

async function searchExa(firmName: string): Promise<string> {
  if (DISABLE_EXA) {
    console.log("    [exa] DISABLED via FUND_ENRICH_DISABLE_EXA");
    return "";
  }
  if (!EXA_KEY) {
    console.log("    [exa] No API key — skipping");
    return "";
  }
  console.log(`    [exa] Searching: "${firmName}" funds`);
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": EXA_KEY,
      },
      body: JSON.stringify({
        query: `${firmName} venture capital fund vehicles fund size vintage year`,
        type: "auto",
        numResults: 8,
        contents: {
          text: { maxCharacters: 2000 },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.log(`    [exa] HTTP ${res.status} — skipping`);
      return "";
    }
    const data = await res.json();
    const parts: string[] = [];
    for (const item of data.results ?? []) {
      const title = item.title || "";
      const content = (item.text || "").slice(0, 2000);
      const url = item.url || "";
      if (title || content) parts.push(`- ${title} (${url})\n  ${content}`);
    }
    const text = parts.join("\n\n");
    console.log(`    [exa] ${text.length} chars collected from ${(data.results ?? []).length} results`);
    return text;
  } catch (e) {
    console.log(`    [exa] FAIL: ${e instanceof Error ? e.message : e}`);
    return "";
  }
}

// ---------------------------------------------------------------------------
// Source 3: Jina Reader (last fallback)
// ---------------------------------------------------------------------------

async function scrapeWithJina(url: string): Promise<string> {
  if (DISABLE_JINA) {
    console.log("    [jina] DISABLED via FUND_ENRICH_DISABLE_JINA");
    return "";
  }
  if (!url?.startsWith("http")) return "";
  console.log(`    [jina] Reading: ${url}`);
  try {
    const headers: Record<string, string> = {};
    if (JINA_KEY) headers["Authorization"] = `Bearer ${JINA_KEY}`;
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.log(`    [jina] HTTP ${res.status} — skipping`);
      return "";
    }
    const text = await res.text();
    console.log(`    [jina] ${text.length} chars collected`);
    return text.slice(0, 100_000);
  } catch (e) {
    console.log(`    [jina] FAIL: ${e instanceof Error ? e.message : e}`);
    return "";
  }
}

// ---------------------------------------------------------------------------
// Extraction: Gemini fund extraction
// ---------------------------------------------------------------------------

interface GeminiFundResult {
  funds: Array<{
    fund_name: string;
    fund_type?: string;
    strategy?: string;
    stage_focus?: string[];
    sector_focus?: string[];
    geo_focus?: string[];
    vintage_year?: number | null;
    target_size_usd?: number | null;
    final_close_size_usd?: number | null;
    size_usd?: number | null;
    currency?: string;
    status?: string;
    source_url?: string;
    evidence_quote?: string;
  }>;
}

async function extractFundsWithGemini(
  firmName: string,
  websiteContent: string,
  searchContent: string
): Promise<GeminiFundResult> {
  console.log(`    [gemini] Extracting funds (model=${GEMINI_MODEL})`);

  const prompt = `You are a venture capital data analyst. Extract ALL fund vehicles managed by "${firmName}".

--- Official website content ---
${websiteContent.slice(0, 100_000)}

--- Web search / secondary context ---
${searchContent.slice(0, 60_000)}

Rules:
- Only extract funds that are EXPLICITLY mentioned in the sources above.
- Do NOT invent fund names, sizes, or dates.
- If information is unknown, use null.
- Include the exact quote from the source that mentions each fund as "evidence_quote".
- Each fund should be a distinct investment vehicle (e.g. "Sequoia Capital Fund XIV", "Sequoia Capital Global Growth Fund III").

Return JSON:
{
  "funds": [
    {
      "fund_name": "Full fund name as stated in source",
      "fund_type": "traditional|rolling|syndicate|micro|cvc|family_office",
      "strategy": "Brief strategy description",
      "stage_focus": ["pre_seed", "seed", "series_a", "series_b", "growth"],
      "sector_focus": ["fintech", "enterprise_saas", "ai", "healthtech", ...],
      "geo_focus": ["US", "Europe", "Asia", ...],
      "vintage_year": 2024,
      "target_size_usd": 500000000,
      "final_close_size_usd": 550000000,
      "size_usd": 550000000,
      "currency": "USD",
      "status": "active|closed|forming|winding_down",
      "source_url": "https://...",
      "evidence_quote": "Exact quote from source mentioning this fund"
    }
  ]
}`;

  // Try Gemini first with retry for 429
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(60_000),
        }
      );

      if (res.status === 429) {
        if (attempt < 2) {
          const wait = (attempt + 1) * 10_000;
          console.log(`    [gemini] HTTP 429 — waiting ${wait / 1000}s (attempt ${attempt + 1}/3)`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        console.log(`    [gemini] HTTP 429 — exhausted retries, falling back to Groq`);
        break; // fall through to Groq
      }

      if (!res.ok) {
        console.log(`    [gemini] HTTP ${res.status}`);
        break; // fall through to Groq
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
      const parsed = JSON.parse(cleaned) as GeminiFundResult;
      return parsed?.funds ? parsed : { funds: [] };
    } catch (e) {
      console.log(`    [gemini] FAIL: ${e instanceof Error ? e.message : e}`);
      break; // fall through to Groq
    }
  }

  // Build a shorter prompt for fallback LLMs (smaller context windows)
  const fallbackPrompt = `You are a venture capital data analyst. Extract ALL fund vehicles managed by "${firmName}".

--- Website content (trimmed) ---
${websiteContent.slice(0, 18_000)}

--- Search context (trimmed) ---
${searchContent.slice(0, 6_000)}

Rules:
- Only extract funds EXPLICITLY mentioned above. Do NOT invent data.
- If unknown, use null. Include evidence_quote from source.

Return JSON: {"funds":[{"fund_name":"...","fund_type":"traditional|rolling|syndicate|micro|cvc|family_office","strategy":"...","stage_focus":[],"sector_focus":[],"geo_focus":[],"vintage_year":null,"target_size_usd":null,"final_close_size_usd":null,"size_usd":null,"currency":"USD","status":"active|closed|forming|winding_down","source_url":"...","evidence_quote":"..."}]}`;

  // Fallback 1: Groq (Llama)
  if (GROQ_KEY) {
    console.log(`    [groq] Falling back to Groq Llama`);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: fallbackPrompt }],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || "";
        const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
        const parsed = JSON.parse(cleaned) as GeminiFundResult;
        if (parsed?.funds?.length) return parsed;
      } else {
        console.log(`    [groq] HTTP ${res.status}`);
      }
    } catch (e) {
      console.log(`    [groq] FAIL: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Fallback 2: DeepSeek
  if (DEEPSEEK_KEY) {
    console.log(`    [deepseek] Falling back to DeepSeek`);
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: fallbackPrompt }],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || "";
        const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
        const parsed = JSON.parse(cleaned) as GeminiFundResult;
        if (parsed?.funds?.length) return parsed;
        console.log(`    [deepseek] No funds in response`);
      } else {
        console.log(`    [deepseek] HTTP ${res.status}`);
      }
    } catch (e) {
      console.log(`    [deepseek] FAIL: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log("    [extraction] All LLMs exhausted — no funds extracted");
  return { funds: [] };
}

// ---------------------------------------------------------------------------
// Pipeline stage 3: Normalization
// ---------------------------------------------------------------------------

function normalizeCandidates(
  rawFunds: GeminiFundResult["funds"],
  firmName: string,
  firmWebsite: string | null
): CandidateFund[] {
  const candidates: CandidateFund[] = [];

  for (const raw of rawFunds) {
    if (!raw.fund_name?.trim()) continue;

    const fundName = raw.fund_name.trim();
    const normalized = normalizeFundName(fundName);
    if (!normalized) continue;

    const sourceType = classifySource(raw.source_url ?? null, firmWebsite);
    const hasQuote = !!raw.evidence_quote?.trim();
    const confidence = scoreConfidence(sourceType, false, hasQuote);

    candidates.push({
      fund_name: fundName,
      normalized_fund_name: normalized,
      fund_number: extractFundNumber(fundName),
      fund_type: raw.fund_type?.toLowerCase() || null,
      strategy: raw.strategy || null,
      stage_focus: (raw.stage_focus ?? []).map((s) => s.toUpperCase().replace(/[\s-]/g, "_")),
      sector_focus: (raw.sector_focus ?? []).map((s) => s.toUpperCase().replace(/[\s-]/g, "_")),
      geo_focus: raw.geo_focus ?? [],
      vintage_year: raw.vintage_year || null,
      target_size_usd: raw.target_size_usd || null,
      final_close_size_usd: raw.final_close_size_usd || null,
      size_usd: raw.size_usd ?? raw.final_close_size_usd ?? raw.target_size_usd ?? null,
      currency: raw.currency || "USD",
      status: raw.status?.toLowerCase() || null,
      source_url: raw.source_url || null,
      source_type: sourceType,
      source_confidence: confidence,
      evidence_quote: raw.evidence_quote || null,
      raw_payload: raw,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Pipeline stage 4: Deduplication
// ---------------------------------------------------------------------------

function deduplicateCandidates(candidates: CandidateFund[]): CandidateFund[] {
  const seen = new Map<string, CandidateFund>();

  for (const c of candidates) {
    const existing = seen.get(c.normalized_fund_name);
    if (!existing) {
      seen.set(c.normalized_fund_name, c);
    } else {
      if (c.source_confidence > existing.source_confidence) {
        const merged = { ...c };
        if (!merged.vintage_year && existing.vintage_year) merged.vintage_year = existing.vintage_year;
        if (!merged.size_usd && existing.size_usd) merged.size_usd = existing.size_usd;
        if (!merged.target_size_usd && existing.target_size_usd) merged.target_size_usd = existing.target_size_usd;
        if (!merged.final_close_size_usd && existing.final_close_size_usd) merged.final_close_size_usd = existing.final_close_size_usd;
        if (!merged.strategy && existing.strategy) merged.strategy = existing.strategy;
        if (!merged.status && existing.status) merged.status = existing.status;
        seen.set(c.normalized_fund_name, merged);
      } else {
        if (!existing.vintage_year && c.vintage_year) existing.vintage_year = c.vintage_year;
        if (!existing.size_usd && c.size_usd) existing.size_usd = c.size_usd;
        if (!existing.target_size_usd && c.target_size_usd) existing.target_size_usd = c.target_size_usd;
        if (!existing.final_close_size_usd && c.final_close_size_usd) existing.final_close_size_usd = c.final_close_size_usd;
        if (!existing.strategy && c.strategy) existing.strategy = c.strategy;
        if (!existing.status && c.status) existing.status = c.status;
      }
    }
  }

  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Pipeline stage 5-7: Link, score, write/queue
// ---------------------------------------------------------------------------

async function processCandidate(
  sb: SupabaseClient,
  firmId: string,
  firmName: string,
  candidate: CandidateFund,
  audit: AuditSummary
): Promise<void> {
  const normalizedName = candidate.normalized_fund_name;
  const variants = fundNameVariants(candidate.fund_name);

  const { data: existingFunds } = await sb
    .from("fund_records")
    .select("id, fund_name, normalized_fund_name, confidence")
    .eq("firm_id", firmId)
    .is("deleted_at", null);

  let matchedFundId: string | null = null;
  let matchedConfidence = 0;

  for (const ef of existingFunds ?? []) {
    if (ef.normalized_fund_name === normalizedName) {
      matchedFundId = ef.id;
      matchedConfidence = parseFloat(ef.confidence ?? "0");
      break;
    }
  }

  if (!matchedFundId) {
    for (const variant of variants) {
      const { data: aliasMatch } = await sb
        .from("fund_aliases")
        .select("fund_id")
        .eq("normalized_value", variant)
        .limit(1);
      if (aliasMatch?.length) {
        const { data: fundCheck } = await sb
          .from("fund_records")
          .select("id, confidence")
          .eq("id", aliasMatch[0].fund_id)
          .eq("firm_id", firmId)
          .is("deleted_at", null)
          .limit(1);
        if (fundCheck?.length) {
          matchedFundId = fundCheck[0].id;
          matchedConfidence = parseFloat(fundCheck[0].confidence ?? "0");
          break;
        }
      }
    }
  }

  if (!matchedFundId) {
    let bestSim = 0;
    let bestMatch: (typeof existingFunds extends (infer T)[] | null ? T : never) = null as any;
    for (const ef of existingFunds ?? []) {
      const sim = fundNameSimilarity(candidate.fund_name, ef.fund_name);
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = ef;
      }
    }
    if (bestSim >= JACCARD_THRESHOLD && bestMatch) {
      matchedFundId = bestMatch.id;
      matchedConfidence = parseFloat(bestMatch.confidence ?? "0");
      audit.duplicates_merged++;
    }
  }

  // Guard: short normalized name → review
  const tokenCount = candidate.normalized_fund_name.split(" ").filter(Boolean).length;
  if (tokenCount <= 1) {
    await sb.from("enrichment_review_queue").insert({
      entity_type: "fund",
      entity_id: matchedFundId || "new",
      firm_id: firmId,
      reason: `Normalized fund name too short ("${candidate.normalized_fund_name}" from "${candidate.fund_name}") — high false-merge risk.`,
      review_data: { candidate, matched_fund_id: matchedFundId },
      status: "pending",
    });
    audit.review_items_created++;
    audit.details.push(`  REVIEW (short name): "${candidate.fund_name}" → "${candidate.normalized_fund_name}"`);
    return;
  }

  // Guard: vintage year conflict
  if (matchedFundId && candidate.vintage_year) {
    const { data: existingVintage } = await sb
      .from("fund_records")
      .select("vintage_year")
      .eq("id", matchedFundId)
      .single();
    if (existingVintage?.vintage_year && existingVintage.vintage_year !== candidate.vintage_year) {
      await sb.from("enrichment_review_queue").insert({
        entity_type: "fund",
        entity_id: matchedFundId,
        firm_id: firmId,
        reason: `Vintage year conflict: existing=${existingVintage.vintage_year}, candidate=${candidate.vintage_year} for "${candidate.fund_name}". May be a separate fund vehicle.`,
        review_data: { candidate, matched_fund_id: matchedFundId, existing_vintage: existingVintage.vintage_year },
        status: "pending",
      });
      audit.review_items_created++;
      audit.details.push(`  REVIEW (vintage conflict): "${candidate.fund_name}" existing=${existingVintage.vintage_year} vs new=${candidate.vintage_year}`);
      await storeEvidence(sb, matchedFundId, candidate);
      return;
    }
  }

  // Guard: low confidence → review
  if (candidate.source_confidence < CONFIDENCE_THRESHOLD) {
    await sb.from("enrichment_review_queue").insert({
      entity_type: "fund",
      entity_id: matchedFundId || "new",
      firm_id: firmId,
      reason: `Low confidence (${candidate.source_confidence}) fund "${candidate.fund_name}" for firm "${firmName}". Source: ${candidate.source_type}.`,
      review_data: { candidate, matched_fund_id: matchedFundId, matched_confidence: matchedConfidence },
      status: "pending",
    });
    audit.review_items_created++;
    audit.details.push(`  REVIEW: "${candidate.fund_name}" (conf=${candidate.source_confidence})`);
    return;
  }

  // Build record
  const fundData: Record<string, unknown> = {
    firm_id: firmId,
    fund_name: candidate.fund_name,
    normalized_fund_name: normalizedName,
    fund_number: candidate.fund_number,
    fund_type: candidate.fund_type || "traditional",
    strategy: candidate.strategy,
    vintage_year: candidate.vintage_year,
    target_size_usd: candidate.target_size_usd,
    final_close_size_usd: candidate.final_close_size_usd,
    size_usd: candidate.size_usd,
    currency: candidate.currency,
    fund_status: candidate.status || "active",
    stage_focus: candidate.stage_focus,
    sector_focus: candidate.sector_focus,
    geo_focus: candidate.geo_focus,
    confidence: candidate.source_confidence,
    source_url: candidate.source_url,
    actively_deploying: candidate.status !== "closed" && candidate.status !== "winding_down",
  };

  if (matchedFundId) {
    if (candidate.source_confidence >= matchedConfidence) {
      const updateData = Object.fromEntries(
        Object.entries(fundData).filter(([_, v]) => v != null)
      );
      delete updateData.firm_id;
      const { error } = await sb.from("fund_records").update(updateData).eq("id", matchedFundId);
      if (error) throw error;
      audit.funds_updated++;
      audit.details.push(`  UPDATED: "${candidate.fund_name}" (conf=${candidate.source_confidence})`);
    } else {
      audit.details.push(`  SKIPPED: "${candidate.fund_name}" — existing conf (${matchedConfidence}) > new (${candidate.source_confidence})`);
    }
    await storeEvidence(sb, matchedFundId, candidate);
  } else {
    const { data: inserted, error } = await sb.from("fund_records").insert(fundData).select("id").single();
    if (error) {
      if (error.code === "23505") {
        audit.duplicates_merged++;
        audit.details.push(`  DEDUP: "${candidate.fund_name}" already exists (constraint)`);
        return;
      }
      throw error;
    }
    audit.funds_inserted++;
    audit.details.push(`  INSERTED: "${candidate.fund_name}" (conf=${candidate.source_confidence})`);
    await storeEvidence(sb, inserted.id, candidate);

    const originalNormalized = normalizeFundName(candidate.fund_name);
    if (originalNormalized !== normalizedName) {
      await sb.from("fund_aliases").upsert(
        {
          fund_id: inserted.id,
          alias_value: candidate.fund_name,
          normalized_value: originalNormalized,
          source: "enrichment_pipeline",
          confidence: candidate.source_confidence,
        },
        { onConflict: "fund_id,normalized_value" }
      );
    }
  }
}

async function storeEvidence(
  sb: SupabaseClient,
  fundId: string,
  candidate: CandidateFund
): Promise<void> {
  await sb.from("fund_source_evidence").insert({
    fund_id: fundId,
    field_name: "*",
    source_type: candidate.source_type,
    source_url: candidate.source_url,
    evidence_quote: candidate.evidence_quote,
    source_confidence: candidate.source_confidence,
    raw_payload: candidate.raw_payload,
  });
}

// ---------------------------------------------------------------------------
// Main pipeline — processFirm with robust multi-source discovery
// ---------------------------------------------------------------------------

async function processFirm(
  sb: SupabaseClient,
  firm: FirmRow,
  audit: AuditSummary
): Promise<void> {
  console.log(`\n▸ ${firm.firm_name} (${firm.website_url || "no website"})`);
  console.log("  ── Source Discovery ──");

  // Collect text from multiple sources in priority order
  let websiteText = "";
  let searchText = "";

  // SOURCE 1: Direct website fetch (homepage + subpages) — always tried first
  if (firm.website_url) {
    const { pages, totalLen } = await fetchWebsiteContent(firm.website_url);
    websiteText = pages.map((p) => `\n--- Page: ${p.url} ---\n${p.text}`).join("\n");
    console.log(`    [direct] TOTAL: ${pages.length} page(s), ${totalLen} chars`);
  }

  // SOURCE 2: Exa search — tried after direct fetch
  const exaText = await searchExa(firm.firm_name);
  if (exaText) searchText += exaText;

  // SOURCE 3: Jina reader — last fallback
  if (firm.website_url) {
    const jinaText = await scrapeWithJina(firm.website_url);
    if (jinaText) {
      // Jina content supplements website content if direct fetch was thin
      if (websiteText.length < 2000) {
        websiteText += `\n--- Jina Reader: ${firm.website_url} ---\n${jinaText}`;
      } else {
        searchText += `\n--- Jina Reader: ${firm.website_url} ---\n${jinaText}`;
      }
    }
  }

  const totalTextLen = websiteText.length + searchText.length;
  console.log(`  ── Total text: ${totalTextLen} chars (website=${websiteText.length}, search=${searchText.length})`);

  // Guard: skip only if total text is below minimum threshold
  if (totalTextLen < MIN_TEXT_LENGTH) {
    console.log(`    SKIP: total text (${totalTextLen}) < ${MIN_TEXT_LENGTH} char minimum`);
    audit.firms_processed++;
    return;
  }

  // Stage 2: Extraction
  const raw = await extractFundsWithGemini(firm.firm_name, websiteText, searchText);
  console.log(`    [gemini] ${raw.funds.length} fund candidate(s) extracted`);
  if (!raw.funds.length) {
    audit.firms_processed++;
    return;
  }
  audit.funds_discovered += raw.funds.length;

  // Stage 3: Normalization
  const candidates = normalizeCandidates(raw.funds, firm.firm_name, firm.website_url);

  // Stage 4: Deduplication
  const deduped = deduplicateCandidates(candidates);
  const merged = candidates.length - deduped.length;
  if (merged > 0) {
    audit.duplicates_merged += merged;
    console.log(`    Deduped: ${candidates.length} → ${deduped.length} (merged ${merged})`);
  }

  // Stages 5-7: Link, score, write/queue
  for (const candidate of deduped) {
    await processCandidate(sb, firm.id, firm.firm_name, candidate, audit);
  }

  audit.firms_processed++;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Fund Enrichment Pipeline");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Max firms:     ${MAX_FIRMS}`);
  console.log(`  Conf threshold: ${CONFIDENCE_THRESHOLD}`);
  console.log(`  Gemini model:  ${GEMINI_MODEL}`);
  console.log(`  Exa:           ${DISABLE_EXA ? "DISABLED" : EXA_KEY ? "enabled" : "no key"}`);
  console.log(`  Jina:          ${DISABLE_JINA ? "DISABLED" : "enabled"}`);
  console.log(`  LLM chain:     Gemini → Groq → DeepSeek`);
  if (TARGET_FIRM_SLUG) console.log(`  Target firm:   ${TARGET_FIRM_SLUG}`);
  console.log("");

  let query = supabase
    .from("firm_records")
    .select("id, firm_name, website_url, slug")
    .not("website_url", "is", null)
    .is("deleted_at", null)
    .order("updated_at", { ascending: true })
    .limit(MAX_FIRMS);

  if (TARGET_FIRM_SLUG) {
    query = query.eq("slug", TARGET_FIRM_SLUG);
  }

  const { data: firms, error: loadErr } = await query;
  if (loadErr) throw new Error(`Failed to load firms: ${loadErr.message}`);
  if (!firms?.length) {
    console.log("No firms to process.");
    return;
  }
  console.log(`Loaded ${firms.length} firm(s) to process.\n`);

  const audit: AuditSummary = {
    firms_processed: 0,
    funds_discovered: 0,
    funds_inserted: 0,
    funds_updated: 0,
    duplicates_merged: 0,
    review_items_created: 0,
    failures: 0,
    details: [],
  };

  for (let i = 0; i < firms.length; i++) {
    const firm = firms[i];
    console.log(`\n[${i + 1}/${firms.length}]`);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await processFirm(supabase, firm, audit);
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt < MAX_RETRIES) {
          const backoff = DELAY_MS * (attempt + 1) * 2;
          console.warn(`    ⚠ Attempt ${attempt + 1} failed: ${msg} — retrying in ${backoff}ms`);
          await new Promise((r) => setTimeout(r, backoff));
        } else {
          audit.failures++;
          audit.details.push(`  FAILURE (after ${MAX_RETRIES + 1} attempts): ${firm.firm_name} — ${msg}`);
          console.error(`    ✗ All attempts failed for ${firm.firm_name}: ${msg}`);
        }
      }
    }

    if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  // Audit summary
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  AUDIT SUMMARY");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Firms processed:      ${audit.firms_processed}`);
  console.log(`  Funds discovered:     ${audit.funds_discovered}`);
  console.log(`  Funds inserted:       ${audit.funds_inserted}`);
  console.log(`  Funds updated:        ${audit.funds_updated}`);
  console.log(`  Duplicates merged:    ${audit.duplicates_merged}`);
  console.log(`  Review items created: ${audit.review_items_created}`);
  console.log(`  Failures:             ${audit.failures}`);
  console.log("═══════════════════════════════════════════════════════");

  if (audit.details.length) {
    console.log("\nDetails:");
    for (const d of audit.details) console.log(d);
  }

  const logDir = join(process.cwd(), "logs");
  mkdirSync(logDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = join(logDir, `fund-enrichment-${ts}.json`);
  appendFileSync(logPath, JSON.stringify({ ...audit, timestamp: new Date().toISOString() }, null, 2));
  console.log(`\nAudit log written to: ${logPath}`);
}

main().catch((e) => {
  console.error("Pipeline failed:", e);
  process.exit(1);
});
