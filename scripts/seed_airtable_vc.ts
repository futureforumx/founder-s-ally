/**
 * Import VC firms (and optional people) from an Airtable base via the REST API.
 *
 * Your share link includes base `appYlRDIZLwvRPsRh` and table `tbl5Q8N7NuW22z5Bt`.
 * Create a Personal Access Token (Airtable → Developer hub) with read access to that base.
 *
 *   AIRTABLE_TOKEN=patXXX AIRTABLE_BASE_ID=appYlRDIZLwvRPsRh AIRTABLE_TABLE_ID=tbl5Q8N7NuW22z5Bt npm run db:seed:airtable
 *
 * Alternatively export API JSON to a file:
 *   AIRTABLE_JSON_PATH=./data/imports/airtable-vc.json npm run db:seed:airtable
 *
 * Field names are matched case-insensitively. Firm name is taken from the first non-empty match among:
 *   Firm, Company, Fund, Fund name, VC, Organization, Name (if no separate person field)
 * Person name from: Partner, Investor, Full name, Contact — when present, a VCPerson is created.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type FirmType, type SourceType } from "@prisma/client";

const OTHER: SourceType = "OTHER";

type AirtableRecord = { id: string; fields: Record<string, unknown> };

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
    .slice(0, 60) || "firm";
}

function splitName(full: string): { first: string; last: string } {
  const p = full.trim().split(/\s+/);
  if (p.length === 0) return { first: "Unknown", last: "-" };
  if (p.length === 1) return { first: p[0], last: "" };
  return { first: p[0], last: p.slice(1).join(" ") };
}

function normalizeWebsite(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  let w = raw.trim();
  if (!/^https?:\/\//i.test(w)) w = `https://${w}`;
  return w;
}

function fieldString(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string" && val.trim()) return val.trim();
  if (typeof val === "number") return String(val);
  if (Array.isArray(val)) {
    const strs = val.filter((x): x is string => typeof x === "string" && x.trim() && !/^rec[a-zA-Z0-9]{14}$/.test(x));
    if (strs.length) return strs.join(", ");
    return null;
  }
  return null;
}

function getField(fields: Record<string, unknown>, candidates: string[]): string | null {
  const keys = Object.keys(fields);
  const lowerMap = new Map(keys.map((k) => [k.toLowerCase(), k]));
  for (const c of candidates) {
    const k = lowerMap.get(c.toLowerCase());
    if (k === undefined) continue;
    const s = fieldString(fields[k]);
    if (s) return s;
  }
  return null;
}

const FIRM_KEYS = [
  "Firm",
  "Company",
  "Fund",
  "Fund name",
  "VC",
  "VC firm",
  "Organization",
  "Firm name",
  "Fund Name",
];

const PERSON_SPECIFIC_KEYS = ["Partner", "Investor", "Full name", "Contact", "GP", "Principal"];

const TITLE_KEYS = ["Title", "Role", "Position"];

const WEBSITE_KEYS = ["Website", "URL", "Firm website", "Company website", "Fund website"];

const LINKEDIN_KEYS = ["LinkedIn", "Linkedin", "LinkedIn URL"];

const EMAIL_KEYS = ["Email"];

const DESC_KEYS = ["Description", "Notes", "About", "Bio", "Summary"];

const CITY_KEYS = ["City", "HQ city"];

const STATE_KEYS = ["State", "HQ state", "Region"];

const COUNTRY_KEYS = ["Country", "HQ country"];

async function fetchAllAirtableRecords(
  token: string,
  baseId: string,
  tableId: string,
): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  const encTable = encodeURIComponent(tableId);
  do {
    const u = new URL(`https://api.airtable.com/v0/${baseId}/${encTable}`);
    if (offset) u.searchParams.set("offset", offset);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json()) as { records?: AirtableRecord[]; offset?: string; error?: { message?: string } };
    if (!res.ok) {
      throw new Error(`Airtable ${res.status}: ${body.error?.message || JSON.stringify(body).slice(0, 400)}`);
    }
    if (body.records?.length) out.push(...body.records);
    offset = body.offset;
  } while (offset);
  return out;
}

function loadJsonRecords(): AirtableRecord[] {
  const path = process.env.AIRTABLE_JSON_PATH?.trim();
  if (!path) throw new Error("Set AIRTABLE_JSON_PATH to a file with { records: [...] }");
  const raw = JSON.parse(readFileSync(path, "utf8")) as { records?: AirtableRecord[] };
  if (!Array.isArray(raw.records)) throw new Error("JSON must contain records[]");
  return raw.records;
}

async function main() {
  const fetchOnly = process.env.AIRTABLE_FETCH_ONLY === "1";
  const jsonOut =
    process.env.AIRTABLE_JSON_OUT?.trim() || join(process.cwd(), "data", "imports", "airtable-vc.json");

  let records: AirtableRecord[];
  if (process.env.AIRTABLE_JSON_PATH?.trim()) {
    records = loadJsonRecords();
    console.log(`Airtable: loaded ${records.length} records from JSON.`);
  } else {
    const token = process.env.AIRTABLE_TOKEN?.trim() || process.env.AIRTABLE_API_KEY?.trim();
    const baseId = process.env.AIRTABLE_BASE_ID?.trim() || "appYlRDIZLwvRPsRh";
    const tableId = process.env.AIRTABLE_TABLE_ID?.trim() || "tbl5Q8N7NuW22z5Bt";
    if (!token) {
      throw new Error(
        "Missing AIRTABLE_TOKEN (or AIRTABLE_API_KEY). " +
          "Create a PAT at https://airtable.com/create/tokens with read access to the base. " +
          "Or set AIRTABLE_JSON_PATH to an exported API response.",
      );
    }
    records = await fetchAllAirtableRecords(token, baseId, tableId);
    console.log(`Airtable: fetched ${records.length} records from ${baseId}/${tableId}.`);
  }

  if (fetchOnly) {
    mkdirSync(join(process.cwd(), "data", "imports"), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify({ records }, null, 2), "utf8");
    console.log(`Wrote ${jsonOut}`);
    return;
  }

  loadDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set. Use AIRTABLE_FETCH_ONLY=1 to save JSON only.");
  }

  const prisma = new PrismaClient();
  const defaultFirmType = (process.env.AIRTABLE_DEFAULT_FIRM_TYPE as FirmType) || "VC";
  const sourceUrl =
    process.env.AIRTABLE_SOURCE_URL?.trim() ||
    "https://airtable.com/appYlRDIZLwvRPsRh/shrkohpeE2AO2ldeq/tbl5Q8N7NuW22z5Bt";

  let firmsTouched = 0;
  let peopleTouched = 0;

  for (const rec of records) {
    const f = rec.fields;
    let firmName = getField(f, FIRM_KEYS);
    let personName = getField(f, PERSON_SPECIFIC_KEYS);
    const nameCol = getField(f, ["Name"]);
    if (nameCol) {
      if (firmName) personName = personName || nameCol;
      else firmName = nameCol;
    }
    if (!firmName && personName) {
      firmName = `${personName} (individual)`;
    }
    if (!firmName) {
      console.warn(`Skipping Airtable record ${rec.id}: no firm/company field matched.`);
      continue;
    }

    const slug = `${slugify(firmName)}-at-${rec.id.replace(/^rec/, "")}`.slice(0, 80);
    const website = normalizeWebsite(getField(f, WEBSITE_KEYS));
    const description = getField(f, DESC_KEYS);
    const city = getField(f, CITY_KEYS);
    const state = getField(f, STATE_KEYS);
    const country = getField(f, COUNTRY_KEYS);
    const linkedin = normalizeWebsite(getField(f, LINKEDIN_KEYS));
    const email = getField(f, EMAIL_KEYS);

    const firm = await prisma.vCFirm.upsert({
      where: { slug },
      create: {
        firm_name: firmName,
        slug,
        website_url: website,
        description: description || null,
        hq_city: city,
        hq_state: state,
        hq_country: country,
        firm_type: defaultFirmType,
        linkedin_url: linkedin,
      },
      update: {
        firm_name: firmName,
        website_url: website ?? undefined,
        description: description ?? undefined,
        hq_city: city ?? undefined,
        hq_state: state ?? undefined,
        hq_country: country ?? undefined,
        linkedin_url: linkedin ?? undefined,
      },
    });

    const linkLabel = `Airtable ${rec.id}`;
    const ex = await prisma.vCSourceLink.findFirst({
      where: { firm_id: firm.id, source_type: OTHER, url: sourceUrl, label: linkLabel, deleted_at: null },
    });
    if (!ex) {
      await prisma.vCSourceLink.create({
        data: {
          firm_id: firm.id,
          source_type: OTHER,
          label: linkLabel,
          url: sourceUrl,
          last_verified_at: new Date(),
        },
      });
    }
    firmsTouched += 1;

    if (personName && !personName.endsWith("(individual)")) {
      const title = getField(f, TITLE_KEYS);
      const { first, last } = splitName(personName);
      const existing = await prisma.vCPerson.findFirst({
        where: { firm_id: firm.id, deleted_at: null, first_name: first, last_name: last || "-" },
      });
      const pData = {
        title: title || null,
        email: email || null,
        linkedin_url: linkedin,
        website_url: website,
      };
      if (existing) {
        await prisma.vCPerson.update({ where: { id: existing.id }, data: pData });
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
      peopleTouched += 1;
    }
  }

  console.log(`Airtable import: ${firmsTouched} firms, ${peopleTouched} people created/updated.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
