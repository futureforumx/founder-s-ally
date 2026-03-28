/**
 * Upsert VC/PE firms from data/curated-firms/founder_suite_2025_funds.json (FounderSuite-style rows).
 *
 *   npm run db:seed:founder-suite-funds
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type FirmType, type SourceType } from "@prisma/client";

type FundRow = {
  name: string;
  type: string;
  source_basis: string;
  source_url: string;
  website: string;
  linkedin_or_social: string;
  hq_location: string;
  stage_focus: string;
  category_focus: string;
  fund_size: string;
  key_people_or_team: string;
};

const DEFAULT_JSON = join(process.cwd(), "data", "curated-firms", "founder_suite_2025_funds.json");

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
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "firm";
}

function mapFirmType(raw: string): FirmType {
  const t = raw.trim().toUpperCase();
  if (t === "VC") return "VC";
  if (t.includes("CVC")) return "CVC";
  if (t.includes("ACCELERATOR")) return "ACCELERATOR";
  // e.g. VC/PE, VC/Fund of Funds — not a single Prisma bucket
  if (/\bVC\b.*\bPE\b|\bPE\b.*\bVC\b|FUND OF FUNDS/i.test(t)) return "OTHER";
  if (t.includes("PE")) return "PE";
  if (t.includes("VC")) return "VC";
  return "OTHER";
}

function normalizeHttpUrl(raw: string): string | null {
  const u = raw.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u.replace(/^\/+/, "")}`;
}

function splitSocial(raw: string): { linkedin_url: string | null; x_url: string | null } {
  const u = raw.trim();
  if (!u) return { linkedin_url: null, x_url: null };
  const full = normalizeHttpUrl(u) ?? u;
  const low = full.toLowerCase();
  if (low.includes("linkedin.com")) return { linkedin_url: full, x_url: null };
  if (low.includes("x.com") || low.includes("twitter.com")) return { linkedin_url: null, x_url: full };
  return { linkedin_url: full, x_url: null };
}

function parseHq(loc: string): { hq_city: string | null; hq_state: string | null; hq_country: string | null } {
  const t = loc.trim();
  if (!t) return { hq_city: null, hq_state: null, hq_country: null };
  if (/^remote$/i.test(t)) return { hq_city: "Remote", hq_state: null, hq_country: null };
  if (/british virgin islands/i.test(t)) {
    return { hq_city: null, hq_state: null, hq_country: "British Virgin Islands" };
  }

  const parts = t.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) {
    const p = parts[0];
    if (/^london$/i.test(p)) {
      return { hq_city: "London", hq_state: null, hq_country: "United Kingdom" };
    }
    if (/^singapore$/i.test(p)) {
      return { hq_city: "Singapore", hq_state: null, hq_country: "Singapore" };
    }
    return { hq_city: null, hq_state: null, hq_country: p };
  }
  if (parts.length === 2) {
    return { hq_city: parts[0], hq_state: null, hq_country: parts[1] };
  }
  const country = parts[parts.length - 1] ?? null;
  const state = parts[parts.length - 2] ?? null;
  const city = parts.slice(0, -2).join(", ") || parts[0];
  return { hq_city: city, hq_state: state, hq_country: country };
}

function buildDescription(row: FundRow): string {
  const blocks: string[] = [];
  if (row.source_basis) blocks.push(`Source basis: ${row.source_basis}`);
  if (row.stage_focus) blocks.push(`Stage focus: ${row.stage_focus}`);
  if (row.category_focus) blocks.push(`Category focus: ${row.category_focus}`);
  if (row.fund_size) blocks.push(`Fund size (stated): ${row.fund_size}`);
  if (row.key_people_or_team) blocks.push(`Key people / team: ${row.key_people_or_team}`);
  return blocks.join("\n\n");
}

function partnerNameChunks(keyPeople: string): string[] {
  const t = keyPeople.trim();
  if (!t) return [];
  return t
    .split(/\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 24);
}

async function main() {
  loadDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (use .env / .env.local).");
  }

  const path = process.env.FOUNDER_SUITE_FUNDS_JSON || DEFAULT_JSON;
  const rows = JSON.parse(readFileSync(path, "utf8")) as FundRow[];
  if (!Array.isArray(rows)) throw new Error("JSON must be an array");

  const prisma = new PrismaClient();
  const sourceType = "OTHER" as SourceType;
  const usedSlugs = new Set<string>();

  let n = 0;
  for (const row of rows) {
    if (!row?.name?.trim()) continue;

    let base = slugify(row.name);
    let slug = base;
    let i = 2;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${i}`;
      i += 1;
    }
    usedSlugs.add(slug);

    const website_url = normalizeHttpUrl(row.website);
    const { linkedin_url, x_url } = splitSocial(row.linkedin_or_social);
    const hq = parseHq(row.hq_location);
    const firm_type = mapFirmType(row.type);
    const description = buildDescription(row);
    const elevator_pitch = row.source_basis?.trim() || null;
    const partner_names = partnerNameChunks(row.key_people_or_team);

    const firm = await prisma.vCFirm.upsert({
      where: { slug },
      create: {
        firm_name: row.name.trim(),
        slug,
        firm_type,
        website_url,
        linkedin_url,
        x_url,
        hq_city: hq.hq_city,
        hq_state: hq.hq_state,
        hq_country: hq.hq_country,
        elevator_pitch,
        description,
        partner_names,
        status: "Active",
      },
      update: {
        firm_name: row.name.trim(),
        firm_type,
        website_url,
        linkedin_url,
        x_url,
        hq_city: hq.hq_city,
        hq_state: hq.hq_state,
        hq_country: hq.hq_country,
        elevator_pitch,
        description,
        partner_names,
        status: "Active",
      },
    });

    const src = row.source_url?.trim();
    if (src) {
      const existing = await prisma.vCSourceLink.findFirst({
        where: { firm_id: firm.id, url: src, deleted_at: null },
      });
      if (!existing) {
        await prisma.vCSourceLink.create({
          data: {
            firm_id: firm.id,
            source_type: sourceType,
            label: "FounderSuite: 2025 new funds list",
            url: src,
            last_verified_at: new Date(),
          },
        });
      }
    }
    n += 1;
  }

  console.log(`FounderSuite funds seed: ${n} firms upserted from ${path}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
