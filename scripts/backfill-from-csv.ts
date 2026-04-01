/**
 * backfill-from-csv.ts
 *
 * 1. PATCH missing fields on existing firm_records and firm_investors using CSVs + Wikipedia
 * 2. INSERT new firms from CSVs not already in the DB (deduped by name + website domain)
 * 3. INSERT OpenVC angels as Solo GP firm_records + linked firm_investors record
 *
 * Deduplication uses the vc_firm_aliases table (ALSO_KNOWN_AS, WEBSITE_DOMAIN, LEGAL_NAME).
 * Every inserted firm gets its name and domain registered as aliases for future runs.
 *
 * Usage:
 *   npx tsx scripts/backfill-from-csv.ts
 *   DRY_RUN=1 npx tsx scripts/backfill-from-csv.ts
 *   BACKFILL_FIRMS=0 npx tsx scripts/backfill-from-csv.ts      (investors/angels only)
 *   BACKFILL_INVESTORS=0 npx tsx scripts/backfill-from-csv.ts  (firms only)
 *   BACKFILL_WIKI=0 npx tsx scripts/backfill-from-csv.ts       (skip Wikipedia)
 *   INSERT_NEW=0 npx tsx scripts/backfill-from-csv.ts          (patch only, no inserts)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// ── Env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  for (const name of [".env", ".env.local"]) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v) process.env[m[1]] = v;
    }
  }
}
loadEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const DRY_RUN      = process.env.DRY_RUN === "1";
const DO_FIRMS     = process.env.BACKFILL_FIRMS     !== "0";
const DO_INVESTORS = process.env.BACKFILL_INVESTORS !== "0";
const DO_WIKI      = process.env.BACKFILL_WIKI      !== "0";
const INSERT_NEW   = process.env.INSERT_NEW         !== "0";

const SB = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

// ── Supabase helpers ─────────────────────────────────────────────────────────
async function sbGet<T>(table: string, select = "*", extra = ""): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=10000${extra}`, { headers: SB });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPatch(table: string, id: string, patch: Record<string, any>): Promise<boolean> {
  if (DRY_RUN) { console.log(`  [DRY PATCH] ${table}.${id}:`, Object.keys(patch).join(", ")); return true; }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH", headers: { ...SB, Prefer: "return=minimal" }, body: JSON.stringify(patch),
  });
  if (!res.ok) console.warn(`  ✗ PATCH failed ${table}.${id}: ${res.status} ${await res.text().catch(() => "")}`);
  return res.ok;
}

async function sbInsert(table: string, data: Record<string, any>): Promise<string | null> {
  if (DRY_RUN) { console.log(`  [DRY INSERT] ${table}:`, JSON.stringify(data).slice(0, 120)); return "dry-run-id"; }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: { ...SB, Prefer: "return=representation" }, body: JSON.stringify(data),
  });
  if (!res.ok) { console.warn(`  ✗ INSERT failed ${table}: ${res.status} ${await res.text().catch(() => "")}`); return null; }
  const rows = await res.json();
  return rows?.[0]?.id ?? null;
}

// ── CSV parser ───────────────────────────────────────────────────────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i+1] === '"') { cur += '"'; i++; } else inQuotes = false; }
      else cur += c;
    } else if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(cur); cur = ""; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(cur); cur = "";
      if (row.some(cell => cell.length > 0)) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); if (row.some(c => c.length > 0)) rows.push(row); }
  return rows;
}

function loadCsv(path: string): Record<string, string>[] {
  if (!existsSync(path)) { console.warn(`  ⚠ CSV not found: ${path}`); return []; }
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(raw);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (row[i] || "").trim(); });
    return obj;
  });
}

// ── Normalisation ─────────────────────────────────────────────────────────────
function norm(s: string): string {
  return (s || "").toLowerCase()
    .replace(/\bventures?\b|\bcapital\b|\bpartners?\b|\bmanagement\b|\bfund\b|\bllc\b|\binc\b/g, "")
    .replace(/[^a-z0-9]/g, "").trim();
}

function domainFromUrl(url: string): string {
  try { return new URL(url.startsWith("http") ? url : "https://" + url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

// ── Stage normalisation ───────────────────────────────────────────────────────
const STAGE_MAP: [RegExp, string][] = [
  [/pre.?seed|pre seed|1\.\s*(idea|patent)|2\.\s*prototype/i, "Pre-Seed"],
  [/\bseed\b|3\.\s*early.?revenue/i,                          "Seed"],
  [/series.?a|4\.\s*scaling/i,                                "Series A"],
  [/series.?b|series.?c|series.?d/i,                         "Series B+"],
  [/growth|late.?stage|5\.\s*growth/i,                       "Growth"],
  [/friends.+family|f&f/i,                                   "Friends and Family"],
];
const STAGE_ORDER = ["Friends and Family","Pre-Seed","Seed","Series A","Series B+","Growth"];

function parseStages(raw: string): string[] {
  const out = new Set<string>();
  for (const [re, val] of STAGE_MAP) if (re.test(raw)) out.add(val);
  return [...out];
}

// ── HQ parsing ────────────────────────────────────────────────────────────────
function parseHq(raw: string): { hq_city?: string; hq_state?: string; hq_country?: string } {
  if (!raw) return {};
  const first = raw.split(/[;\n]/)[0].trim().replace(/^"+|"+$/g, "");
  const parts  = first.split(",").map(s => s.trim()).filter(Boolean);
  if (!parts.length) return {};
  return { hq_city: parts[0] || undefined, hq_state: parts[1] || undefined, hq_country: parts[2] || (parts[1] ? "US" : undefined) };
}

// ── AUM ───────────────────────────────────────────────────────────────────────
function parseAum(raw: string): string | null {
  if (!raw || raw === "$0.00M" || raw === "-") return null;
  const m = raw.match(/\$[\d.,]+[MBK](?:\s*[-–]\s*\$[\d.,]+[MBK])?/i);
  return m ? m[0] : (raw.trim() || null);
}

// ── Check size ────────────────────────────────────────────────────────────────
function parseCheckSize(raw: string): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/\$?([\d.]+)([KkMmBb]?)/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const s = m[2].toUpperCase();
  if (s === "K") n *= 1_000; if (s === "M") n *= 1_000_000; if (s === "B") n *= 1_000_000_000;
  return Math.round(n);
}

// ── Entity type mapping ───────────────────────────────────────────────────────
function mapEntityType(raw: string): string | null {
  const t = (raw || "").toLowerCase();
  if (/\bvc\b|venture capital|institutional/i.test(t))       return "Institutional";
  if (/family.?office/i.test(t))                            return "Family Office";
  if (/angel.?network/i.test(t))                            return "Angel network";
  if (/\bangel\b/i.test(t))                                 return "Solo GP";
  if (/corporate|cvc/i.test(t))                             return "Corporate (CVC)";
  if (/accelerator|incubator/i.test(t))                     return "Accelerator / Studio";
  if (/studio/i.test(t))                                    return "Accelerator / Studio";
  if (/micro/i.test(t))                                     return "Micro";
  if (/pe\b|private.?equity/i.test(t))                      return "Institutional";
  return null;
}

// ── Wikipedia ─────────────────────────────────────────────────────────────────
async function fetchWikipedia(firmName: string): Promise<Record<string, any>> {
  try {
    const search = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(firmName + " venture capital")}&format=json&utf8=1&srlimit=1`,
      { signal: AbortSignal.timeout(8000) }
    ).then(r => r.json()).catch(() => null);
    const title = search?.query?.search?.[0]?.title;
    if (!title) return {};
    const page = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&format=json&utf8=1`,
      { signal: AbortSignal.timeout(8000) }
    ).then(r => r.json()).catch(() => null);
    const content: string = Object.values(page?.query?.pages || {})?.[0]?.revisions?.[0]?.["*"] || "";
    if (!content || content.includes("disambiguation")) return {};
    const result: Record<string, any> = {};
    const aumMatch = content.match(/aum\s*=\s*([^\n|]+)/i);
    if (aumMatch) result.aum = aumMatch[1].replace(/\[\[|\]\]/g, "").trim().slice(0, 50);
    const foundedMatch = content.match(/founded\s*=\s*(\d{4})/i) || content.match(/founded in (\d{4})/i);
    if (foundedMatch) result.founded_year = parseInt(foundedMatch[1]);
    const hqMatch = content.match(/(?:headquarters|location|hq)\s*=\s*([^\n|<]+)/i);
    if (hqMatch) Object.assign(result, parseHq(hqMatch[1].replace(/\[\[|\]\]|\{\{.*?\}\}/g, "").trim()));
    const plainText = content.replace(/\{\{[^}]*\}\}/g,"").replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g,"$2")
      .replace(/'{2,}/g,"").replace(/<[^>]+>/g,"").split("\n")
      .map(l=>l.trim()).filter(l=>l.length>80&&!l.startsWith("|")&&!l.startsWith("{")).slice(0,2).join(" ");
    if (plainText.length > 50) result.description = plainText.slice(0, 500);
    return result;
  } catch { return {}; }
}

// ── Index helpers ─────────────────────────────────────────────────────────────
function buildIndex<T>(rows: T[], nameKey: string): Map<string, T> {
  const idx = new Map<string, T>();
  for (const row of rows) { const n = norm((row as any)[nameKey] || ""); if (n) idx.set(n, row); }
  return idx;
}
function lookup<T>(idx: Map<string, T>, name: string): T | undefined {
  const n = norm(name);
  if (idx.has(n)) return idx.get(n);
  for (const [k, v] of idx) { if (k.includes(n) || n.includes(k)) return v; }
  return undefined;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  CSV + Wikipedia Backfill  ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log(`${"═".repeat(64)}`);
  console.log(`  Patch existing: firms=${DO_FIRMS}  investors=${DO_INVESTORS}  wiki=${DO_WIKI}`);
  console.log(`  Insert new records: ${INSERT_NEW}\n`);

  // ── Load CSVs ──────────────────────────────────────────────────────────────
  const dataDir = join(process.cwd(), "data");
  const find = (name: string) => [join(dataDir, name), join(process.cwd(), name)].find(existsSync) || join(dataDir, name);

  const firmsCsv    = loadCsv(find("Firms-Grid view.csv"));
  const seedCsv     = loadCsv(find("vc_firms_seed_preseed.csv"));
  const nycCsv      = loadCsv(find("Early Stage NYC VCs-Grid view.csv"));
  const contCsv     = loadCsv(find("Investors - continue to add more firms.csv"));
  const gigaCsv     = loadCsv(find("Gigasheet_investors.csv"));
  const investorCsv = loadCsv(find("Early-Stage Investor List-Grid view (1)_enriched.csv"));
  const openvcCsv   = loadCsv(find("openvc_oct2025.csv"));
  const xlsCsv      = loadCsv(find("investment_firm_sample.csv"));
  const mercuryCsv  = loadCsv(find("mercury_investor_database.csv"));
  const list5kCsv   = loadCsv(find("list5k_vc_firms.csv"));
  const crmCsv      = loadCsv(find("companies_crm.csv"));
  const peopleCsv   = loadCsv(find("people_crm.csv"));
  const people2Csv  = loadCsv(find("people2_crm.csv"));
  const publicCsv   = loadCsv(find("public_vc.csv"));
  const vcListCsv   = loadCsv(find("vc_list.csv"));
  const nyc2Csv     = loadCsv(find("Early Stage NYC VCs-Grid view (1).csv"));

  const ANGEL_TYPES  = new Set(["Angel"]);
  const openvcFirms  = openvcCsv.filter(r => !ANGEL_TYPES.has(r["Investor type"]));
  const openvcAngels = openvcCsv.filter(r => ANGEL_TYPES.has(r["Investor type"]));

  const firmsIdx  = buildIndex(firmsCsv,   "Firm Name");
  const seedIdx   = buildIndex(seedCsv,    "Firm Name");
  const nycIdx    = buildIndex(nycCsv,     "Fund Name");
  const contIdx   = buildIndex(contCsv,    "Firm Name");
  const gigaIdx   = buildIndex(gigaCsv,    "name");
  const openvcIdx  = buildIndex(openvcFirms, "Investor name");
  const angIdx     = buildIndex(openvcAngels,"Investor name");
  const xlsFirmIdx     = buildIndex(xlsCsv,     "Firm Name");
  const xlsInvIdx      = buildIndex(xlsCsv,     "Contact Name");
  const mercuryIdx     = buildIndex(mercuryCsv, "name");
  const list5kIdx      = buildIndex(list5kCsv,  "Investor name");
  const crmFirmIdx     = buildIndex(crmCsv,     "name");
  const publicIdx      = buildIndex(publicCsv,  "Name");
  const vcListIdx      = buildIndex(vcListCsv,  "VC NAME");
  const nyc2Idx        = buildIndex(nyc2Csv,    "Fund Name");
  const peopleFirmIdx  = buildIndex(peopleCsv,  "companies");
  const people2FirmIdx = buildIndex(people2Csv, "companies");
  // Investor lookup by full name across both people CSVs (people2 first — has emails)
  const allPeople = [...people2Csv, ...peopleCsv].map(r => ({
    ...r, _fn: `${r["firstname"] || ""} ${r["lastname"] || ""}`.trim(),
  }));
  const peopleInvIdx = buildIndex(allPeople.filter(r => r._fn), "_fn");

  console.log(`  CSVs loaded:`);
  console.log(`    Firms-Grid view:   ${firmsCsv.length}`);
  console.log(`    Seed/PreSeed:      ${seedCsv.length}`);
  console.log(`    NYC VCs:           ${nycCsv.length}`);
  console.log(`    Continue list:     ${contCsv.length}`);
  console.log(`    Gigasheet:         ${gigaCsv.length}`);
  console.log(`    OpenVC firms:      ${openvcFirms.length}`);
  console.log(`    OpenVC angels:     ${openvcAngels.length}`);
  console.log(`    Investor list:     ${investorCsv.length}`);
  console.log(`    Inv Firm Sample:   ${xlsCsv.length}`);
  console.log(`    Mercury:           ${mercuryCsv.length}`);
  console.log(`    List 5k VC firms:  ${list5kCsv.length}`);
  console.log(`    CRM companies:     ${crmCsv.length}`);
  console.log(`    People CRM:        ${peopleCsv.length}`);
  console.log(`    People 2 CRM:      ${people2Csv.length}`);
  console.log(`    Public VC:         ${publicCsv.length}`);
  console.log(`    VC-List:           ${vcListCsv.length}`);
  console.log(`    NYC VCs (v2):      ${nyc2Csv.length}\n`);

  // ── Load existing DB state ─────────────────────────────────────────────────
  type FirmRow = Record<string, any>;

  const dbFirms = await sbGet<FirmRow>("firm_records", "*", "&deleted_at=is.null");

  // Build dedup maps: normalised name → firm_id, domain → firm_id
  const nameToId   = new Map<string, string>();
  const domainToId = new Map<string, string>();

  for (const f of dbFirms) {
    const n = norm(f.firm_name || "");
    if (n) nameToId.set(n, f.id);
    const d = domainFromUrl(f.website_url || "");
    if (d) domainToId.set(d, f.id);
    // Also index existing aliases[] array
    for (const alias of (f.aliases || [])) {
      const an = norm(alias);
      if (an) nameToId.set(an, f.id);
    }
  }

  console.log(`  DB: ${dbFirms.length} firms loaded\n`);

  // Helper: resolve CSV row to existing firm_id (or null = new)
  function resolveId(name: string, website?: string): string | null {
    const n = norm(name);
    if (nameToId.has(n)) return nameToId.get(n)!;
    if (website) {
      const d = domainFromUrl(website);
      if (d && domainToId.has(d)) return domainToId.get(d)!;
    }
    return null;
  }

  // Helper: register name/domain in local dedup maps (aliases[] col is updated in bulk at end)
  // We collect new aliases and flush them per-firm via PATCH to firm_records.aliases
  const pendingAliases = new Map<string, Set<string>>(); // firmId → Set of alias strings to add

  function registerAliases(firmId: string, name: string, website?: string) {
    const n = norm(name);
    if (n && !nameToId.has(n)) {
      nameToId.set(n, firmId);
      if (!pendingAliases.has(firmId)) pendingAliases.set(firmId, new Set());
      pendingAliases.get(firmId)!.add(name.trim());
    }
    if (website) {
      const d = domainFromUrl(website);
      if (d && !domainToId.has(d)) {
        domainToId.set(d, firmId);
        if (!pendingAliases.has(firmId)) pendingAliases.set(firmId, new Set());
        pendingAliases.get(firmId)!.add(d);
      }
    }
  }

  async function flushAliases() {
    let flushed = 0;
    for (const [firmId, aliases] of pendingAliases) {
      if (aliases.size === 0) continue;
      const existing = firmById.get(firmId);
      const existingAliases: string[] = existing?.aliases || [];
      const newAliases = [...aliases].filter(a => !existingAliases.includes(a));
      if (newAliases.length === 0) continue;
      const merged = [...existingAliases, ...newAliases];
      await sbPatch("firm_records", firmId, { aliases: merged });
      flushed++;
    }
    if (flushed > 0) console.log(`  ↳ Flushed aliases for ${flushed} firms`);
  }

  // ── Build a lookup from firm_id → FirmRow for patching ────────────────────
  const firmById = new Map<string, FirmRow>(dbFirms.map(f => [f.id, f]));

  // ── Helper: build patch for a firm from all CSV sources ───────────────────
  function buildFirmPatch(existing: FirmRow, sources: { g?: any; s?: any; n?: any; c?: any; gi?: any; ov?: any; xls?: any; l5k?: any; crm?: any; pub?: any; vcl?: any; nyc2?: any; pf?: any; p2f?: any }): Record<string, any> {
    const { g, s, n, c, gi, ov, xls, l5k, crm, pub, vcl, nyc2, pf, p2f } = sources;
    const patch: Record<string, any> = {};

    if (!existing.description) {
      const desc = g?.["About"] || n?.["Description"] || ov?.["Investment thesis"] || xls?.["Description"]
        || l5k?.["Investment thesis"] || crm?.["description"] || pub?.["About"]
        || nyc2?.["Description"] || pf?.["Fund Description"] || p2f?.["Fund Description"] || "";
      if (desc.length > 20) patch.description = desc.trim().slice(0, 1000);
    }
    if (!existing.aum) {
      const aum = parseAum(g?.["AUM"] || s?.["Fund Size (AUM)"] || c?.["Size (AUM)"] || "");
      if (aum) patch.aum = aum;
      else if (xls?.["Assets Under Management"]) {
        const raw = parseFloat((xls["Assets Under Management"] || "").replace(/[,$]/g, ""));
        if (!isNaN(raw) && raw > 0) {
          if (raw >= 1e9) patch.aum = `$${+(raw/1e9).toFixed(1)}B`;
          else if (raw >= 1e6) patch.aum = `$${Math.round(raw/1e6)}M`;
          else patch.aum = `$${Math.round(raw/1000)}K`;
        }
      }
    }
    if (!existing.total_headcount) {
      const raw = g?.["Headcount"] || gi?.["size"] || "";
      const rangeM = raw.match(/(\d+)\s*[-–]\s*(\d+)/);
      if (rangeM) patch.total_headcount = Math.round((+rangeM[1] + +rangeM[2]) / 2);
      else { const n = parseInt(raw); if (n > 0) patch.total_headcount = n; }
    }
    if (!existing.website_url) {
      const raw = g?.["Website"] || s?.["Website URL"] || gi?.["website"] || ov?.["Website"] || xls?.["Website"]
        || l5k?.["Website"] || crm?.["favoriteUrl"] || pub?.["Website"] || vcl?.["WEBSITE"] || "";
      const url = raw.startsWith("http") ? raw : (raw ? "https://" + raw : "");
      if (url.startsWith("http")) patch.website_url = url.trim();
    }
    if (!existing.phone) {
      const phone = xls?.["Phone"] || "";
      if (phone.trim()) patch.phone = phone.trim();
    }
    if (!existing.linkedin_url) {
      const url = g?.["LinkedIn"] || gi?.["linkedin_url"] || pf?.["LinkedIn Link"] || p2f?.["LinkedIn Link"] || "";
      if (url.includes("linkedin")) patch.linkedin_url = url.trim();
    }
    if (!existing.x_url) {
      const url = g?.["X"] || c?.["X Profile"] || pf?.["Twitter Link"] || p2f?.["Twitter Link"] || "";
      if (url.includes("twitter") || url.includes("x.com")) patch.x_url = url.trim();
    }
    if (!existing.email) {
      const email = g?.["Email"] || n?.["E-mail"] || crm?.["favoriteEmail"] || nyc2?.["E-mail"] || "";
      if (email.includes("@")) patch.email = email.trim();
    }
    if (!existing.founded_year) {
      const yr = parseInt(g?.["Founded"] || gi?.["founded"] || pf?.["Founding Year"] || p2f?.["Founding Year"] || crm?.["foundationDate"]?.slice(0,4) || "");
      if (yr > 1970 && yr <= new Date().getFullYear()) patch.founded_year = yr;
    }
    if (!existing.hq_city) {
      const hqRaw = g?.["HQ Locations"] || s?.["Location"] || n?.["Location"] || gi?.["locality"]
        || ov?.["Address"] || l5k?.["Global HQ"] || nyc2?.["Location"] || "";
      const hq = parseHq(hqRaw);
      if (hq.hq_city) patch.hq_city = hq.hq_city;
      else if (xls?.["City"]) patch.hq_city = xls["City"].trim();
      else if (pf?.["Location"]) { const g2 = parseHq(pf["Location"]); if (g2.hq_city) patch.hq_city = g2.hq_city; }
      else if (p2f?.["Location"]) { const g2 = parseHq(p2f["Location"]); if (g2.hq_city) patch.hq_city = g2.hq_city; }
      else if (vcl?.["HQ City"]) patch.hq_city = vcl["HQ City"].trim();
      else if (pub?.["Location"]) { const g2 = parseHq(pub["Location"]); if (g2.hq_city) patch.hq_city = g2.hq_city; }
      if (hq.hq_state && !existing.hq_state) patch.hq_state = hq.hq_state;
      else if (!existing.hq_state && xls?.["State"]) patch.hq_state = xls["State"].trim();
      if (hq.hq_country && !existing.hq_country) patch.hq_country = hq.hq_country;
      else if (!existing.hq_country && vcl?.["Country"]) patch.hq_country = vcl["Country"].trim();
    } else if (!existing.hq_state && xls?.["State"]) {
      patch.hq_state = xls["State"].trim();
    }
    if (!existing.min_check_size) {
      const raw = ov?.["First cheque minimum"] || l5k?.["First cheque minimum"] || "";
      const v = parseCheckSize(raw); if (v) patch.min_check_size = v;
    }
    if (!existing.max_check_size) {
      const raw = ov?.["First cheque maximum"] || l5k?.["First cheque maximum"] || "";
      const v = parseCheckSize(raw); if (v) patch.max_check_size = v;
    }
    if (!existing.thesis_verticals?.length) {
      const raw = crm?.["Thesis"] || pf?.["Fund focus"] || p2f?.["Fund focus"] || pub?.["About"] || "";
      if (raw.trim()) patch.elevator_pitch = raw.trim().slice(0, 500);
    }
    if (!existing.entity_type) {
      const raw = g?.["Type"] || ov?.["Investor type"] || l5k?.["Investor type"] || crm?.["Investor Type"]?.split(",")?.[0] || pf?.["Fund type"] || p2f?.["Fund type"] || "";
      const et = mapEntityType(raw); if (et) patch.entity_type = et;
    }
    // Stage focus
    if (!existing.stage_focus?.length) {
      const raw = g?.["Stages"] || s?.["Stage Focus"] || n?.["Stage"] || c?.["Stages"] || ov?.["Stage of investment"]
        || l5k?.["Stage of investment"] || crm?.["Stage Invested"] || pf?.["Fund stage"] || p2f?.["Fund stage"]
        || nyc2?.["Stage"] || xls?.["Stages"] || "";
      const stages = parseStages(raw);
      if (stages.length) {
        patch.stage_focus = stages;
        const sorted = [...stages].sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b));
        if (!existing.stage_min) patch.stage_min = sorted[0];
        if (!existing.stage_max) patch.stage_max = sorted[sorted.length - 1];
      }
    } else {
      // Derive min/max from existing stage_focus
      if (!existing.stage_min || !existing.stage_max) {
        const sorted = [...existing.stage_focus].sort((a:string, b:string) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b));
        if (!existing.stage_min) patch.stage_min = sorted[0];
        if (!existing.stage_max) patch.stage_max = sorted[sorted.length - 1];
      }
    }
    return patch;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — Patch existing firms + Insert new firms
  // ══════════════════════════════════════════════════════════════════════════
  if (DO_FIRMS) {
    console.log("── Phase 1A: Patch existing firms ──────────────────────────\n");
    let patched = 0, wikiHits = 0;

    for (const firm of dbFirms) {
      const sources = {
        g:    lookup(firmsIdx,      firm.firm_name),
        s:    lookup(seedIdx,       firm.firm_name),
        n:    lookup(nycIdx,        firm.firm_name),
        c:    lookup(contIdx,       firm.firm_name),
        gi:   lookup(gigaIdx,       firm.firm_name),
        ov:   lookup(openvcIdx,     firm.firm_name),
        xls:  lookup(xlsFirmIdx,    firm.firm_name),
        l5k:  lookup(list5kIdx,     firm.firm_name),
        crm:  lookup(crmFirmIdx,    firm.firm_name),
        pub:  lookup(publicIdx,     firm.firm_name),
        vcl:  lookup(vcListIdx,     firm.firm_name),
        nyc2: lookup(nyc2Idx,       firm.firm_name),
        pf:   lookup(peopleFirmIdx, firm.firm_name),
        p2f:  lookup(people2FirmIdx,firm.firm_name),
      };
      const patch = buildFirmPatch(firm, sources);

      // Wikipedia for firms still missing key fields
      if (DO_WIKI && (!firm.aum && !patch.aum || !firm.founded_year && !patch.founded_year || !firm.description && !patch.description)) {
        const wiki = await fetchWikipedia(firm.firm_name);
        if (Object.keys(wiki).length) {
          wikiHits++;
          if (!firm.aum        && !patch.aum        && wiki.aum)          patch.aum          = wiki.aum;
          if (!firm.founded_year && !patch.founded_year && wiki.founded_year) patch.founded_year = wiki.founded_year;
          if (!firm.description  && !patch.description  && wiki.description)  patch.description  = wiki.description;
          if (!firm.hq_city    && !patch.hq_city    && wiki.hq_city)     patch.hq_city     = wiki.hq_city;
          if (!firm.hq_state   && !patch.hq_state   && wiki.hq_state)    patch.hq_state    = wiki.hq_state;
          if (!firm.hq_country && !patch.hq_country && wiki.hq_country)  patch.hq_country  = wiki.hq_country;
        }
        await new Promise(r => setTimeout(r, 250));
      }

      if (Object.keys(patch).length) {
        const ok = await sbPatch("firm_records", firm.id, patch);
        if (ok) { patched++; console.log(`  ✓ ${firm.firm_name} — ${Object.keys(patch).join(", ")}`); }
      }

      // Register name/domain aliases for all existing firms (improves future dedup)
      registerAliases(firm.id, firm.firm_name, firm.website_url);
    }
    console.log(`\n  Patched: ${patched}/${dbFirms.length}  Wikipedia hits: ${wikiHits}\n`);

    // ── Insert new firms ───────────────────────────────────────────────────
    if (INSERT_NEW) {
      console.log("── Phase 1B: Insert new firms ───────────────────────────────\n");
      let inserted = 0;

      // Collect all candidate firms from CSVs
      const candidates: { name: string; website: string; source: Record<string, string> }[] = [];
      for (const row of openvcFirms) candidates.push({ name: row["Investor name"], website: row["Website"], source: row });
      for (const row of list5kCsv)   candidates.push({ name: row["Investor name"], website: row["Website"], source: row });
      for (const row of firmsCsv)    candidates.push({ name: row["Firm Name"],    website: row["Website"],     source: row });
      for (const row of seedCsv)     candidates.push({ name: row["Firm Name"],    website: row["Website URL"], source: row });
      for (const row of crmCsv)      candidates.push({ name: row["name"],         website: row["favoriteUrl"], source: row });
      for (const row of publicCsv)   candidates.push({ name: row["Name"],         website: row["Website"],     source: row });

      for (const { name, website, source } of candidates) {
        if (!name || name.length < 2) continue;
        if (resolveId(name, website)) continue; // already in DB

        const isOpenVC = "Investor type" in source;
        const hq = parseHq(source["HQ Locations"] || source["Location"] || source["Address"] || "");
        const stages = parseStages(source["Stages"] || source["Stage Focus"] || source["Stage of investment"] || "");
        const sortedStages = [...stages].sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b));

        const newFirm: Record<string, any> = {
          id:           randomUUID(),
          firm_name:    name.trim(),
          firm_type:    mapEntityType(source["Type"] || source["Investor type"] || "") || "Institutional",
          entity_type:  mapEntityType(source["Type"] || source["Investor type"] || ""),
          description:  (source["About"] || source["Investment thesis"] || "").trim().slice(0, 1000) || null,
          website_url:  website?.startsWith("http") ? website.trim() : null,
          linkedin_url: source["LinkedIn"]?.includes("linkedin") ? source["LinkedIn"].trim() : null,
          x_url:        (source["X"] || "").includes("x.com") || (source["X"] || "").includes("twitter") ? source["X"].trim() : null,
          email:        source["Email"]?.includes("@") ? source["Email"].trim() : null,
          hq_city:      hq.hq_city || null,
          hq_state:     hq.hq_state || null,
          hq_country:   hq.hq_country || null,
          aum:          isOpenVC ? null : parseAum(source["AUM"] || source["Fund Size (AUM)"] || ""),
          min_check_size: parseCheckSize(source["First cheque minimum"] || source["Check Size"] || ""),
          max_check_size: parseCheckSize(source["First cheque maximum"] || source["Check Size"] || ""),
          stage_focus:  stages.length ? stages : null,
          stage_min:    sortedStages[0] || null,
          stage_max:    sortedStages[sortedStages.length - 1] || null,
          is_actively_deploying: true,
          created_at:   new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        };
        // Remove nulls to avoid overwriting DB defaults
        for (const k of Object.keys(newFirm)) { if (newFirm[k] === null || newFirm[k] === "") delete newFirm[k]; }

        const id = await sbInsert("firm_records", newFirm);
        if (id) {
          inserted++;
          nameToId.set(norm(name), id);
          firmById.set(id, { ...newFirm, id });
          registerAliases(id, name, website);
          console.log(`  ✚ ${name}${website ? ` (${domainFromUrl(website)})` : ""}`);
        }
      }
      console.log(`\n  Inserted: ${inserted} new firms\n`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Angels: insert as Solo GP firm + investor record
  // ══════════════════════════════════════════════════════════════════════════
  if (INSERT_NEW && openvcAngels.length) {
    console.log("── Phase 2: Insert OpenVC angels as Solo GPs ────────────────\n");
    let inserted = 0;

    for (const angel of openvcAngels) {
      const name    = angel["Investor name"]?.trim();
      const website = angel["Website"]?.trim();
      if (!name) continue;

      // Check if this angel already exists as a firm
      let firmId = resolveId(name, website);

      if (!firmId) {
        if (!INSERT_NEW) continue;
        // Create Solo GP firm record
        const hq = parseHq(angel["Address"] || "");
        const stages = parseStages(angel["Stage of investment"] || "");
        const sortedStages = [...stages].sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b));

        const newFirm: Record<string, any> = {
          id:           randomUUID(),
          firm_name:    name,
          firm_type:    "Solo GP",
          entity_type:  "Solo GP",
          description:  angel["Investment thesis"]?.trim().slice(0, 1000) || null,
          website_url:  website?.startsWith("http") ? website : null,
          hq_city:      hq.hq_city || null,
          hq_state:     hq.hq_state || null,
          hq_country:   hq.hq_country || null,
          min_check_size: parseCheckSize(angel["First cheque minimum"] || ""),
          max_check_size: parseCheckSize(angel["First cheque maximum"] || ""),
          stage_focus:  stages.length ? stages : null,
          stage_min:    sortedStages[0] || null,
          stage_max:    sortedStages[sortedStages.length - 1] || null,
          is_actively_deploying: true,
          created_at:   new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        };
        for (const k of Object.keys(newFirm)) { if (newFirm[k] === null || newFirm[k] === "") delete newFirm[k]; }

        firmId = await sbInsert("firm_records", newFirm);
        if (!firmId) continue;
        nameToId.set(norm(name), firmId);
        registerAliases(firmId, name, website);
      }

      // Check if investor record already exists under this firm
      // Split name into first/last (best-effort)
      const parts = name.split(/\s+/);
      const firstName = parts[0] || name;
      const lastName  = parts.slice(1).join(" ") || "";

      const newInvestor: Record<string, any> = {
        id:           randomUUID(),
        firm_id:      firmId,
        first_name:   firstName,
        last_name:    lastName,
        full_name:    name,
        title:        "Angel Investor",
        bio:          angel["Investment thesis"]?.trim().slice(0, 2000) || null,
        website_url:  website?.startsWith("http") ? website : null,
        data_source:  "openvc-angels",
        import_record_id: norm(name),
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      };
      for (const k of Object.keys(newInvestor)) { if (newInvestor[k] === null || newInvestor[k] === "") delete newInvestor[k]; }

      const invId = await sbInsert("firm_investors", newInvestor);
      if (invId) {
        inserted++;
        console.log(`  ✚ ${name} (angel → Solo GP + investor record)`);
      }
    }
    console.log(`\n  Angels inserted: ${inserted}/${openvcAngels.length}\n`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — Patch existing investors
  // ══════════════════════════════════════════════════════════════════════════
  if (DO_INVESTORS) {
    console.log("── Phase 3: Patch existing investors ────────────────────────\n");

    type InvRow = Record<string, any>;
    const investors = await sbGet<InvRow>("firm_investors", "*", "&deleted_at=is.null");

    const invIdx = buildIndex(investorCsv, "Investor Name");
    let patched = 0;

    for (const inv of investors) {
      const fullName = [inv.first_name, inv.last_name].filter(Boolean).join(" ") || inv.full_name || "";
      const row    = lookup(invIdx,      fullName);
      const ang    = lookup(angIdx,      fullName);
      const xlsInv = lookup(xlsInvIdx,  fullName);
      const mer    = lookup(mercuryIdx,  fullName);
      const ppl    = lookup(peopleInvIdx, fullName);
      if (!row && !ang && !xlsInv && !mer && !ppl) continue;

      const patch: Record<string, any> = {};

      if (row) {
        if (!inv.title        && row["Title"])                              patch.title        = row["Title"].trim();
        if (!inv.bio          && (row["Bio"]||"").length > 20)             patch.bio          = row["Bio"].trim();
        if (!inv.email        && (row["Email"]||"").includes("@"))         patch.email        = row["Email"].trim();
        if (!inv.linkedin_url && (row["LinkedIn"]||"").includes("linkedin")) patch.linkedin_url = row["LinkedIn"].trim();
        if (!inv.x_url        && ((row["X / Twitter"]||"").includes("twitter") || (row["X / Twitter"]||"").includes("x.com")))
                                                                           patch.x_url        = row["X / Twitter"].trim();
        if (!inv.city && row["Geography"]) {
          const geo = parseHq(row["Geography"].split(",")[0]);
          if (geo.hq_city)    patch.city    = geo.hq_city;
          if (geo.hq_state)   patch.state   = geo.hq_state;
          if (geo.hq_country) patch.country = geo.hq_country;
        }
      }

      if (ang) {
        if (!inv.bio && !patch.bio && (ang["Investment thesis"]||"").length > 20)
          patch.bio = ang["Investment thesis"].trim();
        if (!inv.city && !patch.city && ang["Address"]) {
          const geo = parseHq(ang["Address"]);
          if (geo.hq_city)    patch.city    = geo.hq_city;
          if (geo.hq_state)   patch.state   = geo.hq_state;
          if (geo.hq_country) patch.country = geo.hq_country;
        }
      }

      // Investment Firm Sample Export: contact-level fields
      if (xlsInv) {
        if (!inv.title  && !patch.title  && xlsInv["Contact Title"])             patch.title  = xlsInv["Contact Title"].trim();
        if (!inv.email  && !patch.email  && (xlsInv["Contact E-Mail"]||"").includes("@")) patch.email = xlsInv["Contact E-Mail"].trim();
      }

      // People CRM (people.csv / people2.csv) — individual investor fields
      if (ppl) {
        if (!inv.title  && !patch.title  && ppl["jobTitle"])                             patch.title        = ppl["jobTitle"].trim();
        if (!inv.email  && !patch.email  && (ppl["favoriteEmail"]||"").includes("@"))   patch.email        = ppl["favoriteEmail"].trim();
        if (!inv.linkedin_url && !patch.linkedin_url && (ppl["LinkedIn Link"]||"").includes("linkedin"))
          patch.linkedin_url = ppl["LinkedIn Link"].trim();
        if (!inv.x_url && !patch.x_url && ((ppl["Twitter Link"]||"").includes("twitter") || (ppl["Twitter Link"]||"").includes("x.com")))
          patch.x_url = ppl["Twitter Link"].trim();
        if (!inv.city && !patch.city && ppl["Location"]) {
          const geo = parseHq(ppl["Location"]);
          if (geo.hq_city)    patch.city    = geo.hq_city;
          if (geo.hq_state)   patch.state   = geo.hq_state;
          if (geo.hq_country) patch.country = geo.hq_country;
        }
      }

      // Mercury investor database
      if (mer) {
        if (!inv.title  && !patch.title  && mer["role"])            patch.title = mer["role"].trim();
        const merStages = parseStages(mer["stages"] || "");
        if (!inv.stage_focus?.length  && !patch.stage_focus  && merStages.length) patch.stage_focus = merStages;
        const merSectors = (mer["industries"] || "").split(";").map((s: string) => s.trim()).filter(Boolean);
        if (!inv.sector_focus?.length && !patch.sector_focus && merSectors.length) patch.sector_focus = merSectors;
        if (!inv.city && !patch.city && mer["location"]) {
          const geo = parseHq(mer["location"]);
          if (geo.hq_city)    patch.city    = geo.hq_city;
          if (geo.hq_state)   patch.state   = geo.hq_state;
          if (geo.hq_country) patch.country = geo.hq_country;
        }
      }

      if (Object.keys(patch).length) {
        const ok = await sbPatch("firm_investors", inv.id, patch);
        if (ok) { patched++; console.log(`  ✓ ${fullName} — ${Object.keys(patch).join(", ")}`); }
      }
    }
    console.log(`\n  Investors patched: ${patched}/${investors.length}\n`);
  }

  // Flush all collected aliases back to firm_records.aliases[]
  await flushAliases();

  console.log("═".repeat(64));
  console.log("  Done.");
  console.log("═".repeat(64) + "\n");
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
