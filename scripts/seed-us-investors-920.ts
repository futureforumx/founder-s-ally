/**
 * Ingest Founder’s Ally deduped US investor CSV (920 firm rows) → VCFirm + one VCPerson per row.
 *
 * Source: https://github.com/futureforumx/founder-s-ally/raw/main/us_investor_single_deduped_enriched_920.csv
 *
 *   npm run db:seed:us-investors
 *   US_INVESTORS_920_CSV=./data/us-investors-920.csv npm run db:seed:us-investors
 *   US_INVESTORS_920_FETCH=1 npm run db:seed:us-investors   # download CSV if missing
 *
 * Post-import enrichment (manual / other jobs): email verify, LinkedIn title refresh, Crunchbase, etc.
 */

import { createReadStream, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import csv from "csv-parser";
import { PrismaClient, type FirmType, type StageFocus, type SectorFocus } from "@prisma/client";

const SOURCE = "us-investors-920" as const;
const DEFAULT_CSV_URL =
  "https://github.com/futureforumx/founder-s-ally/raw/main/us_investor_single_deduped_enriched_920.csv";

const prisma = new PrismaClient();

type CsvRow = Record<string, string>;

function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  const root = process.cwd();
  for (const name of [".env", ".env.local"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^DATABASE_URL=(.*)$/);
      if (!m) continue;
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env.DATABASE_URL = v;
      return;
    }
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[''"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "firm"
  );
}

function uniqueSlug(baseName: string, recordId: string, used: Set<string>): string {
  let s = slugify(baseName);
  if (!used.has(s)) {
    used.add(s);
    return s;
  }
  const tail = recordId.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(-24) || "id";
  let i = 0;
  let candidate = `${s}-${tail}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${s}-${tail}-${i}`;
  }
  used.add(candidate);
  return candidate.slice(0, 80);
}

function normalizeWebsite(raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

function normalizeLinkedIn(raw: string | undefined): string | null {
  const u = normalizeWebsite(raw);
  if (!u) return null;
  if (/linkedin\.com/i.test(u)) return u;
  return null;
}

function parseFloatSafe(s: string | undefined): number | null {
  if (!s?.trim()) return null;
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseFoundedYear(row: CsvRow): number | null {
  const a = row.date_founded_enriched?.trim() || row.date_founded?.trim();
  if (!a) return null;
  const m = a.match(/(\d{4})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return Number.isFinite(y) && y > 1800 && y < 2100 ? y : null;
}

function parseHeadcount(row: CsvRow): number | null {
  const h = parseFloatSafe(row.headcount_enriched) ?? parseFloatSafe(row.headcount);
  if (h == null || h < 0) return null;
  return Math.round(h);
}

function parseTotalAumUsd(row: CsvRow): number | null {
  return parseFloatSafe(row.total_aum_usd);
}

function parseHq(row: CsvRow): { city?: string; state?: string; country?: string } {
  const raw = row.hq_location_address?.trim();
  if (!raw) return {};
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return { city: parts[0], state: parts[1], country: parts.slice(2).join(", ") };
  }
  if (parts.length === 2) {
    return { city: parts[0], state: parts[1], country: row.geography_scope?.includes("U.S") ? "US" : undefined };
  }
  return { city: parts[0] };
}

function splitName(full: string): { first: string; last: string } {
  const p = full.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return { first: "Investment", last: "Team" };
  if (p.length === 1) return { first: p[0], last: "-" };
  return { first: p[0], last: p.slice(1).join(" ") };
}

function firstListItem(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .find(Boolean) ?? "";
}

function representativeName(row: CsvRow): string {
  const pc = row.primary_contact_name?.trim();
  if (pc) return pc;
  const inv = firstListItem(row.investor_names_all);
  return inv;
}

function representativeTitle(row: CsvRow): string | null {
  const t = row.primary_contact_title?.trim() || firstListItem(row.investor_titles_all);
  return t || null;
}

function representativeEmail(row: CsvRow): string | null {
  const a =
    row.primary_contact_email?.trim() ||
    row.Email?.trim() ||
    row.firm_email?.trim() ||
    firstListItem(row.investor_email_addresses_all);
  return a || null;
}

function representativeLinkedIn(row: CsvRow): string | null {
  return (
    normalizeLinkedIn(row.primary_contact_linkedin_profile_link) ||
    normalizeLinkedIn(row.LinkedIn) ||
    normalizeLinkedIn(firstListItem(row.investor_linkedin_profile_links_all))
  );
}

function representativeX(row: CsvRow): string | null {
  return (
    normalizeWebsite(row.primary_contact_x_profile_link) ||
    normalizeWebsite(row.X) ||
    normalizeWebsite(firstListItem(row.investor_x_profile_links_all))
  );
}

function representativeLocation(row: CsvRow): string | null {
  return row.primary_contact_location?.trim() || row.hq_location_address?.trim() || null;
}

function mapFirmType(normalized: string | undefined): FirmType {
  const raw = (normalized || "").trim();
  if (!raw) return "OTHER";
  const u = raw.toUpperCase();
  const allowed: FirmType[] = [
    "VC",
    "CVC",
    "ANGEL_NETWORK",
    "MICRO_FUND",
    "MICRO_VC",
    "FAMILY_OFFICE",
    "PE",
    "ACCELERATOR",
    "OTHER",
    "INSTITUTIONAL",
    "SOLO_GP",
    "PUBLIC",
    "VENTURE_STUDIO",
  ];
  if (allowed.includes(u as FirmType)) return u as FirmType;
  const l = raw.toLowerCase();
  if (l.includes("venture studio")) return "VENTURE_STUDIO";
  if (l.includes("solo gp") || /\bsolo\b/.test(l)) return "SOLO_GP";
  if (l.includes("micro vc") || l.includes("micro-vc")) return "MICRO_VC";
  if (l.includes("institutional")) return "INSTITUTIONAL";
  if (l.includes("public")) return "PUBLIC";
  return "OTHER";
}

function parseStages(raw: string | undefined): StageFocus[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(/[,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out = new Set<StageFocus>();
  for (const p of parts) {
    if (p.includes("pre-seed") || p.includes("pre seed")) out.add("PRE_SEED");
    else if (p === "seed" || p.startsWith("seed")) out.add("SEED");
    else if (p.includes("series a")) out.add("SERIES_A");
    else if (p.includes("series b+") || p.includes("series b")) out.add("SERIES_B");
    else if (p.includes("series c") || p.includes("growth") || p.includes("late")) out.add("GROWTH");
  }
  return [...out];
}

function mapSectorToken(p: string): SectorFocus | null {
  const s = p.toLowerCase();
  const rules: [RegExp, SectorFocus][] = [
    [/fintech|payments|banking|lending/, "FINTECH"],
    [/b2b\s*saas|enterprise\s*saas|saas|business software|b2b software/, "ENTERPRISE_SAAS"],
    [/\bai\b|machine learning|ml\b|generative|data infra/, "AI"],
    [/biotech|life science/, "BIOTECH"],
    [/health|digital health|medtech|healthcare/, "HEALTHTECH"],
    [/consumer|d2c|brand|commerce|e-?commerce|retail/, "CONSUMER"],
    [/climate|cleantech|energy transition|carbon/, "CLIMATE"],
    [/mobility|transport|automotive|aerospace/, "MOBILITY"],
    [/industrial|manufacturing|construction|contech/, "INDUSTRIAL"],
    [/cyber|security|infosec/, "CYBERSECURITY"],
    [/media|content|gaming|entertainment/, "MEDIA"],
    [/web3|crypto|blockchain|defi/, "WEB3"],
    [/edtech|education/, "EDTECH"],
    [/gov|government|defense tech|defense/, "GOVTECH"],
    [/robotics/, "ROBOTICS"],
    [/hardware|iot/, "HARDWARE"],
    [/marketplace|platform/, "MARKETPLACE"],
    [/agri|food tech|farm/, "AGRITECH"],
    [/proptech|real estate|property/, "PROPTECH"],
  ];
  for (const [re, tag] of rules) {
    if (re.test(s)) return tag;
  }
  return null;
}

function parseSectors(raw: string | undefined): SectorFocus[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
  const out = new Set<SectorFocus>();
  for (const p of parts) {
    const m = mapSectorToken(p);
    if (m) out.add(m);
  }
  if (out.size === 0) out.add("OTHER");
  return [...out];
}

function parsePartnerNames(row: CsvRow): string[] {
  const raw = row.gp_names_from_firm_sheet?.trim();
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

function checkSizes(row: CsvRow): { min?: number; max?: number } {
  const est = parseFloatSafe(row.average_check_size_estimate_usd);
  if (est != null && est > 0) return { min: est, max: est };
  return {};
}

function buildFirmDescription(row: CsvRow, aumUsd: number | null): string | null {
  const chunks: string[] = [];
  if (row.description?.trim()) chunks.push(row.description.trim());
  const bits = [
    row.check_size_range_enriched && `Check (enriched): ${row.check_size_range_enriched}`,
    row.geography_scope && `Geography: ${row.geography_scope}`,
    row.geography_focus && `Geo focus: ${row.geography_focus}`,
    row.organization_type && `Org type: ${row.organization_type}`,
    aumUsd != null && aumUsd > 0 && `Total AUM (USD est.): ${Math.round(aumUsd)}`,
  ].filter(Boolean) as string[];
  if (bits.length) chunks.push(bits.join(" · "));
  const text = chunks.join("\n\n");
  return text || null;
}

async function fetchCsvIfNeeded(csvPath: string): Promise<void> {
  if (existsSync(csvPath)) return;
  if (process.env.US_INVESTORS_920_FETCH !== "1") {
    throw new Error(
      `Missing ${csvPath}. Run: curl -o ${csvPath} "${DEFAULT_CSV_URL}" or US_INVESTORS_920_FETCH=1 npm run db:seed:us-investors`,
    );
  }
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  const url = process.env.US_INVESTORS_920_URL || DEFAULT_CSV_URL;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  writeFileSync(csvPath, Buffer.from(await res.arrayBuffer()));
  console.log(`Downloaded CSV → ${csvPath}`);
}

function readAllRows(csvPath: string): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CsvRow[] = [];
    createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row: CsvRow) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

async function seedUSInvestors() {
  loadDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (use .env / .env.local).");
  }

  const csvPath = process.env.US_INVESTORS_920_CSV || join(process.cwd(), "data", "us-investors-920.csv");
  await fetchCsvIfNeeded(csvPath);

  const investors = await readAllRows(csvPath);
  if (investors.length === 0) throw new Error("CSV has no data rows.");

  const usedSlugs = new Set<string>();
  let firms = 0;
  let people = 0;

  for (const row of investors) {
    const recordId = row.record_id?.trim();
    const firmName = row.firm_name?.trim();
    if (!recordId || !firmName) {
      console.warn("Skipping row without record_id or firm_name:", row);
      continue;
    }

    const slug = uniqueSlug(firmName, recordId, usedSlugs);
    const firmType = mapFirmType(row.type_normalized);
    const hq = parseHq(row);
    const aumUsd = parseTotalAumUsd(row);
    const description = buildFirmDescription(row, aumUsd);
    const partnerNames = parsePartnerNames(row);
    const stages = parseStages(row.stage_focus_normalized || row.stage_focus_raw);
    const sectors = parseSectors(row.sector_focus);
    const headcount = parseHeadcount(row);
    const foundedYear = parseFoundedYear(row);
    const { min: checkMin, max: checkMax } = checkSizes(row);

    const firm = await prisma.vCFirm.upsert({
      where: { slug },
      create: {
        firm_name: firmName,
        slug,
        firm_type: firmType,
        description,
        website_url: normalizeWebsite(row.website),
        email: row.firm_email?.trim() || null,
        x_url: normalizeWebsite(row.firm_x_profile_link) || normalizeWebsite(row.X),
        linkedin_url: normalizeLinkedIn(row.firm_linkedin_profile_link) || normalizeLinkedIn(row.LinkedIn),
        hq_city: hq.city ?? null,
        hq_state: hq.state ?? null,
        hq_country: hq.country ?? (row.geography_scope?.includes("U.S") ? "US" : null),
        partner_names: partnerNames,
        total_headcount: headcount,
        founded_year: foundedYear ?? undefined,
      },
      update: {
        firm_name: firmName,
        firm_type: firmType,
        description: description ?? undefined,
        website_url: normalizeWebsite(row.website) ?? undefined,
        email: row.firm_email?.trim() || undefined,
        x_url: normalizeWebsite(row.firm_x_profile_link) || normalizeWebsite(row.X) || undefined,
        linkedin_url:
          normalizeLinkedIn(row.firm_linkedin_profile_link) || normalizeLinkedIn(row.LinkedIn) || undefined,
        hq_city: hq.city ?? undefined,
        hq_state: hq.state ?? undefined,
        hq_country: hq.country ?? undefined,
        partner_names: partnerNames,
        total_headcount: headcount ?? undefined,
        founded_year: foundedYear ?? undefined,
      },
    });
    firms++;

    const repName = representativeName(row);
    const { first, last } = repName ? splitName(repName) : { first: "Investment", last: "Team" };
    const preferredName = repName ? null : firmName;

    await prisma.vCPerson.upsert({
      where: {
        data_source_import_record_id: {
          data_source: SOURCE,
          import_record_id: recordId,
        },
      },
      create: {
        firm_id: firm.id,
        first_name: first,
        last_name: last || "-",
        preferred_name: preferredName,
        title: representativeTitle(row),
        email: representativeEmail(row),
        linkedin_url: representativeLinkedIn(row),
        x_url: representativeX(row),
        city: representativeLocation(row)?.split(",")[0]?.trim() || hq.city || null,
        state: hq.state ?? null,
        country: hq.country ?? (row.geography_scope?.includes("U.S") ? "US" : null),
        stage_focus: stages,
        sector_focus: sectors,
        check_size_min: checkMin,
        check_size_max: checkMax,
        background_summary: row.description?.trim().slice(0, 4000) || null,
        data_source: SOURCE,
        import_record_id: recordId,
      },
      update: {
        first_name: first,
        last_name: last || "-",
        preferred_name: preferredName,
        title: representativeTitle(row),
        email: representativeEmail(row),
        linkedin_url: representativeLinkedIn(row) ?? undefined,
        x_url: representativeX(row) ?? undefined,
        city: representativeLocation(row)?.split(",")[0]?.trim() || hq.city || undefined,
        state: hq.state ?? undefined,
        country: hq.country ?? undefined,
        stage_focus: stages,
        sector_focus: sectors,
        check_size_min: checkMin,
        check_size_max: checkMax,
        background_summary: row.description?.trim().slice(0, 4000) || null,
      },
    });
    people++;
  }

  console.log(`✅ Upserted ${firms} VCFirm + ${people} VCPerson rows from ${investors.length} CSV rows (${SOURCE}).`);
}

seedUSInvestors()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
