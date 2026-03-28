/**
 * Fetch public VC Sheet investor rows from https://www.vcsheet.com/investors and optionally
 * upsert VCFirm + VCPerson (+ VCSourceLink).
 *
 * The listing page is Webflow with ~100 investors in the initial HTML (data attributes + /who/ links).
 * Additional names may load in the browser only; there is no documented public API in this repo.
 * Use only in compliance with VC Sheet’s terms and robots policy.
 *
 *   VCSHEET_FETCH_ONLY=1 npm run db:seed:vcsheet   → write JSON only (no DATABASE_URL)
 *   npm run db:seed:vcsheet                         → fetch + Prisma upsert
 *   VCSHEET_JSON_PATH=./data/vcsheet/investors.json npm run db:seed:vcsheet  → import from file
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  PrismaClient,
  type FirmType,
  type SectorFocus,
  type SourceType,
  type StageFocus,
} from "@prisma/client";

const VCSHEET_LIST_URL = "https://www.vcsheet.com/investors";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type VcsheetInvestorRow = {
  slug: string;
  profile_url: string;
  display_name: string;
  title: string | null;
  firm_names_raw: string | null;
  check_sizes_raw: string | null;
  stages_raw: string | null;
  sectors_raw: string | null;
  geography_raw: string | null;
  /** ISO-ish fetch time */
  fetched_at: string;
};

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
  return s
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "firm";
}

function splitName(full: string): { first: string; last: string } {
  const p = full.trim().split(/\s+/);
  if (p.length === 0) return { first: "Unknown", last: "Investor" };
  if (p.length === 1) return { first: p[0], last: "" };
  return { first: p[0], last: p.slice(1).join(" ") };
}

const SECTOR_MAP: Record<string, SectorFocus> = {
  fintech: "FINTECH",
  "enterprise saas": "ENTERPRISE_SAAS",
  saas: "ENTERPRISE_SAAS",
  devtools: "ENTERPRISE_SAAS",
  ai: "AI",
  "ai/ml": "AI",
  consumer: "CONSUMER",
  biotech: "BIOTECH",
  climate: "CLIMATE",
  energy: "CLIMATE",
  cybersecurity: "CYBERSECURITY",
  security: "CYBERSECURITY",
  hardware: "HARDWARE",
  "deeptech / hardware": "HARDWARE",
  deeptech: "HARDWARE",
  robotics: "ROBOTICS",
  chips: "HARDWARE",
  materials: "INDUSTRIAL",
  transportation: "MOBILITY",
  mobility: "MOBILITY",
  marketplace: "MARKETPLACE",
  web3: "WEB3",
  govtech: "GOVTECH",
  edtech: "EDTECH",
  media: "MEDIA",
  industrial: "INDUSTRIAL",
  proptech: "PROPTECH",
  agritech: "AGRITECH",
};

const STAGE_MAP: Record<string, StageFocus> = {
  "pre-seed": "PRE_SEED",
  preseed: "PRE_SEED",
  seed: "SEED",
  "series a": "SERIES_A",
  "series b": "SERIES_B",
  "series c": "SERIES_C",
  growth: "GROWTH",
};

function mapSectors(csv: string | null): SectorFocus[] {
  if (!csv?.trim()) return [];
  const out = new Set<SectorFocus>();
  for (const raw of csv.split(",")) {
    const k = raw.toLowerCase().replace(/\s+/g, " ").trim();
    out.add(SECTOR_MAP[k] ?? "OTHER");
  }
  return [...out];
}

function mapStages(csv: string | null): StageFocus[] {
  if (!csv?.trim()) return [];
  const out = new Set<StageFocus>();
  for (const raw of csv.split(",")) {
    const k = raw.toLowerCase().replace(/\s+/g, " ").trim();
    out.add(STAGE_MAP[k] ?? "SEED");
  }
  return [...out];
}

/** Parse strings like "$250K-$1M" or "$100K - $500K" → USD amounts */
function parseCheckBounds(raw: string | null): { min?: number; max?: number } {
  if (!raw?.trim()) return {};
  const norm = raw.replace(/\s+/g, "");
  const pair = norm.match(/\$([0-9.]+)([KMkm]?)-\$([0-9.]+)([KMkm]?)/);
  if (!pair) return {};
  const mult = (u: string) => (u.toUpperCase() === "M" ? 1e6 : u.toUpperCase() === "K" ? 1e3 : 1);
  const a = parseFloat(pair[1]) * mult(pair[2] || "K");
  const b = parseFloat(pair[3]) * mult(pair[4] || "K");
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

function extractInnerTexts(html: string): string[] {
  return [...html.matchAll(/>([^<]{1,200})</g)]
    .map((m) => m[1].trim())
    .filter((t) => t.length > 0 && !t.startsWith("http") && !/^[\d$]+$/.test(t));
}

function parseTitleAndFirms(cell: string | null): { title: string | null; firms: string | null } {
  if (!cell?.trim()) return { title: null, firms: null };
  const idx = cell.indexOf(",");
  if (idx === -1) return { title: cell.trim(), firms: null };
  return {
    title: cell.slice(0, idx).trim() || null,
    firms: cell.slice(idx + 1).trim() || null,
  };
}

function primaryFirmName(firms: string | null): string {
  if (!firms?.trim()) return "Unknown firm";
  const first = firms.split(",")[0]?.trim();
  return first || "Unknown firm";
}

export function parseVcsheetInvestorsHtml(html: string, fetchedAt = new Date().toISOString()): VcsheetInvestorRow[] {
  const chunks = html.split('<div data-check="').slice(1);
  const out: VcsheetInvestorRow[] = [];

  for (const ch of chunks) {
    const head = ch.match(
      /^([^"]*)" data-filter-item="" data-stage="([^"]*)" data-sector="([^"]*)" data-geography="([^"]*)" role="listitem" class="data-list-item w-dyn-item">([\s\S]*)/,
    );
    if (!head) continue;

    const [, dataCheck, dataStage, dataSector, dataGeo, bodyWithTail] = head;
    const next = bodyWithTail.indexOf('<div data-check="');
    const inner = next === -1 ? bodyWithTail : bodyWithTail.slice(0, next);
    if (!inner.includes('href="/who/')) continue;

    const who = inner.match(/href="\/who\/([^"]+)"/);
    if (!who) continue;
    const slug = who[1];
    const texts = extractInnerTexts(inner);
    const pi = texts.indexOf("Profile");
    const displayName = pi >= 0 && texts[pi + 1] ? texts[pi + 1] : null;
    const titleCell = pi >= 0 && texts[pi + 2] ? texts[pi + 2] : null;
    if (!displayName) continue;

    const { title, firms } = parseTitleAndFirms(titleCell);

    out.push({
      slug,
      profile_url: `https://www.vcsheet.com/who/${slug}`,
      display_name: displayName,
      title,
      firm_names_raw: firms,
      check_sizes_raw: dataCheck || null,
      stages_raw: dataStage || null,
      sectors_raw: dataSector || null,
      geography_raw: dataGeo || null,
      fetched_at: fetchedAt,
    });
  }

  return out;
}

async function fetchListHtml(): Promise<string> {
  const res = await fetch(VCSHEET_LIST_URL, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`VCSheet list ${res.status}: ${text.slice(0, 400)}`);
  return text;
}

function loadJsonRows(): VcsheetInvestorRow[] {
  const path = process.env.VCSHEET_JSON_PATH?.trim();
  if (!path) throw new Error("VCSHEET_JSON_PATH is required when VCSHEET_OFFLINE=1");
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (Array.isArray(raw)) return raw as VcsheetInvestorRow[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { investors?: unknown }).investors)) {
    return (raw as { investors: VcsheetInvestorRow[] }).investors;
  }
  throw new Error("JSON must be an array or { investors: [...] }");
}

async function loadRows(): Promise<VcsheetInvestorRow[]> {
  if (process.env.VCSHEET_OFFLINE === "1") return loadJsonRows();
  const html = await fetchListHtml();
  return parseVcsheetInvestorsHtml(html);
}

async function main() {
  const fetchOnly = process.env.VCSHEET_FETCH_ONLY === "1";
  const saveJson = process.env.VCSHEET_SAVE_JSON === "1" || fetchOnly;
  const defaultJsonPath = join(process.cwd(), "data", "vcsheet", "investors.json");
  const jsonOut = process.env.VCSHEET_JSON_OUT?.trim() || defaultJsonPath;

  const rows = await loadRows();
  console.log(`VCSheet: loaded ${rows.length} investor rows.`);

  if (saveJson) {
    mkdirSync(join(process.cwd(), "data", "vcsheet"), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify({ source: VCSHEET_LIST_URL, investors: rows }, null, 2), "utf8");
    console.log(`Wrote ${jsonOut}`);
  }

  if (fetchOnly) return;

  loadDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (or symlink .env). Use VCSHEET_FETCH_ONLY=1 to only save JSON.");
  }

  const prisma = new PrismaClient();
  const defaultFirmType = (process.env.VCSHEET_DEFAULT_FIRM_TYPE as FirmType) || "VC";
  const sourceType = "VCSHEET" as SourceType;
  let people = 0;

  for (const row of rows) {
    const firmName = primaryFirmName(row.firm_names_raw);
    const firmSlug = slugify(firmName);

    const sectorFocus = mapSectors(row.sectors_raw);
    const stageFocus = mapStages(row.stages_raw);
    const checks = parseCheckBounds(row.check_sizes_raw);

    const firm = await prisma.vCFirm.upsert({
      where: { slug: firmSlug },
      create: {
        firm_name: firmName,
        slug: firmSlug,
        firm_type: defaultFirmType,
        description: [
          row.sectors_raw && `Sectors: ${row.sectors_raw}`,
          row.stages_raw && `Stages: ${row.stages_raw}`,
          row.check_sizes_raw && `Check: ${row.check_sizes_raw}`,
          row.geography_raw && row.geography_raw !== "Unknown" && `Geo: ${row.geography_raw}`,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      },
      update: {
        firm_name: firmName,
        description: [
          row.sectors_raw && `Sectors: ${row.sectors_raw}`,
          row.stages_raw && `Stages: ${row.stages_raw}`,
          row.check_sizes_raw && `Check: ${row.check_sizes_raw}`,
          row.geography_raw && row.geography_raw !== "Unknown" && `Geo: ${row.geography_raw}`,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      },
    });

    const profileUrl = row.profile_url;
    const existingLink = await prisma.vCSourceLink.findFirst({
      where: { firm_id: firm.id, source_type: sourceType, url: profileUrl, deleted_at: null },
    });
    if (!existingLink) {
      await prisma.vCSourceLink.create({
        data: {
          firm_id: firm.id,
          source_type: sourceType,
          label: `VC Sheet — ${row.display_name}`,
          url: profileUrl,
          last_verified_at: new Date(),
        },
      });
    }

    const { first, last } = splitName(row.display_name);
    const hq =
      row.geography_raw && row.geography_raw !== "Unknown" ? row.geography_raw.trim() : null;

    const existingPerson = await prisma.vCPerson.findFirst({
      where: {
        firm_id: firm.id,
        deleted_at: null,
        first_name: first,
        last_name: last || "-",
      },
    });

    const pData = {
      title: row.title,
      website_url: profileUrl,
      country: hq,
      sector_focus: sectorFocus.length ? sectorFocus : undefined,
      stage_focus: stageFocus.length ? stageFocus : undefined,
      check_size_min: checks.min,
      check_size_max: checks.max,
      background_summary: row.firm_names_raw && row.firm_names_raw.includes(",")
        ? `Affiliations: ${row.firm_names_raw}`
        : null,
    };

    if (existingPerson) {
      await prisma.vCPerson.update({ where: { id: existingPerson.id }, data: pData });
    } else {
      await prisma.vCPerson.create({
        data: {
          firm_id: firm.id,
          first_name: first,
          last_name: last || "-",
          ...pData,
        },
      });
    }
    people += 1;
  }

  console.log(`VCSheet import: ${rows.length} rows → firms/people updated (${people} people touched).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
