/**
 * Upsert curated VC people + firms from JSON (public team pages, etc.).
 *
 *   CURATED_INVESTORS_JSON=./data/curated-investors/partners.json npm run db:seed:curated-investors
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type FirmType, type SourceType } from "@prisma/client";

type CuratedFirm = {
  name: string;
  slug: string;
  url?: string;
};

type CuratedPerson = {
  name: string;
  title?: string;
  email?: string;
  firm: CuratedFirm;
  linkedin?: string;
  /** Firm bio page (maps to vc_people.website_url) */
  profile_url?: string;
  source?: string;
};

const DEFAULT_JSON = join(process.cwd(), "data", "curated-investors", "partners.json");

/** Known slugs when JSON omits firm website */
const FIRM_WEBSITE_FALLBACK: Record<string, string> = {
  "sequoia-capital": "https://sequoiacap.com",
  accel: "https://www.accel.com",
  bessemer: "https://www.bvp.com",
  benchmark: "https://www.benchmark.com",
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

function splitName(full: string): { first: string; last: string } {
  const p = full.trim().split(/\s+/);
  if (p.length === 0) return { first: "Unknown", last: "Investor" };
  if (p.length === 1) return { first: p[0], last: "" };
  return { first: p[0], last: p.slice(1).join(" ") };
}

function normalizeSourceUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

async function main() {
  loadDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (use .env / .env.local).");
  }

  const jsonPath = process.env.CURATED_INVESTORS_JSON || DEFAULT_JSON;
  const raw = JSON.parse(readFileSync(jsonPath, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error(`${jsonPath} must be a JSON array`);
  const rows = raw as CuratedPerson[];

  const prisma = new PrismaClient();
  const defaultFirmType = (process.env.CURATED_DEFAULT_FIRM_TYPE as FirmType) || "VC";
  const sourceType = "OTHER" as SourceType;

  let peopleTouched = 0;
  const firmSourceUrls = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row?.name?.trim() || !row.firm?.slug?.trim() || !row.firm?.name?.trim()) {
      console.warn("Skipping invalid row:", row);
      continue;
    }

    const slug = row.firm.slug.trim();
    const websiteUrl =
      row.firm.url?.trim() || FIRM_WEBSITE_FALLBACK[slug] || undefined;

    const firm = await prisma.vCFirm.upsert({
      where: { slug },
      create: {
        firm_name: row.firm.name.trim(),
        slug,
        firm_type: defaultFirmType,
        website_url: websiteUrl ?? null,
      },
      update: {
        firm_name: row.firm.name.trim(),
        ...(websiteUrl ? { website_url: websiteUrl } : {}),
      },
    });

    if (row.source?.trim()) {
      const url = normalizeSourceUrl(row.source);
      if (!firmSourceUrls.has(firm.id)) firmSourceUrls.set(firm.id, new Set());
      firmSourceUrls.get(firm.id)!.add(url);
    }

    const { first, last } = splitName(row.name);
    const lastNorm = last || "-";
    const email = row.email?.trim() || null;
    const linkedinUrl = row.linkedin?.trim() || null;
    const profileUrl = row.profile_url?.trim() || null;

    const existing =
      email != null
        ? await prisma.vCPerson.findFirst({
            where: { firm_id: firm.id, deleted_at: null, email },
          })
        : await prisma.vCPerson.findFirst({
            where: {
              firm_id: firm.id,
              deleted_at: null,
              first_name: first,
              last_name: lastNorm,
            },
          });

    const pData = {
      title: row.title?.trim() || null,
      email,
      linkedin_url: linkedinUrl,
      ...(profileUrl ? { website_url: profileUrl } : {}),
    };

    if (existing) {
      await prisma.vCPerson.update({ where: { id: existing.id }, data: pData });
    } else {
      await prisma.vCPerson.create({
        data: {
          firm_id: firm.id,
          first_name: first,
          last_name: lastNorm,
          ...pData,
        },
      });
    }
    peopleTouched += 1;
  }

  for (const [firmId, urls] of firmSourceUrls) {
    for (const url of urls) {
      const existingLink = await prisma.vCSourceLink.findFirst({
        where: { firm_id: firmId, source_type: sourceType, url, deleted_at: null },
      });
      if (existingLink) continue;
      await prisma.vCSourceLink.create({
        data: {
          firm_id: firmId,
          source_type: sourceType,
          label: "Curated directory",
          url,
          last_verified_at: new Date(),
        },
      });
    }
  }

  console.log(
    `Curated investors: ${rows.length} rows in file → ${peopleTouched} people upserted; source links for ${firmSourceUrls.size} firm(s).`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
