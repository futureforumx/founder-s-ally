/**
 * Import OpenVC-shaped investor JSON into VCFirm + VCPerson.
 *
 * The npm package `openvc` is **unpublished** (npm 404). OpenVC’s website is behind Cloudflare,
 * so there is no supported server-to-server “free API” to call from this script.
 *
 * Workflow:
 * 1. Export or build a JSON file (see `data/openvc/investors.example.json`).
 * 2. Save as `data/openvc/investors.json` or set `OPENVC_JSON_PATH`.
 * 3. Optional: `{ "firms": ["Sequoia Capital", { "name": "Accel", "website": "https://…" }] }` — firms only, no people.
 * 4. Optional: if you proxy OpenVC (or any service) to JSON, set `OPENVC_API_URL` (+ `OPENVC_API_KEY`).
 *
 *   npm run db:seed:openvc
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type FirmType, type SectorFocus, type StageFocus } from "@prisma/client";

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

type FirmJson = {
  name?: string;
  url?: string;
  website?: string;
  location?: string;
  country?: string;
  /** e.g. ["Seed", "Series A"] */
  focus?: string[];
  stages?: string[];
};

export type OpenVCInvestorRow = {
  firm?: FirmJson;
  /** Full name */
  name?: string;
  full_name?: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "firm";
}

const SECTOR_MAP: Record<string, SectorFocus> = {
  "ai/ml": "AI",
  ai: "AI",
  saas: "ENTERPRISE_SAAS",
  fintech: "FINTECH",
  healthcare: "HEALTHTECH",
  biotech: "BIOTECH",
  consumer: "CONSUMER",
  climate: "CLIMATE",
  security: "CYBERSECURITY",
  cybersecurity: "CYBERSECURITY",
  web3: "WEB3",
  hardware: "HARDWARE",
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

function mapSectors(labels: string[] | undefined): SectorFocus[] {
  if (!labels?.length) return [];
  const out = new Set<SectorFocus>();
  for (const raw of labels) {
    const k = raw.toLowerCase().replace(/\s+/g, " ").trim();
    out.add(SECTOR_MAP[k] ?? "OTHER");
  }
  return [...out];
}

function mapStages(labels: string[] | undefined): StageFocus[] {
  if (!labels?.length) return [];
  const out = new Set<StageFocus>();
  for (const raw of labels) {
    const k = raw.toLowerCase().replace(/\s+/g, " ").trim();
    out.add(STAGE_MAP[k] ?? "SEED");
  }
  return [...out];
}

function splitName(full: string): { first: string; last: string } {
  const p = full.trim().split(/\s+/);
  if (p.length === 0) return { first: "Unknown", last: "Investor" };
  if (p.length === 1) return { first: p[0], last: "" };
  return { first: p[0], last: p.slice(1).join(" ") };
}

function normalizeRows(raw: unknown): OpenVCInvestorRow[] {
  if (Array.isArray(raw)) return raw as OpenVCInvestorRow[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.investors)) return o.investors as OpenVCInvestorRow[];
    if (Array.isArray(o.data)) return o.data as OpenVCInvestorRow[];
    /** Bare firm list: `{ "firms": ["Sequoia", { "name": "Accel", "website": "..." }] }` */
    if (Array.isArray(o.firms)) {
      return (o.firms as unknown[]).map((item) => {
        if (typeof item === "string") return { firm: { name: item } };
        if (item && typeof item === "object" && item !== null && "firm" in item) {
          return item as OpenVCInvestorRow;
        }
        if (item && typeof item === "object" && item !== null && "name" in item) {
          const r = item as Record<string, unknown>;
          const name = String(r.name ?? "").trim();
          return {
            firm: {
              name,
              url: typeof r.url === "string" ? r.url : undefined,
              website: typeof r.website === "string" ? r.website : undefined,
              location: typeof r.location === "string" ? r.location : undefined,
              country: typeof r.country === "string" ? r.country : undefined,
              focus: Array.isArray(r.focus) ? (r.focus as string[]) : undefined,
              stages: Array.isArray(r.stages) ? (r.stages as string[]) : undefined,
            },
          };
        }
        return { firm: { name: String(item) } };
      });
    }
  }
  return [];
}

async function loadJson(): Promise<OpenVCInvestorRow[]> {
  const apiUrl = process.env.OPENVC_API_URL?.trim();
  if (apiUrl) {
    const headers: Record<string, string> = {};
    const key = process.env.OPENVC_API_KEY?.trim();
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(apiUrl, { headers });
    const text = await res.text();
    if (!res.ok) throw new Error(`OPENVC_API_URL ${res.status}: ${text.slice(0, 400)}`);
    return normalizeRows(JSON.parse(text));
  }

  const path =
    process.env.OPENVC_JSON_PATH?.trim() ||
    join(process.cwd(), "data", "openvc", "investors.json");
  if (!existsSync(path)) {
    throw new Error(
      `No data source. Either:\n` +
        `  • Create ${path} (copy from data/openvc/investors.example.json), or\n` +
        `  • Set OPENVC_JSON_PATH=/absolute/or/relative/path.json, or\n` +
        `  • Set OPENVC_API_URL=https://your-proxy-returning-json (optional OPENVC_API_KEY).\n` +
        `Note: the npm package "openvc" does not exist; there is no official keyless API from this repo.`,
    );
  }
  return normalizeRows(JSON.parse(readFileSync(path, "utf8")));
}

async function main() {
  loadDatabaseUrl();
  const rows = await loadJson();
  if (rows.length === 0) {
    console.log("No investor rows in JSON.");
    return;
  }

  const prisma = new PrismaClient();
  const defaultFirmType = (process.env.OPENVC_DEFAULT_FIRM_TYPE as FirmType) || "ANGEL_NETWORK";
  let peopleUpserted = 0;

  for (const row of rows) {
    const firmName = row.firm?.name?.trim();
    if (!firmName) {
      console.warn("Skipping row without firm.name");
      continue;
    }
    const slug = slugify(firmName);

    const website = row.firm?.url?.trim() || row.firm?.website?.trim() || null;
    const hq = row.firm?.country?.trim() || row.firm?.location?.trim() || null;
    const sectorFocus = mapSectors(row.firm?.focus);
    const stageFocus = mapStages(row.firm?.stages);

    const firm = await prisma.vCFirm.upsert({
      where: { slug },
      create: {
        firm_name: firmName,
        slug,
        website_url: website,
        hq_country: hq,
        description: row.firm?.focus?.length ? `Focus: ${row.firm!.focus!.join(", ")}` : null,
        firm_type: defaultFirmType,
        openvc_url: "https://openvc.app/",
      },
      update: {
        firm_name: firmName,
        website_url: website ?? undefined,
        hq_country: hq ?? undefined,
        description: row.firm?.focus?.length ? `Focus: ${row.firm!.focus!.join(", ")}` : undefined,
      },
    });

    const full = (row.name || row.full_name || "").trim();
    if (!full) continue;
    const { first, last } = splitName(full);
    const email = row.email?.trim() || null;

    const existing = await prisma.vCPerson.findFirst({
      where: {
        firm_id: firm.id,
        deleted_at: null,
        OR: [...(email ? [{ email }] : []), { first_name: first, last_name: last }],
      },
    });

    const pData = {
      title: row.title?.trim() || null,
      email,
      linkedin_url: row.linkedin_url?.trim() || null,
      country: firm.hq_country,
      sector_focus: sectorFocus.length ? sectorFocus : undefined,
      stage_focus: stageFocus.length ? stageFocus : undefined,
    };

    if (existing) {
      await prisma.vCPerson.update({
        where: { id: existing.id },
        data: pData,
      });
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
    peopleUpserted += 1;
  }

  console.log(`OpenVC import: ${rows.length} rows → firm upserts per row + ${peopleUpserted} people created/updated.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
