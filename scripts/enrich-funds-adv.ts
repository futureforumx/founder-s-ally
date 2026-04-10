/**
 * enrich-funds-adv.ts
 *
 * Form ADV Schedule D ingestion pipeline.
 *
 * Data source: SEC bulk ADV download
 *   Part 1: https://www.sec.gov/files/adv-filing-data-20111105-20241231-part1.zip
 *     └─ IA_ADV_Base.csv — adviser legal name + CRD/SEC# for every registered adviser
 *   Part 2: https://www.sec.gov/files/adv-filing-data-20111105-20241231-part2.zip
 *     └─ IA_Schedule_D_7B1.csv    — private fund details (one row per fund)
 *     └─ IA_Schedule_D_7B1A22.csv — auditors
 *     └─ IA_Schedule_D_7B1A24.csv — prime brokers
 *     └─ IA_Schedule_D_7B1A28.csv — marketing agents
 *
 * Firm-linking strategy (highest priority first):
 *   1. Exact SEC file number match on firm_records.sec_file_number
 *   2. Normalized legal name match on firm_records.legal_name
 *   3. Ambiguous (multiple matches, or normalized name is generic) → review queue
 *
 * Never populates deployment/activity fields from ADV data.
 *
 * Usage:
 *   cd ~/VEKTA\ APP
 *   tsx scripts/enrich-funds-adv.ts
 *   ADV_DRY_RUN=1 tsx scripts/enrich-funds-adv.ts
 *   ADV_ADVISER_CRD=157373 tsx scripts/enrich-funds-adv.ts   # single adviser (Sequoia)
 *   ADV_MAX_ADVISERS=50 tsx scripts/enrich-funds-adv.ts
 *
 * Env vars (loaded from .env / .env.local):
 *   SUPABASE_URL                  — required
 *   SUPABASE_SERVICE_ROLE_KEY     — required
 *   ADV_DRY_RUN                   — "1" = parse only, no DB writes
 *   ADV_MAX_ADVISERS              — max advisers to process (default: all matched)
 *   ADV_ADVISER_CRD               — process only this CRD number
 *   ADV_CONFIDENCE_THRESHOLD      — default 0.75
 *   ADV_CACHE_DIR                 — local cache directory (default: .adv-cache)
 *   ADV_FORCE_DOWNLOAD            — "1" = re-download even if cached
 *   ADV_FUND_TYPES                — comma-sep fund types to include
 *                                   default: "Venture Capital Fund,Other Investment Fund"
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeFundName,
  fundNameVariants,
  fundNameSimilarity,
} from "../src/lib/fundNameNormalizer";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import * as zlib from "node:zlib";

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
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

loadEnv();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const DRY_RUN = process.env.ADV_DRY_RUN === "1";
const MAX_ADVISERS = process.env.ADV_MAX_ADVISERS
  ? parseInt(process.env.ADV_MAX_ADVISERS, 10)
  : Infinity;
const TARGET_CRD = process.env.ADV_ADVISER_CRD || "";
const CONFIDENCE_THRESHOLD = parseFloat(
  process.env.ADV_CONFIDENCE_THRESHOLD || "0.75"
);
const CACHE_DIR = process.env.ADV_CACHE_DIR || join(process.cwd(), ".adv-cache");
const FORCE_DOWNLOAD = process.env.ADV_FORCE_DOWNLOAD === "1";

const ACCEPTED_FUND_TYPES = new Set(
  (
    process.env.ADV_FUND_TYPES ||
    "Venture Capital Fund,Other Investment Fund,Private Equity Fund"
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
);

const ADV_SOURCE_CONFIDENCE = 0.9;
const ADV_PART1_ZIP =
  "https://www.sec.gov/files/adv-filing-data-20111105-20241231-part1.zip";
const ADV_PART2_ZIP =
  "https://www.sec.gov/files/adv-filing-data-20111105-20241231-part2.zip";

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

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
  sec_file_number: string | null;
  adviser_crd_number: string | null;
}

interface AdviserRecord {
  /** IARD/FINRA CRD number (unique primary key) */
  crd_number: string;
  /** SEC file number, e.g. "801-122957" */
  sec_file_number: string;
  /** Legal name as on Form ADV Part 1 */
  legal_name: string;
  /** Normalized legal name for matching */
  normalized_legal_name: string;
  /** Filing ID — links to 7B1 rows */
  filing_id: string;
}

interface ScheduleD7B1Row {
  filing_id: string;
  fund_name: string;
  fund_id: string;        // private_fund_identification_number, e.g. "805-..."
  reference_id: string;
  state: string;
  country: string;
  exclusion_3c1: string;  // "Y" or "N"
  exclusion_3c7: string;
  master_fund: string;
  feeder_fund: string;
  fund_of_funds: string;
  fund_type: string;
  fund_type_other: string;
  gross_asset_value: string;
  minimum_investment: string;
  owners: string;
  pct_owned_related: string;
  pct_owned_funds: string;
  sales_limited: string;
  pct_owned_non_us: string;
  is_subadviser: string;
  other_ias: string;
  clients_solicited: string;
  exempt_from_reg: string;
  annual_audit: string;
  marketing: string;
}

interface AuditRow { filing_id: string; reference_id: string; auditor_name: string; }
interface PrimeBrokerRow { filing_id: string; reference_id: string; firm_name: string; }
interface MarketingRow { filing_id: string; reference_id: string; firm_name: string; }

// ---------------------------------------------------------------------------
// CSV streaming parser (no dependencies)
// ---------------------------------------------------------------------------

function* parseCSVLines(text: string): Generator<string[]> {
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row: string[] = [];
    let field = "";
    let inQuotes = false;

    while (i < len) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < len && text[i + 1] === '"') {
            // escaped quote
            field += '"';
            i += 2;
          } else {
            inQuotes = false;
            i++;
          }
        } else {
          field += ch;
          i++;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
          i++;
        } else if (ch === ",") {
          row.push(field);
          field = "";
          i++;
        } else if (ch === "\r") {
          i++;
        } else if (ch === "\n") {
          i++;
          break;
        } else {
          field += ch;
          i++;
        }
      }
    }

    row.push(field);

    if (row.length > 1 || row[0] !== "") {
      yield row;
    }
  }
}

function mapRow(headers: string[], row: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    out[headers[i]] = row[i] ?? "";
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zip extraction — list entries and extract a named file
// ---------------------------------------------------------------------------

// We use streaming extraction: download the ZIP, decompress entry on-the-fly.
// Since ADV ZIPs use DEFLATE without encryption, we can pipe through zlib.
// But we need the local file approach for two-pass (base + schedule_d).
// Strategy: cache locally as plain CSV per entry name.

async function fetchWithRetry(
  url: string,
  opts: RequestInit = {},
  retries = 3
): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      last = new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    } catch (e) {
      last = e;
    }
    if (i < retries - 1) await sleep(2000 * (i + 1));
  }
  throw last;
}

// Extract a single named file from a local ZIP to a local path.
// Uses unzip system command for simplicity + correctness with large ZIPs.
async function extractFromZip(
  zipPath: string,
  entryName: string,
  outPath: string
): Promise<void> {
  const { execSync } = await import("node:child_process");
  // unzip -p: pipe contents to stdout; redirect to outPath
  console.log(`  Extracting ${entryName} from ${basename(zipPath)}...`);
  execSync(`unzip -p "${zipPath}" "${entryName}" > "${outPath}"`, {
    stdio: ["ignore", "ignore", "pipe"],
    maxBuffer: 2 * 1024 * 1024 * 1024, // 2 GB
  });
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`  Downloading ${basename(destPath)} from ${url} ...`);
  const res = await fetchWithRetry(url);
  if (!res.body) throw new Error("No response body");
  const { Writable } = await import("node:stream");
  const ws = createWriteStream(destPath);
  const reader = res.body.getReader();

  let received = 0;
  const total = parseInt(res.headers.get("content-length") || "0", 10);

  // Stream chunks
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    ws.write(value);
    received += value.length;
    if (total) {
      process.stdout.write(
        `\r  ${((received / total) * 100).toFixed(1)}% — ${(received / 1_000_000).toFixed(1)} MB / ${(total / 1_000_000).toFixed(1)} MB`
      );
    }
  }

  await new Promise<void>((resolve, reject) => {
    ws.end();
    ws.on("finish", resolve);
    ws.on("error", reject);
  });
  console.log();
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function cachePath(filename: string): string {
  return join(CACHE_DIR, filename);
}

function ensureCache(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function cachedOrDownload(
  filename: string,
  url: string
): Promise<string> {
  ensureCache();
  const p = cachePath(filename);
  if (!FORCE_DOWNLOAD && existsSync(p)) {
    const mb = (statSync(p).size / 1_000_000).toFixed(1);
    console.log(`  Using cached ${filename} (${mb} MB)`);
    return Promise.resolve(p);
  }
  return downloadFile(url, p).then(() => p);
}

// ---------------------------------------------------------------------------
// Load IA_ADV_Base.csv — build adviser index
// ---------------------------------------------------------------------------

// Key columns (0-indexed, may vary slightly across releases — use header names):
//   FilingID, CRD#, SECFileNumber, CompanyName, ...
// We care about: FilingID, CRD#, SECFileNumber, CompanyName

async function loadAdviserBase(csvPath: string): Promise<Map<string, AdviserRecord>> {
  console.log("Loading adviser base...");
  const text = readFileSync(csvPath, "utf8");
  const gen = parseCSVLines(text);

  const { value: headerRow } = gen.next();
  if (!headerRow) throw new Error("Empty IA_ADV_Base.csv");
  const headers = headerRow.map((h) => h.trim());

  // Find column indices (headers vary between releases)
  const idx = (name: string): number => {
    const i = headers.indexOf(name);
    if (i < 0) throw new Error(`Column "${name}" not found in IA_ADV_Base. Headers: ${headers.join(", ")}`);
    return i;
  };

  // Try common header name variants
  const filingIdCol = findCol(headers, ["FilingID", "Filing ID", "FILINGID"]);
  const crdCol = findCol(headers, ["CRD#", "CRD Number", "CRD_NUMBER", "CRD"]);
  const secFileCol = findCol(headers, [
    "SECFileNumber",
    "SEC File Number",
    "SEC_FILE_NUMBER",
    "SEC Number",
  ]);
  const nameCol = findCol(headers, [
    "CompanyName",
    "Company Name",
    "COMPANY_NAME",
    "LegalName",
    "Legal Name",
  ]);

  const advisers = new Map<string, AdviserRecord>();
  let count = 0;

  for (const row of Array.from(gen)) {
    if (row.length < 3) continue;
    const rec = mapRow(headers, row);
    const crd = (rec[headers[crdCol]] || "").trim();
    const secNum = (rec[headers[secFileCol]] || "").trim();
    const legalName = (rec[headers[nameCol]] || "").trim();
    const filingId = (rec[headers[filingIdCol]] || "").trim();

    if (!crd || !legalName) continue;

    // If multiple rows per CRD, keep latest (rows are chronological; last wins)
    advisers.set(crd, {
      crd_number: crd,
      sec_file_number: secNum,
      legal_name: legalName,
      normalized_legal_name: normalizeAdviserName(legalName),
      filing_id: filingId,
    });
    count++;
  }

  console.log(`  Loaded ${advisers.size.toLocaleString()} adviser records`);
  return advisers;
}

function findCol(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = headers.indexOf(c);
    if (i >= 0) return i;
  }
  // Try case-insensitive
  const lower = candidates.map((c) => c.toLowerCase());
  for (let i = 0; i < headers.length; i++) {
    if (lower.includes(headers[i].toLowerCase())) return i;
  }
  throw new Error(
    `None of [${candidates.join(", ")}] found in headers: ${headers.join(", ")}`
  );
}

// ---------------------------------------------------------------------------
// Load sub-tables: auditors, prime brokers, marketers
// ---------------------------------------------------------------------------

// Returns Map<filingId_referenceId, name>
async function loadSubTable(
  csvPath: string,
  nameColumns: string[]
): Promise<Map<string, string>> {
  if (!existsSync(csvPath)) return new Map();

  const text = readFileSync(csvPath, "utf8");
  const gen = parseCSVLines(text);
  const { value: headerRow } = gen.next();
  if (!headerRow) return new Map();
  const headers = headerRow.map((h) => h.trim());

  const filingIdCol = findCol(headers, ["FilingID", "Filing ID"]);
  const refIdCol = findCol(headers, ["ReferenceID", "Reference ID"]);
  let nameCol = -1;
  for (const nc of nameColumns) {
    const i = headers.indexOf(nc);
    if (i >= 0) { nameCol = i; break; }
  }
  if (nameCol < 0) {
    // Try case-insensitive
    const lowerNames = nameColumns.map((n) => n.toLowerCase());
    for (let i = 0; i < headers.length; i++) {
      if (lowerNames.includes(headers[i].toLowerCase())) {
        nameCol = i;
        break;
      }
    }
  }
  if (nameCol < 0) return new Map();

  const out = new Map<string, string>();
  for (const row of Array.from(gen)) {
    const rec = mapRow(headers, row);
    const fid = (rec[headers[filingIdCol]] || "").trim();
    const rid = (rec[headers[refIdCol]] || "").trim();
    const name = (rec[headers[nameCol]] || "").trim();
    if (fid && name) {
      const key = `${fid}__${rid}`;
      if (!out.has(key)) out.set(key, name);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Load IA_Schedule_D_7B1.csv — fund details
// ---------------------------------------------------------------------------

// Returns Map<filingId, ScheduleD7B1Row[]>
async function loadScheduleD7B1(csvPath: string): Promise<Map<string, ScheduleD7B1Row[]>> {
  console.log("Loading Schedule D 7B1 fund table...");
  const text = readFileSync(csvPath, "utf8");
  const gen = parseCSVLines(text);
  const { value: headerRow } = gen.next();
  if (!headerRow) throw new Error("Empty 7B1 CSV");
  const headers = headerRow.map((h) => h.trim());

  // Column indices from confirmed headers:
  // "FilingID","Fund Name","Fund ID","ReferenceID","State","Country",
  // "3(c)(1) Exclusion","3(c)(7) Exclusion","Master Fund","Feeder Fund",
  // "Master Fund Name","Master Fund ID","Fund of Funds","Fund Invested Self or Related",
  // "Fund Invested in Securities","Fund Type","Fund Type Other","Gross Asset Value",
  // "Minimum Investment","Owners","%Owned You or Related","%Owned Funds",
  // "Sales Limited","%Owned Non-US","Subadviser","Other IAs Advise",
  // "Clients Solicited","Percentage Invested","Exempt from Registration",
  // "Annual Audit","GAAP","FS Distributed","Unqualified Opinion",
  // "Prime Brokers","Custodians","Administrator","% Assets Valued","Marketing"

  const get = (row: Record<string, string>, ...names: string[]): string => {
    for (const n of names) {
      const v = row[n];
      if (v !== undefined) return v.trim();
    }
    return "";
  };

  const byFiling = new Map<string, ScheduleD7B1Row[]>();
  let total = 0;

  for (const row of Array.from(gen)) {
    if (row.length < 5) continue;
    const rec = mapRow(headers, row);
    const fid = get(rec, "FilingID", "Filing ID").trim();
    if (!fid) continue;

    const fundType = get(rec, "Fund Type", "FundType");
    const lowerType = fundType.toLowerCase();
    if (ACCEPTED_FUND_TYPES.size > 0 && !ACCEPTED_FUND_TYPES.has(lowerType)) {
      continue;
    }

    const r: ScheduleD7B1Row = {
      filing_id: fid,
      fund_name: get(rec, "Fund Name", "FundName"),
      fund_id: get(rec, "Fund ID", "FundID"),
      reference_id: get(rec, "ReferenceID", "Reference ID"),
      state: get(rec, "State"),
      country: get(rec, "Country"),
      exclusion_3c1: get(rec, "3(c)(1) Exclusion"),
      exclusion_3c7: get(rec, "3(c)(7) Exclusion"),
      master_fund: get(rec, "Master Fund"),
      feeder_fund: get(rec, "Feeder Fund"),
      fund_of_funds: get(rec, "Fund of Funds"),
      fund_type: fundType,
      fund_type_other: get(rec, "Fund Type Other"),
      gross_asset_value: get(rec, "Gross Asset Value"),
      minimum_investment: get(rec, "Minimum Investment"),
      owners: get(rec, "Owners"),
      pct_owned_related: get(rec, "%Owned You or Related"),
      pct_owned_funds: get(rec, "%Owned Funds"),
      sales_limited: get(rec, "Sales Limited"),
      pct_owned_non_us: get(rec, "%Owned Non-US"),
      is_subadviser: get(rec, "Subadviser"),
      other_ias: get(rec, "Other IAs Advise"),
      clients_solicited: get(rec, "Clients Solicited"),
      exempt_from_reg: get(rec, "Exempt from Registration"),
      annual_audit: get(rec, "Annual Audit"),
      marketing: get(rec, "Marketing"),
    };

    if (!r.fund_name) continue;

    if (!byFiling.has(fid)) byFiling.set(fid, []);
    byFiling.get(fid)!.push(r);
    total++;
  }

  console.log(
    `  Loaded ${total.toLocaleString()} fund rows across ${byFiling.size.toLocaleString()} filings`
  );
  return byFiling;
}

// ---------------------------------------------------------------------------
// Adviser name normalization
// ---------------------------------------------------------------------------

function normalizeAdviserName(name: string): string {
  return name
    .toLowerCase()
    .replace(/,?\s+(llc|lp|l\.p\.|l\.l\.c\.|inc|incorporated|ltd|co\.|company|corp|gp|management|advisors?|capital|partners?|ventures?|group|associates?|asset|investments?|financial|services?)\.?\s*$/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Firm matching
// ---------------------------------------------------------------------------

interface MatchResult {
  firm_id: string | null;
  match_method: "sec_file_number" | "legal_name_exact" | "legal_name_fuzzy" | "none";
  confidence: number;
  ambiguous: boolean;
  candidates: FirmRow[];
}

function matchAdviserToFirm(adviser: AdviserRecord, firms: FirmRow[]): MatchResult {
  // 1. SEC file number exact match
  if (adviser.sec_file_number) {
    const bySecNum = firms.filter(
      (f) =>
        f.sec_file_number &&
        f.sec_file_number.trim().toLowerCase() ===
          adviser.sec_file_number.toLowerCase()
    );
    if (bySecNum.length === 1) {
      return {
        firm_id: bySecNum[0].id,
        match_method: "sec_file_number",
        confidence: 0.99,
        ambiguous: false,
        candidates: bySecNum,
      };
    }
    if (bySecNum.length > 1) {
      return {
        firm_id: null,
        match_method: "sec_file_number",
        confidence: 0.0,
        ambiguous: true,
        candidates: bySecNum,
      };
    }
  }

  // 2. Exact normalized legal name
  const advNorm = adviser.normalized_legal_name;
  if (advNorm.length < 3) {
    return { firm_id: null, match_method: "none", confidence: 0, ambiguous: false, candidates: [] };
  }

  const byLegalExact = firms.filter(
    (f) => f.legal_name && normalizeAdviserName(f.legal_name) === advNorm
  );
  if (byLegalExact.length === 1) {
    return {
      firm_id: byLegalExact[0].id,
      match_method: "legal_name_exact",
      confidence: 0.92,
      ambiguous: false,
      candidates: byLegalExact,
    };
  }
  if (byLegalExact.length > 1) {
    return {
      firm_id: null,
      match_method: "legal_name_exact",
      confidence: 0.0,
      ambiguous: true,
      candidates: byLegalExact,
    };
  }

  // 3. Fuzzy normalized name match (Jaccard ≥ 0.75 against firm_name OR legal_name)
  let bestScore = 0;
  let bestFirm: FirmRow | null = null;
  const candidates: FirmRow[] = [];

  for (const f of firms) {
    const names = [f.firm_name, f.legal_name].filter(Boolean) as string[];
    for (const n of names) {
      const score = jaccardSim(advNorm, normalizeAdviserName(n));
      if (score >= 0.75) {
        if (score > bestScore) {
          bestScore = score;
          bestFirm = f;
        }
        if (!candidates.includes(f)) candidates.push(f);
      }
    }
  }

  if (candidates.length === 1 && bestScore >= 0.85) {
    return {
      firm_id: bestFirm!.id,
      match_method: "legal_name_fuzzy",
      confidence: 0.75 + (bestScore - 0.85) * 2,
      ambiguous: false,
      candidates,
    };
  }

  if (candidates.length > 1) {
    return {
      firm_id: null,
      match_method: "legal_name_fuzzy",
      confidence: 0.0,
      ambiguous: true,
      candidates,
    };
  }

  return { firm_id: null, match_method: "none", confidence: 0, ambiguous: false, candidates: [] };
}

function jaccardSim(a: string, b: string): number {
  const sa = new Set(a.split(/\s+/).filter((t) => t.length > 1));
  const sb = new Set(b.split(/\s+/).filter((t) => t.length > 1));
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const t of Array.from(sa)) {
    if (sb.has(t)) intersection++;
  }
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Fund record upsert
// ---------------------------------------------------------------------------

async function upsertFundRecord(
  supabase: SupabaseClient,
  firmId: string | null,
  adviser: AdviserRecord,
  fund: ScheduleD7B1Row,
  auditorName: string | null,
  primeBrokerName: string | null,
  marketerName: string | null
): Promise<{ action: "upserted" | "skipped" | "dry_run"; id?: string }> {
  const normalizedName = normalizeFundName(fund.fund_name);

  const grossAsset = fund.gross_asset_value
    ? parseFloat(fund.gross_asset_value)
    : null;
  const minInv = fund.minimum_investment
    ? parseFloat(fund.minimum_investment)
    : null;
  const owners = fund.owners ? parseInt(fund.owners, 10) : null;
  const pctRelated = fund.pct_owned_related
    ? parseFloat(fund.pct_owned_related)
    : null;
  const pctFunds = fund.pct_owned_funds
    ? parseFloat(fund.pct_owned_funds)
    : null;
  const pctNonUs = fund.pct_owned_non_us
    ? parseFloat(fund.pct_owned_non_us)
    : null;
  const isSubadviser =
    fund.is_subadviser === "Y"
      ? true
      : fund.is_subadviser === "N"
      ? false
      : null;
  const otherAdvisers =
    fund.other_ias === "Y" ? true : fund.other_ias === "N" ? false : null;
  const solicited =
    fund.clients_solicited === "Y"
      ? true
      : fund.clients_solicited === "N"
      ? false
      : null;
  const regD =
    fund.exempt_from_reg === "Y"
      ? true
      : fund.exempt_from_reg === "N"
      ? false
      : null;

  const jurisdiction = fund.country || fund.state || null;

  const record = {
    firm_id: firmId,
    fund_name: fund.fund_name,
    normalized_fund_name: normalizedName,

    // ADV-specific fields
    adviser_legal_name: adviser.legal_name,
    adviser_sec_file_number: adviser.sec_file_number || null,
    adviser_crd_number: adviser.crd_number || null,
    private_fund_identification_number: fund.fund_id || null,
    fund_organization_jurisdiction: jurisdiction,
    fund_category: fund.fund_type || null,

    current_gross_asset_value_usd:
      grossAsset && !isNaN(grossAsset) ? grossAsset : null,
    minimum_investment_commitment_usd:
      minInv && !isNaN(minInv) ? minInv : null,
    approximate_beneficial_owner_count:
      owners && !isNaN(owners) ? owners : null,

    percent_owned_by_related_persons:
      pctRelated !== null && !isNaN(pctRelated) ? pctRelated : null,
    percent_owned_by_funds_of_funds:
      pctFunds !== null && !isNaN(pctFunds) ? pctFunds : null,
    percent_owned_by_non_us_persons:
      pctNonUs !== null && !isNaN(pctNonUs) ? pctNonUs : null,

    adviser_is_subadviser: isSubadviser,
    other_advisers: otherAdvisers,
    solicited_to_invest: solicited,
    regulation_d_relied_on: regD,

    auditor_name: auditorName,
    prime_broker_name: primeBrokerName,
    marketer_name: marketerName,

    source_filing_type: "form_adv_schedule_d",
    confidence: ADV_SOURCE_CONFIDENCE,

    // Only update size_usd if we have a gross asset value and no existing value
    ...(grossAsset && !isNaN(grossAsset) ? { aum_usd: grossAsset } : {}),
  };

  if (DRY_RUN) {
    return { action: "dry_run" };
  }

  // Upsert on (firm_id, normalized_fund_name) if firm_id is present
  // Otherwise upsert on private_fund_identification_number
  if (firmId) {
    const { data, error } = await supabase
      .from("fund_records")
      .upsert(record, {
        onConflict: "firm_id,normalized_fund_name",
        ignoreDuplicates: false,
      })
      .select("id")
      .single();

    if (error) {
      // If conflict is on PFIN unique index, try update by PFIN
      if (
        error.code === "23505" &&
        fund.fund_id
      ) {
        const { data: updData, error: updErr } = await supabase
          .from("fund_records")
          .update(record)
          .eq("private_fund_identification_number", fund.fund_id)
          .select("id")
          .single();
        if (updErr) throw new Error(updErr.message);
        return { action: "upserted", id: updData?.id };
      }
      throw new Error(error.message);
    }
    return { action: "upserted", id: data?.id };
  } else if (fund.fund_id) {
    // No firm link — upsert on PFIN
    const { data, error } = await supabase
      .from("fund_records")
      .upsert(record, {
        onConflict: "private_fund_identification_number",
        ignoreDuplicates: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { action: "upserted", id: data?.id };
  }

  return { action: "skipped" };
}

async function writeSourceEvidence(
  supabase: SupabaseClient,
  fundId: string,
  adviser: AdviserRecord
): Promise<void> {
  await supabase.from("fund_source_evidence").insert({
    fund_id: fundId,
    field_name: "*",
    source_type: "sec_filing",
    source_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${adviser.crd_number}&type=ADV&dateb=&owner=include&count=10`,
    evidence_quote: `Form ADV Schedule D, adviser ${adviser.legal_name} (CRD ${adviser.crd_number})`,
    source_confidence: ADV_SOURCE_CONFIDENCE,
    raw_payload: {
      crd_number: adviser.crd_number,
      sec_file_number: adviser.sec_file_number,
      filing_id: adviser.filing_id,
      source: "IA_Schedule_D_7B1_bulk_csv",
    },
  });
}

async function addToReviewQueue(
  supabase: SupabaseClient,
  adviser: AdviserRecord,
  fund: ScheduleD7B1Row,
  reason: string,
  candidates: FirmRow[]
): Promise<void> {
  if (DRY_RUN) return;
  await supabase.from("enrichment_review_queue").insert({
    entity_type: "firm_fund_link",
    entity_id: fund.fund_id || `${adviser.crd_number}__${fund.fund_name}`,
    firm_id: candidates[0]?.id ?? null,
    reason,
    review_data: {
      fund_name: fund.fund_name,
      fund_id: fund.fund_id,
      adviser_legal_name: adviser.legal_name,
      adviser_crd_number: adviser.crd_number,
      adviser_sec_file_number: adviser.sec_file_number,
      candidate_firms: candidates.map((c) => ({
        id: c.id,
        firm_name: c.firm_name,
        legal_name: c.legal_name,
        slug: c.slug,
      })),
    },
    status: "pending",
  });
}

// ---------------------------------------------------------------------------
// Update firm SEC identifiers (backfill sec_file_number / crd on firm_records)
// ---------------------------------------------------------------------------

async function backfillFirmSecIdentifiers(
  supabase: SupabaseClient,
  firmId: string,
  adviser: AdviserRecord
): Promise<void> {
  if (DRY_RUN) return;
  await supabase
    .from("firm_records")
    .update({
      sec_file_number: adviser.sec_file_number || null,
      adviser_crd_number: adviser.crd_number || null,
    })
    .eq("id", firmId)
    .is("sec_file_number", null); // only set if not already populated
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== Form ADV Schedule D Fund Ingestion Pipeline ===");
  console.log(`DRY_RUN=${DRY_RUN}  ACCEPTED_FUND_TYPES=${Array.from(ACCEPTED_FUND_TYPES).join(",")}`);
  console.log();

  // ── Step 1: Ensure CSV files are available ──────────────────────────────

  ensureCache();

  const part1ZipPath = cachePath("adv-part1.zip");
  const part2ZipPath = cachePath("adv-part2.zip");
  const baseCSVPath = cachePath("IA_ADV_Base.csv");
  const fund7B1Path = cachePath("IA_Schedule_D_7B1.csv");
  const audit7B1A22Path = cachePath("IA_Schedule_D_7B1A22.csv");
  const primeBroker7B1A24Path = cachePath("IA_Schedule_D_7B1A24.csv");
  const marketing7B1A28Path = cachePath("IA_Schedule_D_7B1A28.csv");

  // Download Part 1 ZIP if needed (for IA_ADV_Base.csv)
  if (!existsSync(baseCSVPath) || FORCE_DOWNLOAD) {
    if (!existsSync(part1ZipPath) || FORCE_DOWNLOAD) {
      await cachedOrDownload("adv-part1.zip", ADV_PART1_ZIP);
    }
    await extractFromZip(part1ZipPath, "IA_ADV_Base.csv", baseCSVPath);
  }

  // Download Part 2 ZIP if needed (for 7B1 and sub-tables)
  const part2Files = [
    { name: "IA_Schedule_D_7B1.csv", path: fund7B1Path },
    { name: "IA_Schedule_D_7B1A22.csv", path: audit7B1A22Path },
    { name: "IA_Schedule_D_7B1A24.csv", path: primeBroker7B1A24Path },
    { name: "IA_Schedule_D_7B1A28.csv", path: marketing7B1A28Path },
  ];

  const needPart2 = part2Files.some(
    (f) => !existsSync(f.path) || FORCE_DOWNLOAD
  );
  if (needPart2) {
    if (!existsSync(part2ZipPath) || FORCE_DOWNLOAD) {
      await cachedOrDownload("adv-part2.zip", ADV_PART2_ZIP);
    }
    for (const f of part2Files) {
      if (!existsSync(f.path) || FORCE_DOWNLOAD) {
        try {
          await extractFromZip(part2ZipPath, f.name, f.path);
        } catch {
          console.warn(`  Warning: ${f.name} not found in ZIP, skipping.`);
        }
      }
    }
  } else {
    console.log("  All CSV files already cached.");
  }
  console.log();

  // ── Step 2: Load data ───────────────────────────────────────────────────

  const advisers = await loadAdviserBase(baseCSVPath);
  const fundsByFiling = await loadScheduleD7B1(fund7B1Path);

  // Sub-tables (best-effort)
  const auditTable = await loadSubTable(audit7B1A22Path, [
    "Auditor Name",
    "AuditorName",
    "Name",
    "AccountantName",
    "Accountant Name",
  ]);
  const primeBrokerTable = await loadSubTable(primeBroker7B1A24Path, [
    "Firm Name",
    "FirmName",
    "PrimeBrokerName",
    "Prime Broker Name",
    "Name",
  ]);
  const marketingTable = await loadSubTable(marketing7B1A28Path, [
    "Firm Name",
    "FirmName",
    "MarketingName",
    "Marketing Name",
    "Name",
  ]);

  console.log(
    `  Sub-tables: auditors=${auditTable.size}, prime brokers=${primeBrokerTable.size}, marketing=${marketingTable.size}`
  );
  console.log();

  // ── Step 3: Load firm_records from Supabase ─────────────────────────────

  console.log("Loading firm_records from Supabase...");
  const { data: firmData, error: firmError } = await supabase
    .from("firm_records")
    .select("id, firm_name, legal_name, slug, sec_file_number, adviser_crd_number")
    .is("deleted_at", null);

  if (firmError) throw new Error(`firm_records query failed: ${firmError.message}`);
  const firms: FirmRow[] = firmData || [];
  console.log(`  ${firms.length.toLocaleString()} firms loaded`);
  console.log();

  // Build lookup maps for O(1) matching
  const firmsBySecFile = new Map<string, FirmRow>();
  const firmsByCrd = new Map<string, FirmRow>();
  for (const f of firms) {
    if (f.sec_file_number) firmsBySecFile.set(f.sec_file_number.toLowerCase(), f);
    if (f.adviser_crd_number) firmsByCrd.set(f.adviser_crd_number, f);
  }

  // ── Step 4: Match advisers → firms, process funds ─────────────────────

  const stats = {
    advisersMatched: 0,
    advisersNoMatch: 0,
    advisersAmbiguous: 0,
    fundsUpserted: 0,
    fundsDryRun: 0,
    fundsSkipped: 0,
    fundsError: 0,
    reviewQueueAdded: 0,
  };

  let processedAdvisers = 0;

  for (const [crd, adviser] of Array.from(advisers.entries())) {
    // Single-adviser mode
    if (TARGET_CRD && crd !== TARGET_CRD) continue;

    // Does this adviser have any fund rows we care about?
    const fundRows = fundsByFiling.get(adviser.filing_id);
    if (!fundRows || fundRows.length === 0) continue;

    if (processedAdvisers >= MAX_ADVISERS) break;
    processedAdvisers++;

    // Match adviser to a firm
    const match = matchAdviserToFirm(adviser, firms);

    if (match.ambiguous) {
      stats.advisersAmbiguous++;
      // Add to review queue for each fund
      for (const fund of fundRows) {
        await addToReviewQueue(
          supabase,
          adviser,
          fund,
          `Ambiguous firm match: ${match.candidates.length} candidates for adviser "${adviser.legal_name}" (CRD ${crd})`,
          match.candidates
        );
        stats.reviewQueueAdded++;
      }
      console.log(
        `  AMBIGUOUS  ${adviser.legal_name} (CRD ${crd}) → ${match.candidates.length} candidates, ${fundRows.length} funds queued`
      );
      continue;
    }

    const firmId = match.firm_id;

    if (firmId) {
      stats.advisersMatched++;
      // Backfill SEC identifiers onto firm
      await backfillFirmSecIdentifiers(supabase, firmId, adviser);
    } else if (match.match_method === "none") {
      stats.advisersNoMatch++;
      if (TARGET_CRD) {
        console.log(
          `  NO MATCH   ${adviser.legal_name} (CRD ${crd}) — not in firm_records`
        );
      }
      // Still ingest funds without firm link if PFIN is available
    }

    // Process each fund for this adviser
    for (const fund of fundRows) {
      try {
        const refKey = `${adviser.filing_id}__${fund.reference_id}`;
        const auditorName = auditTable.get(refKey) ?? null;
        const primeBrokerName = primeBrokerTable.get(refKey) ?? null;
        const marketerName = marketingTable.get(refKey) ?? null;

        const result = await upsertFundRecord(
          supabase,
          firmId,
          adviser,
          fund,
          auditorName,
          primeBrokerName,
          marketerName
        );

        if (result.action === "upserted") {
          stats.fundsUpserted++;
          if (result.id) {
            await writeSourceEvidence(supabase, result.id, adviser);
          }
          if (firmId) {
            console.log(
              `  ✓ ${adviser.legal_name.slice(0, 40).padEnd(40)}  ${fund.fund_name.slice(0, 50)}`
            );
          }
        } else if (result.action === "dry_run") {
          stats.fundsDryRun++;
          const firmLabel = firmId
            ? firms.find((f) => f.id === firmId)?.firm_name ?? firmId
            : "(no firm link)";
          console.log(
            `  [DRY] ${firmLabel.slice(0, 30).padEnd(30)}  ${adviser.legal_name.slice(0, 30).padEnd(30)}  ${fund.fund_name}`
          );
        } else {
          stats.fundsSkipped++;
        }
      } catch (err) {
        stats.fundsError++;
        console.error(
          `  ERROR ${adviser.legal_name} / ${fund.fund_name}: ${(err as Error).message}`
        );
      }
    }

    // Throttle slightly to avoid hammering Supabase
    if (!DRY_RUN && processedAdvisers % 10 === 0) {
      await sleep(50);
    }
  }

  // ── Step 5: Summary ─────────────────────────────────────────────────────

  console.log();
  console.log("=== Summary ===");
  console.log(`  Advisers matched to firms : ${stats.advisersMatched}`);
  console.log(`  Advisers ambiguous        : ${stats.advisersAmbiguous}`);
  console.log(`  Advisers no match         : ${stats.advisersNoMatch}`);
  console.log(`  Funds upserted            : ${stats.fundsUpserted}`);
  console.log(`  Funds dry-run logged      : ${stats.fundsDryRun}`);
  console.log(`  Funds skipped             : ${stats.fundsSkipped}`);
  console.log(`  Funds errored             : ${stats.fundsError}`);
  console.log(`  Review queue entries added: ${stats.reviewQueueAdded}`);
  console.log();

  if (DRY_RUN) {
    console.log("DRY RUN complete — no writes made.");
  } else {
    console.log("Done.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
