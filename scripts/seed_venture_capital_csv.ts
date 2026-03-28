/**
 * Import VC firms from the public Employbl-style CSV in connor11528/tech-companies-and-startups.
 *
 * Source: https://raw.githubusercontent.com/connor11528/tech-companies-and-startups/master/venture-capital.csv
 *
 *   npm run db:seed:venture-csv
 *   VENTURE_CSV_PATH=./my.csv npm run db:seed:venture-csv   # local file instead of fetch
 *   VENTURE_CSV_FETCH_ONLY=1 npm run db:seed:venture-csv   # write parsed JSON, no DB
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type FirmType, type SourceType } from "@prisma/client";

const DEFAULT_CSV_URL =
  "https://raw.githubusercontent.com/connor11528/tech-companies-and-startups/master/venture-capital.csv";

const SOURCE_LINK_URL =
  "https://github.com/connor11528/tech-companies-and-startups/blob/master/venture-capital.csv";

const OTHER: SourceType = "OTHER";

export type VentureCapitalCsvRow = {
  employbl_id: string;
  company_name: string;
  website: string | null;
  address_1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  thumbnail_url: string | null;
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

/** Minimal RFC 4180-style parser (quoted fields, doubled quotes) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  row.push(cur);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function normalizeWebsite(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  let w = raw.trim();
  if (!/^https?:\/\//i.test(w)) w = `https://${w}`;
  return w;
}

function parseNum(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function ventureCsvRowsFromMatrix(rows: string[][]): VentureCapitalCsvRow[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name.toLowerCase());

  const iId = idx("Employbl Company ID");
  const iName = idx("Company Name");
  const iWeb = idx("Website");
  const iAddr = idx("Address 1");
  const iCity = idx("City");
  const iState = idx("State");
  const iZip = idx("Zip");
  const iLat = idx("Latitude");
  const iLon = idx("Longitude");
  const iDesc = idx("Company Description");
  const iThumb = idx("Thumbnail URL");

  if (iName < 0) throw new Error('CSV missing "Company Name" column');

  const out: VentureCapitalCsvRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const line = rows[r];
    if (!line || !line.some((c) => c.trim())) continue;
    const name = (line[iName] ?? "").trim();
    if (!name) continue;
    const id = (iId >= 0 ? line[iId] : String(r)).trim() || String(r);
    out.push({
      employbl_id: id,
      company_name: name,
      website: normalizeWebsite((line[iWeb] ?? "").trim() || null),
      address_1: (line[iAddr] ?? "").trim() || null,
      city: (line[iCity] ?? "").trim() || null,
      state: (line[iState] ?? "").trim() || null,
      zip: (line[iZip] ?? "").trim() || null,
      latitude: iLat >= 0 ? parseNum(line[iLat] ?? "") : null,
      longitude: iLon >= 0 ? parseNum(line[iLon] ?? "") : null,
      description: (line[iDesc] ?? "").trim() || null,
      thumbnail_url: (line[iThumb] ?? "").trim() || null,
    });
  }
  return out;
}

function guessCountry(state: string | null): string | null {
  if (!state || state.length !== 2) return null;
  return /^[A-Z]{2}$/i.test(state) ? "US" : null;
}

async function loadCsvText(): Promise<string> {
  const p = process.env.VENTURE_CSV_PATH?.trim();
  if (p) return readFileSync(p, "utf8");
  const url = process.env.VENTURE_CSV_URL?.trim() || DEFAULT_CSV_URL;
  const res = await fetch(url, { headers: { Accept: "text/csv,*/*" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`CSV fetch ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

async function main() {
  const text = await loadCsvText();
  const matrix = parseCsv(text.replace(/^\uFEFF/, ""));
  const data = ventureCsvRowsFromMatrix(matrix);
  console.log(`venture-capital.csv: parsed ${data.length} firms.`);

  const fetchOnly = process.env.VENTURE_CSV_FETCH_ONLY === "1";
  const jsonOut =
    process.env.VENTURE_CSV_JSON_OUT?.trim() || join(process.cwd(), "data", "imports", "venture-capital.json");

  if (fetchOnly) {
    mkdirSync(join(process.cwd(), "data", "imports"), { recursive: true });
    writeFileSync(
      jsonOut,
      JSON.stringify({ source_url: DEFAULT_CSV_URL, fetched_at: new Date().toISOString(), firms: data }, null, 2),
      "utf8",
    );
    console.log(`Wrote ${jsonOut}`);
    return;
  }

  loadDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set. Use VENTURE_CSV_FETCH_ONLY=1 to export JSON only.");
  }

  const prisma = new PrismaClient();
  const defaultFirmType = (process.env.VENTURE_CSV_FIRM_TYPE as FirmType) || "VC";
  let upserted = 0;

  for (const row of data) {
    const firmName = row.company_name;
    const slug = `${slugify(firmName)}-${row.employbl_id}`.slice(0, 80);

    const hqCountry = guessCountry(row.state);
    const parts = [row.address_1, row.city, row.state, row.zip].filter(Boolean);
    const addressLine = parts.length ? parts.join(", ") : null;

    const descParts = [`[Employbl ID ${row.employbl_id}]`, row.description].filter(Boolean);
    const description = descParts.join(" ").trim() || null;

    const firm = await prisma.vCFirm.upsert({
      where: { slug },
      create: {
        firm_name: firmName,
        slug,
        website_url: row.website,
        logo_url: row.thumbnail_url,
        description,
        address: addressLine,
        hq_city: row.city,
        hq_state: row.state,
        hq_country: hqCountry,
        locations:
          row.latitude != null && row.longitude != null
            ? [{ lat: row.latitude, lng: row.longitude, label: "HQ (CSV)" }]
            : undefined,
        firm_type: defaultFirmType,
      },
      update: {
        firm_name: firmName,
        website_url: row.website ?? undefined,
        logo_url: row.thumbnail_url ?? undefined,
        description: description ?? undefined,
        address: addressLine ?? undefined,
        hq_city: row.city ?? undefined,
        hq_state: row.state ?? undefined,
        hq_country: hqCountry ?? undefined,
        locations:
          row.latitude != null && row.longitude != null
            ? [{ lat: row.latitude, lng: row.longitude, label: "HQ (CSV)" }]
            : undefined,
      },
    });

    const linkLabel = `Employbl CSV #${row.employbl_id} — ${firmName}`;
    const existing = await prisma.vCSourceLink.findFirst({
      where: { firm_id: firm.id, source_type: OTHER, url: SOURCE_LINK_URL, label: linkLabel, deleted_at: null },
    });
    if (!existing) {
      await prisma.vCSourceLink.create({
        data: {
          firm_id: firm.id,
          source_type: OTHER,
          label: linkLabel,
          url: SOURCE_LINK_URL,
          last_verified_at: new Date(),
        },
      });
    }
    upserted += 1;
  }

  console.log(`venture-capital.csv: upserted ${upserted} VCFirm rows (+ source links).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
