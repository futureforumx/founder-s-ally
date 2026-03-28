/**
 * Import funds from FreeStartupFunding’s public JSON API into VCFirm + VCFund.
 *
 * The old path `/api/funds?stage=seed` is not available (404). Use `/api/vc-funds` instead,
 * e.g. `?stage=seed&limit=5000` (see response `filters` for supported query params).
 *
 *   npm run db:seed:fsfunds
 *
 * Env:
 *   FSFUNDS_API_URL   — default https://freestartupfunding.com/api/vc-funds
 *   FSFUNDS_QUERY     — default limit=5000 (e.g. stage=seed&sector=ai&limit=500)
 *   FSFUNDS_JSON      — optional path to saved JSON (`{ "data": [...] }` or a bare array)
 *   FSFUNDS_MAX       — optional cap on rows processed (dev)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  PrismaClient,
  type FirmType,
  type FundStatus,
  type SectorFocus,
  type SourceType,
  type StageFocus,
} from "@prisma/client";

const DEFAULT_API = "https://freestartupfunding.com/api/vc-funds";
const DEFAULT_QUERY = "limit=5000";

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

type FsfFundRow = {
  id?: number;
  fund_name?: string;
  fund_size_usd?: number | string;
  fund_vintage_year?: string | number | null;
  fund_status?: string;
  source_url?: string;
  linkedin_url?: string;
  crunchbase_url?: string;
  phone?: string;
  email?: string;
  address_city?: string;
  address_state?: string;
  address_country?: string;
  geographic_focus?: string[];
  fund_thesis?: string;
  target_stages?: string[];
  target_sectors?: string[];
  check_size_min?: number | string;
  check_size_max?: number | string;
  deployment_status?: string;
};

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "firm";
}

/** Strip common fund suffixes so multiple vehicles map to one firm. */
function deriveFirmName(fundName: string): string {
  let s = fundName.trim();
  s = s.replace(/,\s*(LP|L\.P\.|LLC|Ltd\.?|SCSP)\s*$/i, "");
  s = s.replace(/\s+([IVX]{1,4})\s*$/i, "");
  return s.trim() || fundName.trim();
}

function normalizeHttpUrl(raw: string | undefined | null): string | null {
  const u = raw?.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u.replace(/^\/+/, "")}`;
}

function classifySocialUrl(raw: string | undefined | null): { x: string | null; crunchbase: string | null } {
  const u = normalizeHttpUrl(raw ?? "");
  if (!u) return { x: null, crunchbase: null };
  const low = u.toLowerCase();
  if (low.includes("twitter.com") || low.includes("x.com")) return { x: u, crunchbase: null };
  if (low.includes("crunchbase.com")) return { x: null, crunchbase: u };
  return { x: null, crunchbase: null };
}

const STAGE_MAP: Record<string, StageFocus> = {
  "pre-seed": "PRE_SEED",
  preseed: "PRE_SEED",
  seed: "SEED",
  "series a": "SERIES_A",
  "series b": "SERIES_B",
  "series c": "SERIES_C",
  growth: "GROWTH",
  late: "LATE",
  ipo: "IPO",
};

const SECTOR_MAP: Record<string, SectorFocus> = {
  ai: "AI",
  "ai/ml": "AI",
  fintech: "FINTECH",
  saas: "ENTERPRISE_SAAS",
  enterprise: "ENTERPRISE_SAAS",
  healthcare: "HEALTHTECH",
  health: "HEALTHTECH",
  biotech: "BIOTECH",
  consumer: "CONSUMER",
  climate: "CLIMATE",
  mobility: "MOBILITY",
  industrial: "INDUSTRIAL",
  cybersecurity: "CYBERSECURITY",
  security: "CYBERSECURITY",
  media: "MEDIA",
  web3: "WEB3",
  edtech: "EDTECH",
  govtech: "GOVTECH",
  hardware: "HARDWARE",
  robotics: "ROBOTICS",
  marketplace: "MARKETPLACE",
  agritech: "AGRITECH",
  proptech: "PROPTECH",
};

function mapStages(labels: string[] | undefined): StageFocus[] {
  if (!labels?.length) return [];
  const out = new Set<StageFocus>();
  for (const raw of labels) {
    const k = raw.toLowerCase().replace(/\s+/g, " ").trim();
    out.add(STAGE_MAP[k] ?? "SEED");
  }
  return [...out];
}

function mapSectors(labels: string[] | undefined): SectorFocus[] {
  if (!labels?.length) return [];
  const out = new Set<SectorFocus>();
  for (const raw of labels) {
    const k = raw.toLowerCase().replace(/\s+/g, " ").trim();
    out.add(SECTOR_MAP[k] ?? "OTHER");
  }
  return [...out];
}

function parseUsd(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseVintage(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && v >= 1900 && v <= 2100) return Math.floor(v);
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function mapFundStatus(raw: string | undefined): FundStatus {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("wind") || s.includes("close")) return "CLOSED";
  if (s.includes("form") || s.includes("start") || s.includes("just")) return "FORMING";
  return "ACTIVE";
}

function parseHq(row: FsfFundRow): { city: string | null; state: string | null; country: string | null } {
  const cityRaw = row.address_city?.trim();
  const stateRaw = row.address_state?.trim();
  const country = row.address_country?.trim() || null;
  if (!cityRaw) return { city: null, state: stateRaw || null, country };
  if (cityRaw.includes(",")) {
    const parts = cityRaw.split(",").map((p) => p.trim());
    if (parts.length >= 2) {
      return { city: parts[0] || null, state: parts[1] || stateRaw || null, country };
    }
  }
  return { city: cityRaw, state: stateRaw || null, country };
}

function parseCheckUsd(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (!t || t === "contact for details") return null;
  const m = t.match(/\$?\s*([\d.]+)\s*([kmb])?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const suf = (m[2] ?? "").toLowerCase();
  if (suf === "k") n *= 1e3;
  if (suf === "m") n *= 1e6;
  if (suf === "b") n *= 1e9;
  return n > 0 ? n : null;
}

async function loadRows(): Promise<FsfFundRow[]> {
  const jsonPath = process.env.FSFUNDS_JSON?.trim();
  if (jsonPath) {
    const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as { data?: FsfFundRow[] } | FsfFundRow[];
    const arr = Array.isArray(parsed) ? parsed : parsed.data;
    if (!Array.isArray(arr)) throw new Error("FSFUNDS_JSON must be an array or { data: array }");
    return arr;
  }

  const base = (process.env.FSFUNDS_API_URL ?? DEFAULT_API).replace(/\/$/, "");
  const q = process.env.FSFUNDS_QUERY ?? DEFAULT_QUERY;
  const url = q ? `${base}?${q}` : base;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`FSF API ${res.status}: ${url}`);
  const body = (await res.json()) as { success?: boolean; data?: FsfFundRow[] };
  if (!Array.isArray(body.data)) throw new Error("Unexpected API shape: missing data[]");
  return body.data;
}

async function main() {
  loadDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (use .env / .env.local).");
  }

  const rows = await loadRows();
  const maxRaw = process.env.FSFUNDS_MAX;
  const max = maxRaw ? parseInt(maxRaw, 10) : undefined;
  const slice = Number.isFinite(max) && max! > 0 ? rows.slice(0, max) : rows;

  const prisma = new PrismaClient();
  const sourceType: SourceType = "OTHER";
  const firmType: FirmType = "VC";

  let nFund = 0;

  for (const row of slice) {
    const fundName = row.fund_name?.trim();
    if (!fundName) continue;

    const firmName = deriveFirmName(fundName);
    const slug = slugify(firmName);

    const website = normalizeHttpUrl(row.source_url);
    const linkedin = normalizeHttpUrl(row.linkedin_url);
    const { x: xFromCb, crunchbase } = classifySocialUrl(row.crunchbase_url);
    const hq = parseHq(row);

    const firm = await prisma.vCFirm.upsert({
      where: { slug },
      create: {
        firm_name: firmName,
        slug,
        firm_type: firmType,
        website_url: website,
        linkedin_url: linkedin,
        x_url: xFromCb,
        crunchbase_url: crunchbase,
        email: row.email?.trim() || undefined,
        phone: row.phone?.trim() || undefined,
        hq_city: hq.city,
        hq_state: hq.state,
        hq_country: hq.country,
        status: "Active",
      },
      update: {
        firm_name: firmName,
        website_url: website ?? undefined,
        linkedin_url: linkedin ?? undefined,
        x_url: xFromCb ?? undefined,
        crunchbase_url: crunchbase ?? undefined,
        email: row.email?.trim() || undefined,
        phone: row.phone?.trim() || undefined,
        hq_city: hq.city ?? undefined,
        hq_state: hq.state ?? undefined,
        hq_country: hq.country ?? undefined,
        status: "Active",
      },
    });

    const sizeUsd = parseUsd(row.fund_size_usd);
    const vintage = parseVintage(row.fund_vintage_year);
    const stages = mapStages(row.target_stages);
    const sectors = mapSectors(row.target_sectors);
    const geo = row.geographic_focus?.filter(Boolean) ?? [];
    const minCheck = parseCheckUsd(row.check_size_min);
    const maxCheck = parseCheckUsd(row.check_size_max);

    const fundPayload = {
      fund_name: fundName,
      vintage_year: vintage,
      fund_status: mapFundStatus(row.fund_status),
      size_usd: sizeUsd,
      thesis_description: row.fund_thesis?.trim() || null,
      stage_focus: stages.length ? stages : [],
      sector_focus: sectors.length ? sectors : [],
      geography_focus: geo,
      avg_check_size_min: minCheck,
      avg_check_size_max: maxCheck ?? minCheck,
      focus_summary: row.deployment_status?.trim() || null,
    };

    const existing = await prisma.vCFund.findFirst({
      where: { firm_id: firm.id, fund_name: fundName, deleted_at: null },
    });

    if (existing) {
      await prisma.vCFund.update({
        where: { id: existing.id },
        data: fundPayload,
      });
    } else {
      await prisma.vCFund.create({
        data: {
          firm_id: firm.id,
          ...fundPayload,
        },
      });
    }
    nFund += 1;

    if (website) {
      const label = "FreeStartupFunding: vc-funds API";
      const hit = await prisma.vCSourceLink.findFirst({
        where: { firm_id: firm.id, url: website, deleted_at: null },
      });
      if (!hit) {
        await prisma.vCSourceLink.create({
          data: {
            firm_id: firm.id,
            source_type: sourceType,
            label,
            url: website,
            last_verified_at: new Date(),
          },
        });
      }
    }
  }

  console.log(`FreeStartupFunding seed: ${nFund} funds upserted from ${slice.length} API rows.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
