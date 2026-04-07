/**
 * enrich-funds-edgar.ts
 *
 * Enriches fund_records from SEC EDGAR Form D filings for every VC firm
 * already in the Supabase `firm_records` table.
 *
 * Pipeline per firm:
 *   1. Build search terms — firm_name + legal_name + aliases
 *   2. Query EDGAR EFTS — full-text search across Form D filings
 *   3. Filter hits — entity_name must match the firm (starts-with / token overlap)
 *   4. Fetch Form D XML — parse fund size, vintage year, investment type
 *   5. Normalize — fund name normalizer (roman↔arabic, LP suffix strip, etc.)
 *   6. Deduplicate — exact normalized name → alias match → Jaccard fuzzy
 *   7. Write — high confidence (≥0.75) → fund_records upsert; else → review queue
 *
 * Source type: SEC_FILING (confidence 0.90) — always above auto-write threshold.
 *
 * EDGAR rate limit: 10 req/sec max. Default delay: 150 ms between requests.
 * Requires User-Agent per https://www.sec.gov/os/accessing-edgar-data
 *
 * Usage:
 *   cd ~/VEKTA\ APP
 *   SEC_USER_AGENT="VektaApp (ops@vekta.co)" tsx scripts/enrich-funds-edgar.ts
 *   EDGAR_FIRM_SLUG=sequoia-capital SEC_USER_AGENT="..." tsx scripts/enrich-funds-edgar.ts
 *
 * Env vars (loaded from .env / .env.local):
 *   SUPABASE_URL                  — required
 *   SUPABASE_SERVICE_ROLE_KEY     — required
 *   SEC_USER_AGENT                — required ("AppName (email@domain.com)")
 *   EDGAR_MAX_FIRMS               — default 200
 *   EDGAR_MAX_FILINGS_PER_FIRM    — default 50
 *   EDGAR_FIRM_SLUG               — process only this one firm slug
 *   EDGAR_DELAY_MS                — default 150 (ms between EDGAR requests)
 *   EDGAR_DRY_RUN                 — "1" = parse only, no DB writes
 *   EDGAR_CONFIDENCE_THRESHOLD    — default 0.75
 *   EDGAR_START_DATE              — default "2000-01-01"
 *   EDGAR_ONLY_VC                 — "1" (default) = only "Venture Capital Fund" type;
 *                                   "0" = also include PE / Other Investment Fund
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SEC_USER_AGENT = process.env.SEC_USER_AGENT || "";

const MAX_FIRMS = parseInt(process.env.EDGAR_MAX_FIRMS || "200", 10);
const MAX_FILINGS_PER_FIRM = parseInt(process.env.EDGAR_MAX_FILINGS_PER_FIRM || "50", 10);
const TARGET_FIRM_SLUG = process.env.EDGAR_FIRM_SLUG || "";
const DELAY_MS = Math.max(50, parseInt(process.env.EDGAR_DELAY_MS || "150", 10));
const DRY_RUN = process.env.EDGAR_DRY_RUN === "1";
const CONFIDENCE_THRESHOLD = parseFloat(process.env.EDGAR_CONFIDENCE_THRESHOLD || "0.75");
const START_DATE = process.env.EDGAR_START_DATE || "2000-01-01";
const ONLY_VC = process.env.EDGAR_ONLY_VC !== "0"; // default true

// SEC source confidence is always 0.90
const SEC_SOURCE_CONFIDENCE = 0.90;

// EDGAR endpoints
const ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data";

// Investment fund types we accept
const ACCEPTED_FUND_TYPES = new Set([
  "venture capital fund",
  "other investment fund",
  ...(ONLY_VC ? [] : ["private equity fund", "real estate fund", "hedge fund"]),
]);

// Industry group we require (empty string = accept all, "Pooled Investment Fund" = strict)
const REQUIRED_INDUSTRY_GROUP = "pooled investment fund";

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!SEC_USER_AGENT) {
  console.error(
    '\nERROR: Set SEC_USER_AGENT per SEC requirements, e.g.:\n' +
    '  SEC_USER_AGENT="VektaApp (ops@vekta.co)" tsx scripts/enrich-funds-edgar.ts\n'
  );
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FirmRow {
  id: string;
  firm_name: string;
  legal_name: string | null;
  slug: string | null;
  website_url: string | null;
}

interface EdgarHit {
  entity_name: string;
  accession_no: string;   // e.g. "0001234567-16-000001"
  file_date: string;      // e.g. "2016-03-18"
  form_type: string;
}

interface FormDData {
  /** Fund name as filed with the SEC */
  entity_name: string;
  /** Total offering amount in USD (null = indefinite / undisclosed) */
  size_usd: number | null;
  /** Raw offering amount string */
  size_raw: string | null;
  /** "Venture Capital Fund", "Hedge Fund", etc. */
  investment_fund_type: string | null;
  /** "Pooled Investment Fund", etc. */
  industry_group_type: string | null;
  /** Date of first sale → vintage year */
  date_of_first_sale: string | null;
  /** Filing date from EFTS */
  file_date: string;
  /** Jurisdiction of incorporation */
  state_of_inc: string | null;
  /** primary_doc.xml URL (our dedup key) */
  source_url: string;
  /** CIK (no leading zeros) */
  cik: string;
  /** Accession number with dashes */
  accession_dashed: string;
}

interface AuditSummary {
  firms_processed: number;
  filings_fetched: number;
  funds_discovered: number;
  funds_inserted: number;
  funds_updated: number;
  review_items: number;
  skipped_type_mismatch: number;
  skipped_name_mismatch: number;
  failures: number;
  details: string[];
}

// ---------------------------------------------------------------------------
// Utility: sleep
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// EDGAR HTTP helper
// ---------------------------------------------------------------------------

const EDGAR_HEADERS = {
  "User-Agent": SEC_USER_AGENT,
  "Accept": "application/json, application/xml, text/xml, */*",
  "Accept-Encoding": "gzip, deflate, br",
};

let lastEdgarRequest = 0;

async function edgarFetch(url: string, retries = 3): Promise<Response | null> {
  // Throttle: ensure at least DELAY_MS between requests
  const now = Date.now();
  const wait = DELAY_MS - (now - lastEdgarRequest);
  if (wait > 0) await sleep(wait);
  lastEdgarRequest = Date.now();

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: EDGAR_HEADERS,
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 429) {
        const backoff = (attempt + 1) * 5_000;
        console.log(`    [edgar] 429 rate limit — waiting ${backoff / 1000}s…`);
        await sleep(backoff);
        continue;
      }

      if (res.status === 403) {
        console.log(`    [edgar] 403 Forbidden — check SEC_USER_AGENT`);
        return null;
      }

      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < retries - 1) {
        console.log(`    [edgar] fetch error (attempt ${attempt + 1}): ${msg.slice(0, 80)} — retrying`);
        await sleep(2_000 * (attempt + 1));
      } else {
        console.log(`    [edgar] fetch failed: ${msg.slice(0, 80)}`);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stage 1: Load firms from Supabase
// ---------------------------------------------------------------------------

async function loadFirms(): Promise<FirmRow[]> {
  let query = supabase
    .from("firm_records")
    .select("id, firm_name, legal_name, slug, website_url")
    .is("deleted_at", null)
    .order("firm_name");

  if (TARGET_FIRM_SLUG) {
    query = query.eq("slug", TARGET_FIRM_SLUG);
  } else {
    query = query.limit(MAX_FIRMS);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load firms: ${error.message}`);
  return (data ?? []) as FirmRow[];
}

// ---------------------------------------------------------------------------
// Stage 2: Build search terms for a firm
// ---------------------------------------------------------------------------

function buildSearchTerms(firm: FirmRow): string[] {
  const terms = new Set<string>();

  const addTerm = (s: string | null | undefined) => {
    if (!s?.trim()) return;
    const clean = s.trim().replace(/\s+/g, " ");
    // Only add terms with ≥ 2 words or ≥ 10 chars (avoid too-broad single-word searches)
    if (clean.split(" ").length >= 2 || clean.length >= 10) {
      terms.add(clean);
    }
  };

  addTerm(firm.firm_name);
  addTerm(firm.legal_name);

  return Array.from(terms);
}

// ---------------------------------------------------------------------------
// Stage 3a: EDGAR company-name search → list of matching fund entities (CIKs)
//
// Uses the EDGAR company search endpoint, which searches ISSUER NAMES —
// so results are the fund LPs themselves (e.g. "SEQUOIA CAPITAL FUND XV LP"),
// not unrelated companies that mention the firm in their filing text.
//
// Endpoint:
//   https://www.sec.gov/cgi-bin/browse-edgar
//     ?company=sequoia+capital&CIK=&type=D&owner=include&count=100&action=getcompany
// Returns HTML; we regex-parse the results table for (CIK, company_name) pairs.
// ---------------------------------------------------------------------------

interface CompanyHit {
  cik: string;          // zero-padded 10-digit
  entity_name: string;  // as filed with the SEC (uppercase)
}

async function searchByCompanyName(term: string): Promise<CompanyHit[]> {
  const encoded = encodeURIComponent(term);
  const url =
    `https://www.sec.gov/cgi-bin/browse-edgar` +
    `?company=${encoded}&CIK=&type=D&dateb=&owner=include&count=100` +
    `&search_text=&action=getcompany`;

  console.log(`    [edgar/company] searching "${term}"`);
  const res = await edgarFetch(url);
  if (!res || !res.ok) {
    console.log(`    [edgar/company] HTTP ${res?.status ?? "ERR"} — skip`);
    return [];
  }

  const html = await res.text();

  // EDGAR company-search HTML: each result row has TWO anchors with the same href
  // (CIK page URL). The first shows the numeric CIK, the second shows the company name.
  //
  //   <td scope="row"><a href="...action=getcompany&CIK=0001368155&...">0001368155</a></td>
  //   <td nowrap><a href="...action=getcompany&CIK=0001368155&...">SEQUOIA CAPITAL FUND XI LP</a></td>
  //
  // Strategy: collect ALL anchor texts grouped by CIK. The non-numeric text is the name.
  // Handles both &CIK= (plain) and &amp;CIK= (HTML-encoded) in hrefs.

  const results: CompanyHit[] = [];
  const cikToTexts = new Map<string, string[]>();

  // Match every anchor whose href contains "action=getcompany" and "CIK=<digits>"
  const anchorRe = /<a\s[^>]*href="([^"]*action=getcompany[^"]*)"[^>]*>([^<]+)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const text = m[2].trim();
    if (!text) continue;

    // Extract CIK: handles ?CIK=, &CIK=, &amp;CIK=
    const cikM = href.match(/[?&](?:amp;)?CIK=(\d+)/i);
    if (!cikM) continue;

    const cik = cikM[1].padStart(10, "0");
    if (!cikToTexts.has(cik)) cikToTexts.set(cik, []);
    cikToTexts.get(cik)!.push(text);
  }

  // For each CIK, pick the first non-numeric / non-type-code text as the company name
  for (const [cik, texts] of cikToTexts) {
    // Skip pure digit strings (the CIK display) and single-letter type codes like "D"
    const name = texts.find((t) => !/^\d+$/.test(t) && t.length > 2);
    if (name) {
      results.push({ cik, entity_name: name });
    }
  }

  console.log(`    [edgar/company] ${results.length} issuer(s) found`);
  if (results.length > 0) {
    // Show first few so we can verify the names look right
    const preview = results.slice(0, 5).map((r) => `"${r.entity_name}"`).join(", ");
    console.log(`    [edgar/company] sample: ${preview}`);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Stage 3b: Filter company hits by firm name
// ---------------------------------------------------------------------------

function nameMatchesFirm(entityName: string, firm: FirmRow): boolean {
  const entity = entityName.toLowerCase().trim();

  const candidateNames = [
    firm.firm_name,
    firm.legal_name,
  ].filter(Boolean) as string[];

  for (const name of candidateNames) {
    const lower = name.toLowerCase().trim();

    // 1. Entity name STARTS WITH the firm name (most reliable)
    //    "sequoia capital fund xv lp".startsWith("sequoia capital") → true
    if (entity.startsWith(lower)) return true;

    // 2. All tokens of the firm name appear as whole words in the entity name
    //    Protects against "Oak" matching "Oakland Ventures"
    const tokens = lower.split(/\s+/).filter((t) => t.length > 2);
    if (tokens.length >= 2) {
      const allPresent = tokens.every((t) => {
        const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`).test(entity);
      });
      if (allPresent) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Stage 3c: Fetch all Form D filings for a known CIK via submissions API
//
// https://data.sec.gov/submissions/CIK0001234567.json
// Returns recent filings array; we filter for form type "D" or "D/A".
// ---------------------------------------------------------------------------

async function getFormDFilingsForCik(
  cik: string,
  entityName: string
): Promise<EdgarHit[]> {
  const padded = cik.padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;

  const res = await edgarFetch(url);
  if (!res || !res.ok) {
    console.log(`    [edgar/submissions] HTTP ${res?.status ?? "ERR"} for CIK ${cik}`);
    return [];
  }

  let json: unknown;
  try { json = await res.json(); } catch {
    console.log(`    [edgar/submissions] JSON parse failed for CIK ${cik}`);
    return [];
  }

  const data = json as Record<string, unknown>;
  const name = ((data.name as string) || entityName).trim();

  const recent = (data.filings as Record<string, unknown>)?.recent as Record<string, unknown[]> | undefined;
  if (!recent) return [];

  const accessions = (recent.accessionNumber as string[]) ?? [];
  const forms = (recent.form as string[]) ?? [];
  const dates = (recent.filingDate as string[]) ?? [];

  const hits: EdgarHit[] = [];
  for (let i = 0; i < accessions.length; i++) {
    const form = (forms[i] || "").toUpperCase();
    if (form !== "D" && form !== "D/A") continue;

    const filing_date = dates[i] || "";
    // Respect start date filter
    if (START_DATE && filing_date && filing_date < START_DATE) continue;

    // Accession from submissions API comes without dashes: "0001234567-22-000001"
    // Sometimes it IS already dashed; normalise to dashed form
    const raw = accessions[i] || "";
    const dashed = raw.includes("-") ? raw : `${raw.slice(0, 10)}-${raw.slice(10, 12)}-${raw.slice(12)}`;

    hits.push({
      entity_name: name,
      accession_no: dashed,
      file_date: filing_date,
      form_type: form,
    });
  }

  return hits;
}

// ---------------------------------------------------------------------------
// Stage 5: Fetch + parse Form D XML
// ---------------------------------------------------------------------------

/** Extract first matching tag text from XML string */
function xmlText(xml: string, ...tags: string[]): string | null {
  for (const tag of tags) {
    // Match both <tag>value</tag> and <tag attr="...">value</tag>
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]+)</${tag}>`, "i");
    const m = xml.match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

/** Parse the raw offering amount into a float (null if indefinite/undisclosed) */
function parseOfferingAmount(raw: string | null): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "0" || s === "0.0") return null; // 0 usually means "indefinite" in Form D
  if (/indefinite|undisclosed|n\/a|none/.test(s)) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return n > 0 ? n : null;
}

/** Extract CIK (without leading zeros) from accession number */
function cikFromAccession(accession: string): string {
  // Format: XXXXXXXXXX-YY-NNNNNN  (10-digit CIK, 2-digit year, 6-digit seq)
  const parts = accession.split("-");
  if (parts.length < 1) return "";
  // Remove leading zeros from the CIK part
  return String(parseInt(parts[0], 10));
}

/** Convert dashed accession to no-dash form for URL construction */
function accessionNoDashes(accession: string): string {
  return accession.replace(/-/g, "");
}

async function fetchFormD(hit: EdgarHit): Promise<FormDData | null> {
  const cik = cikFromAccession(hit.accession_no);
  if (!cik || cik === "0") {
    console.log(`    [edgar/xml] Cannot parse CIK from: ${hit.accession_no}`);
    return null;
  }

  const nodash = accessionNoDashes(hit.accession_no);
  const xmlUrl = `${ARCHIVES_BASE}/${cik}/${nodash}/primary_doc.xml`;

  const res = await edgarFetch(xmlUrl);
  if (!res) return null;

  if (!res.ok) {
    // Some older filings don't have primary_doc.xml — try alternate names
    if (res.status === 404) {
      console.log(`    [edgar/xml] 404 ${xmlUrl.split("/").slice(-1)[0]} — skip`);
    } else {
      console.log(`    [edgar/xml] HTTP ${res.status} for ${hit.accession_no}`);
    }
    return null;
  }

  const xml = await res.text();

  // Fund / entity name
  const entity_name =
    xmlText(xml, "issuerName", "entityName", "nameOfIssuer") || hit.entity_name;

  // Industry group (must be "Pooled Investment Fund" for VC funds)
  const industry_group_type = xmlText(xml, "industryGroupType");

  // Investment fund type ("Venture Capital Fund", etc.)
  const investment_fund_type = xmlText(xml, "investmentFundType");

  // Total offering amount
  const size_raw = xmlText(xml, "totalOfferingAmount");
  const size_usd = parseOfferingAmount(size_raw);

  // Date of first sale (best proxy for vintage year)
  const date_of_first_sale =
    xmlText(xml, "dateOfFirstSale") ||
    xmlText(xml, "value"); // older format wraps date in <value>

  // State / jurisdiction of incorporation
  const state_of_inc = xmlText(xml, "stateOfInc", "jurisdictionOfInc");

  return {
    entity_name: entity_name.trim(),
    size_usd,
    size_raw,
    investment_fund_type,
    industry_group_type,
    date_of_first_sale,
    file_date: hit.file_date,
    state_of_inc,
    source_url: xmlUrl,
    cik,
    accession_dashed: hit.accession_no,
  };
}

// ---------------------------------------------------------------------------
// Stage 6: Filter by fund type
// ---------------------------------------------------------------------------

function isFundTypeAccepted(data: FormDData): boolean {
  const ig = (data.industry_group_type || "").toLowerCase();
  const ft = (data.investment_fund_type || "").toLowerCase();

  // Require Pooled Investment Fund industry group (strict filter)
  if (ig && ig !== REQUIRED_INDUSTRY_GROUP) {
    return false;
  }

  // If we have an explicit investment fund type, check it
  if (ft && ONLY_VC) {
    return ACCEPTED_FUND_TYPES.has(ft) || ft === "";
  }

  return true;
}

// ---------------------------------------------------------------------------
// Stage 7: Normalize + extract fund metadata
// ---------------------------------------------------------------------------

function vintageYearFromData(data: FormDData): number | null {
  // Try dateOfFirstSale first
  if (data.date_of_first_sale) {
    const m = data.date_of_first_sale.match(/(\d{4})/);
    if (m) {
      const y = parseInt(m[1], 10);
      if (y >= 1980 && y <= 2030) return y;
    }
  }
  // Fall back to filing date
  if (data.file_date) {
    const m = data.file_date.match(/^(\d{4})/);
    if (m) {
      const y = parseInt(m[1], 10);
      if (y >= 1980 && y <= 2030) return y;
    }
  }
  return null;
}

function mapFundStatus(data: FormDData): string {
  const vintage = vintageYearFromData(data);
  if (!vintage) return "active";
  const age = new Date().getFullYear() - vintage;
  if (age > 12) return "closed";
  if (age > 7) return "winding_down";
  return "active";
}

// ---------------------------------------------------------------------------
// Stage 8: Dedup against existing fund_records
// ---------------------------------------------------------------------------

async function findExistingFund(
  firmId: string,
  normalizedName: string,
  variants: string[]
): Promise<{ id: string; confidence: number } | null> {
  // 1. Exact normalized name match
  const { data: exact } = await supabase
    .from("fund_records")
    .select("id, confidence")
    .eq("firm_id", firmId)
    .eq("normalized_fund_name", normalizedName)
    .is("deleted_at", null)
    .limit(1);

  if (exact?.length) {
    return { id: exact[0].id, confidence: parseFloat(exact[0].confidence ?? "0") };
  }

  // 2. Alias match
  for (const variant of variants) {
    const { data: aliasMatch } = await supabase
      .from("fund_aliases")
      .select("fund_id")
      .eq("normalized_value", variant)
      .limit(1);

    if (aliasMatch?.length) {
      const { data: fund } = await supabase
        .from("fund_records")
        .select("id, confidence")
        .eq("id", aliasMatch[0].fund_id)
        .eq("firm_id", firmId)
        .is("deleted_at", null)
        .limit(1);

      if (fund?.length) {
        return { id: fund[0].id, confidence: parseFloat(fund[0].confidence ?? "0") };
      }
    }
  }

  // 3. Fuzzy Jaccard on all existing funds for this firm (≥ 0.90 threshold)
  const { data: allFunds } = await supabase
    .from("fund_records")
    .select("id, fund_name, confidence")
    .eq("firm_id", firmId)
    .is("deleted_at", null);

  for (const ef of allFunds ?? []) {
    const sim = fundNameSimilarity(ef.fund_name, normalizedName);
    if (sim >= 0.90) {
      return { id: ef.id, confidence: parseFloat(ef.confidence ?? "0") };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Stage 9: Write to Supabase (fund_records + fund_source_evidence)
// ---------------------------------------------------------------------------

async function insertSourceEvidence(
  fundId: string,
  data: FormDData,
  fieldName: string = "*"
): Promise<void> {
  if (DRY_RUN) return;

  const { error } = await supabase.from("fund_source_evidence").insert({
    fund_id: fundId,
    field_name: fieldName,
    source_type: "sec_filing",
    source_url: data.source_url,
    evidence_quote: [
      data.investment_fund_type ? `Type: ${data.investment_fund_type}` : null,
      data.size_raw ? `Offering: ${data.size_raw}` : null,
      data.date_of_first_sale ? `First sale: ${data.date_of_first_sale}` : null,
    ]
      .filter(Boolean)
      .join(" | ") || null,
    source_confidence: SEC_SOURCE_CONFIDENCE,
    raw_payload: {
      entity_name: data.entity_name,
      cik: data.cik,
      accession: data.accession_dashed,
      file_date: data.file_date,
      investment_fund_type: data.investment_fund_type,
      industry_group_type: data.industry_group_type,
      size_raw: data.size_raw,
      date_of_first_sale: data.date_of_first_sale,
      state_of_inc: data.state_of_inc,
    },
    discovered_at: data.file_date
      ? new Date(data.file_date).toISOString()
      : new Date().toISOString(),
  });

  if (error) {
    // Duplicate evidence is fine — the unique constraint on (fund_id, field_name, source_url)
    // doesn't exist, so just log non-critical errors
    if (!error.message.includes("duplicate") && !error.message.includes("unique")) {
      console.log(`    [evidence] Insert warning: ${error.message.slice(0, 120)}`);
    }
  }
}

async function upsertFund(
  firmId: string,
  data: FormDData,
  existingId: string | null,
  existingConfidence: number,
  audit: AuditSummary
): Promise<void> {
  const rawName = data.entity_name;
  const normalizedName = normalizeFundName(rawName);
  if (!normalizedName) {
    console.log(`    [write] Empty normalized name for "${rawName}" — skip`);
    return;
  }

  const fundNumber = extractFundNumber(rawName);
  const vintageYear = vintageYearFromData(data);
  const status = mapFundStatus(data);
  const confidence = SEC_SOURCE_CONFIDENCE;

  // Confidence is always 0.90 for SEC filings, above 0.75 threshold.
  // But if we already have a HIGHER confidence record, skip the update
  // (e.g., 0.95 from official_website beats 0.90 from SEC filing for existing records).
  if (existingId && existingConfidence >= confidence) {
    // Still want to record source evidence even if not updating the main record
    if (!DRY_RUN) {
      await insertSourceEvidence(existingId, data);
    }
    audit.skipped_type_mismatch++; // reuse counter for "already at higher confidence"
    return;
  }

  const payload = {
    firm_id: firmId,
    fund_name: rawName,
    normalized_fund_name: normalizedName,
    fund_number: fundNumber,
    vintage_year: vintageYear,
    size_usd: data.size_usd,
    fund_status: status,
    fund_type: "traditional",
    source_url: data.source_url,
    confidence,
    actively_deploying: status === "active",
    updated_at: new Date().toISOString(),
  };

  if (DRY_RUN) {
    const action = existingId ? "UPDATE" : "INSERT";
    console.log(
      `    [dry-run] ${action} fund: "${rawName}" ` +
      `(${normalizedName}) vintage=${vintageYear ?? "?"} ` +
      `size=${data.size_usd ? `$${(data.size_usd / 1e6).toFixed(0)}M` : "?"}`
    );
    if (existingId) {
      audit.funds_updated++;
    } else {
      audit.funds_inserted++;
    }
    audit.funds_discovered++;
    return;
  }

  if (existingId) {
    // Update existing fund
    const { error } = await supabase
      .from("fund_records")
      .update(payload)
      .eq("id", existingId);

    if (error) {
      console.log(`    [write] Update error: ${error.message.slice(0, 120)}`);
      audit.failures++;
      return;
    }
    console.log(`    [write] Updated: "${rawName}"`);
    audit.funds_updated++;
    await insertSourceEvidence(existingId, data);
  } else {
    // Insert new fund — use upsert on (firm_id, normalized_fund_name)
    const { data: inserted, error } = await supabase
      .from("fund_records")
      .upsert(
        { ...payload, created_at: new Date().toISOString() },
        {
          onConflict: "firm_id,normalized_fund_name",
          ignoreDuplicates: false,
        }
      )
      .select("id")
      .single();

    if (error) {
      // Conflict on (firm_id, normalized_fund_name) = already exists with this exact name
      if (error.code === "23505" || error.message.includes("unique")) {
        console.log(`    [write] Conflict on "${normalizedName}" — treating as merge`);
        audit.funds_discovered++;
        return;
      }
      console.log(`    [write] Insert error: ${error.message.slice(0, 120)}`);
      audit.failures++;
      return;
    }

    const newId = inserted?.id;
    console.log(`    [write] Inserted: "${rawName}" (id=${newId})`);
    audit.funds_inserted++;
    audit.funds_discovered++;

    if (newId) {
      await insertSourceEvidence(newId, data);

      // Store aliases: normalized variant + raw entity name (if different)
      const variants = fundNameVariants(rawName);
      for (const v of variants) {
        if (v !== normalizedName) {
          await supabase.from("fund_aliases").upsert(
            {
              fund_id: newId,
              alias_value: rawName,
              normalized_value: v,
              source: "edgar_form_d",
              confidence: SEC_SOURCE_CONFIDENCE,
            },
            { onConflict: "fund_id,normalized_value", ignoreDuplicates: true }
          );
        }
      }
    }
  }
}

async function sendToReviewQueue(
  firmId: string,
  data: FormDData,
  reason: string
): Promise<void> {
  if (DRY_RUN) {
    console.log(`    [review-queue] ${reason} — "${data.entity_name}"`);
    return;
  }

  const { error } = await supabase.from("enrichment_review_queue").insert({
    entity_type: "fund",
    entity_id: data.accession_dashed,
    firm_id: firmId,
    reason,
    review_data: {
      entity_name: data.entity_name,
      normalized_fund_name: normalizeFundName(data.entity_name),
      source_url: data.source_url,
      size_usd: data.size_usd,
      vintage_year: vintageYearFromData(data),
      investment_fund_type: data.investment_fund_type,
      industry_group_type: data.industry_group_type,
      cik: data.cik,
      accession: data.accession_dashed,
      file_date: data.file_date,
    },
    status: "pending",
  });

  if (error && !error.message.includes("duplicate")) {
    console.log(`    [review-queue] Insert warning: ${error.message.slice(0, 80)}`);
  }
}

// ---------------------------------------------------------------------------
// Stage 10: Process one firm end-to-end
// ---------------------------------------------------------------------------

async function processFirm(firm: FirmRow, audit: AuditSummary): Promise<void> {
  const label = firm.slug || firm.firm_name;
  console.log(`\n→ Firm: "${firm.firm_name}" [${label}]`);

  const searchTerms = buildSearchTerms(firm);
  if (!searchTerms.length) {
    console.log(`  No search terms — skip`);
    return;
  }

  // Step 1: Company-name search → list of fund entity CIKs whose ISSUER NAME
  //         matches the firm (e.g. "SEQUOIA CAPITAL FUND XV LP").
  //         This is completely different from EFTS full-text search, which returns
  //         startups that *mention* the firm name in their documents.
  const seenCiks = new Map<string, CompanyHit>();

  for (const term of searchTerms) {
    const companyHits = await searchByCompanyName(term);
    for (const ch of companyHits) {
      if (!seenCiks.has(ch.cik)) {
        if (nameMatchesFirm(ch.entity_name, firm)) {
          seenCiks.set(ch.cik, ch);
        } else {
          audit.skipped_name_mismatch++;
        }
      }
    }
  }

  if (!seenCiks.size) {
    console.log(`  No matching fund entities found in EDGAR`);
    return;
  }

  console.log(`  ${seenCiks.size} matching fund entity/entities — fetching submission history…`);

  // Step 2: For each matched CIK, retrieve their Form D filing history via
  //         data.sec.gov/submissions/CIK{padded}.json — one API call per fund entity.
  const seenAccessions = new Map<string, EdgarHit>();
  for (const ch of Array.from(seenCiks.values())) {
    const filings = await getFormDFilingsForCik(ch.cik, ch.entity_name);
    // Keep only the most recent D (and most recent D/A if it's newer than D)
    // to avoid re-processing dozens of amendments for the same fund.
    let latestD: EdgarHit | null = null;
    for (const f of filings) {
      if (!seenAccessions.has(f.accession_no)) {
        // Use the most recent D (not D/A) as the canonical filing
        if (f.form_type === "D" || !latestD) {
          latestD = f;
        }
        seenAccessions.set(f.accession_no, f);
      }
    }
    // If there are many amendments, only process the latest one to save API calls
    if (latestD && filings.length > 3) {
      // Prune to just the latest D + latest D/A (the two most recent)
      const keep = filings
        .slice()
        .sort((a, b) => b.file_date.localeCompare(a.file_date))
        .slice(0, 2);
      for (const acc of Array.from(seenAccessions.keys())) {
        if (!keep.find((k) => k.accession_no === acc)) {
          seenAccessions.delete(acc);
        }
      }
    }
  }

  if (!seenAccessions.size) {
    console.log(`  No Form D filings found for matched entities`);
    return;
  }

  console.log(`  ${seenAccessions.size} filing(s) to process — fetching XML…`);

  for (const hit of Array.from(seenAccessions.values())) {
    audit.filings_fetched++;

    const data = await fetchFormD(hit);
    if (!data) {
      audit.failures++;
      continue;
    }

    // Filter by fund type / industry group
    if (!isFundTypeAccepted(data)) {
      const ig = data.industry_group_type || "unknown";
      const ft = data.investment_fund_type || "unknown";
      console.log(`    [filter] Excluded: industryGroup="${ig}" fundType="${ft}" — "${data.entity_name}"`);
      audit.skipped_type_mismatch++;
      continue;
    }

    const normalizedName = normalizeFundName(data.entity_name);
    if (!normalizedName) {
      console.log(`    [filter] Empty normalized name — "${data.entity_name}" skip`);
      continue;
    }

    // Token count guard: avoid single-token names (too ambiguous)
    const tokens = normalizedName.split(" ").filter(Boolean);
    if (tokens.length < 2) {
      await sendToReviewQueue(firm.id, data, "Fund name too short after normalization (single token)");
      audit.review_items++;
      continue;
    }

    const variants = fundNameVariants(data.entity_name);
    const existing = await findExistingFund(firm.id, normalizedName, variants);

    const confidence = SEC_SOURCE_CONFIDENCE;

    if (confidence < CONFIDENCE_THRESHOLD) {
      // This shouldn't happen for SEC filings, but guard anyway
      await sendToReviewQueue(firm.id, data, `Confidence ${confidence} below threshold ${CONFIDENCE_THRESHOLD}`);
      audit.review_items++;
      continue;
    }

    await upsertFund(
      firm.id,
      data,
      existing?.id ?? null,
      existing?.confidence ?? 0,
      audit
    );
  }

  audit.firms_processed++;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

function printAudit(audit: AuditSummary): void {
  console.log("\n" + "═".repeat(60));
  console.log("EDGAR Fund Enrichment — Audit Summary");
  console.log("═".repeat(60));
  console.log(`  Firms processed:         ${audit.firms_processed}`);
  console.log(`  Filings fetched:         ${audit.filings_fetched}`);
  console.log(`  Funds discovered:        ${audit.funds_discovered}`);
  console.log(`  Funds inserted:          ${audit.funds_inserted}`);
  console.log(`  Funds updated:           ${audit.funds_updated}`);
  console.log(`  Review queue items:      ${audit.review_items}`);
  console.log(`  Skipped (type/name):     ${audit.skipped_type_mismatch + audit.skipped_name_mismatch}`);
  console.log(`  Failures:                ${audit.failures}`);
  if (DRY_RUN) console.log("\n  ⚠  DRY RUN — no writes were made");
  console.log("═".repeat(60));

  // Append to logs/edgar-enrichment.log
  try {
    const logDir = join(process.cwd(), "logs");
    mkdirSync(logDir, { recursive: true });
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        dry_run: DRY_RUN,
        ...audit,
        details: undefined, // skip verbose details from log
      }) + "\n";
    appendFileSync(join(logDir, "edgar-enrichment.log"), line, "utf8");
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("EDGAR Fund Enrichment Pipeline");
  console.log("═".repeat(60));
  console.log(`  SEC_USER_AGENT:    ${SEC_USER_AGENT}`);
  console.log(`  Start date:        ${START_DATE}`);
  console.log(`  Max firms:         ${TARGET_FIRM_SLUG ? `1 (${TARGET_FIRM_SLUG})` : MAX_FIRMS}`);
  console.log(`  Max filings/firm:  ${MAX_FILINGS_PER_FIRM}`);
  console.log(`  Request delay:     ${DELAY_MS}ms`);
  console.log(`  Only VC types:     ${ONLY_VC}`);
  console.log(`  Dry run:           ${DRY_RUN}`);
  console.log(`  Confidence threshold: ${CONFIDENCE_THRESHOLD}`);
  console.log("═".repeat(60));

  const audit: AuditSummary = {
    firms_processed: 0,
    filings_fetched: 0,
    funds_discovered: 0,
    funds_inserted: 0,
    funds_updated: 0,
    review_items: 0,
    skipped_type_mismatch: 0,
    skipped_name_mismatch: 0,
    failures: 0,
    details: [],
  };

  const firms = await loadFirms();
  console.log(`\nLoaded ${firms.length} firm(s) from Supabase`);

  for (const firm of firms) {
    try {
      await processFirm(firm, audit);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  [error] Firm "${firm.firm_name}": ${msg}`);
      audit.failures++;
    }
  }

  printAudit(audit);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
