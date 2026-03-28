/**
 * Import VC / accelerator / investor rows from futureforumx/founder-s-ally on GitHub.
 *
 * Raw base: https://raw.githubusercontent.com/futureforumx/founder-s-ally/main/
 *
 * Bundled files:
 *   • Early Stage NYC VCs-Grid view.csv
 *   • Gigasheet_investors.csv (~24k rows — use FOUNDER_ALLY_MAX_ROWS to cap)
 *   • Accelerators-Grid view.csv
 *   • Firms-Grid view.csv
 *   • Investors-Grid view (4).csv
 *   • Early-Stage Investor List-Grid view (1).csv
 *
 * The Ramp Airtable `.txt` in that repo is a formatted printout, not CSV — not imported here;
 * re-export from Airtable as CSV if you need it.
 *
 *   npm run db:seed:founder-sally
 *   FOUNDER_ALLY_FETCH_ONLY=1 npm run db:seed:founder-sally
 *   FOUNDER_ALLY_ONLY=nyc_early_stage,accelerators npm run db:seed:founder-sally
 *   FOUNDER_ALLY_MAX_ROWS=500 npm run db:seed:founder-sally
 *   FOUNDER_ALLY_CSV_PATH=./Firms-Grid\ view.csv npm run db:seed:founder-sally  # single local file
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type FirmType, type SourceType } from "@prisma/client";

const RAW_BASE = "https://raw.githubusercontent.com/futureforumx/founder-s-ally/main";
const REPO_BLOB = "https://github.com/futureforumx/founder-s-ally/blob/main";

const OTHER: SourceType = "OTHER";

type SourceId =
  | "nyc_early_stage"
  | "gigasheet"
  | "accelerators"
  | "firms_grid"
  | "investors_grid"
  | "early_stage_list";

type SourceDef = {
  id: SourceId;
  /** URL-encoded path under main/ */
  rawPath: string;
  /** Unencoded filename for GitHub blob link */
  blobName: string;
};

const BUNDLED: SourceDef[] = [
  { id: "nyc_early_stage", rawPath: "Early%20Stage%20NYC%20VCs-Grid%20view.csv", blobName: "Early Stage NYC VCs-Grid view.csv" },
  { id: "gigasheet", rawPath: "Gigasheet_investors.csv", blobName: "Gigasheet_investors.csv" },
  { id: "accelerators", rawPath: "Accelerators-Grid%20view.csv", blobName: "Accelerators-Grid view.csv" },
  { id: "firms_grid", rawPath: "Firms-Grid%20view.csv", blobName: "Firms-Grid view.csv" },
  { id: "investors_grid", rawPath: "Investors-Grid%20view%20(4).csv", blobName: "Investors-Grid view (4).csv" },
  { id: "early_stage_list", rawPath: "Early-Stage%20Investor%20List-Grid%20view%20(1).csv", blobName: "Early-Stage Investor List-Grid view (1).csv" },
];

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

/** RFC 4180-ish CSV (quoted fields, newlines inside quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
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
      if (c === "\r" && t[i + 1] === "\n") i++;
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

function headerMap(headerRow: string[]): Map<string, number> {
  const m = new Map<string, number>();
  headerRow.forEach((h, i) => {
    m.set(
      h
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " "),
      i,
    );
  });
  return m;
}

function getCell(row: string[], m: Map<string, number>, ...names: string[]): string | null {
  for (const n of names) {
    const idx = m.get(n.toLowerCase());
    if (idx === undefined) continue;
    const v = (row[idx] ?? "").trim();
    if (v) return v;
  }
  return null;
}

function normalizeWebsite(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  let w = raw.trim();
  if (!/^https?:\/\//i.test(w)) w = `https://${w}`;
  return w;
}

function normalizeLinkedIn(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  let w = raw.trim();
  if (!/^https?:\/\//i.test(w)) w = `https://${w}`;
  return w;
}

function mapFirmTypeFromLabel(label: string | null): FirmType {
  if (!label) return "VC";
  const l = label.toLowerCase();
  if (l.includes("accelerator")) return "ACCELERATOR";
  if (l.includes("angel")) return "ANGEL_NETWORK";
  if (l.includes("family office")) return "FAMILY_OFFICE";
  if (l.includes("corporate") || l.includes("cvc")) return "CVC";
  return "VC";
}

function splitGpNames(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/,|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && /[a-z]/i.test(s));
}

function splitName(full: string): { first: string; last: string } {
  const p = full.trim().split(/\s+/);
  if (p.length === 0) return { first: "Unknown", last: "-" };
  if (p.length === 1) return { first: p[0], last: "" };
  return { first: p[0], last: p.slice(1).join(" ") };
}

function blobUrl(blobName: string): string {
  return `${REPO_BLOB}/${encodeURIComponent(blobName)}`;
}

function detectProfile(headerRow: string[]): SourceId | null {
  const cells = headerRow.map((x) => x.trim().toLowerCase().replace(/\s+/g, " "));
  const h = cells.join("|");
  const hasCol = (re: RegExp) => cells.some((c) => re.test(c));
  if (hasCol(/^fund name$/) && (hasCol(/^best contact$/) || hasCol(/^e-mail$/))) return "nyc_early_stage";
  if (hasCol(/^linkedin_url$/) && hasCol(/^locality$/) && hasCol(/^industry$/)) return "gigasheet";
  if (hasCol(/^accelerator name$/)) return "accelerators";
  if (hasCol(/^firm name$/) && hasCol(/^insider rating$/)) return "firms_grid";
  if (hasCol(/^investor name$/) && hasCol(/^investor type$/) && hasCol(/^firm name \(from firm\)$/)) return "investors_grid";
  if (hasCol(/^investor name$/) && hasCol(/^title$/) && hasCol(/^firm$/) && !hasCol(/^investor type$/)) return "early_stage_list";
  return null;
}

async function ensureSourceLink(
  prisma: PrismaClient,
  firmId: string,
  sourceLabel: string,
  blobHref: string,
): Promise<void> {
  const label = `Founder-s-ally · ${sourceLabel}`;
  const ex = await prisma.vCSourceLink.findFirst({
    where: { firm_id: firmId, source_type: OTHER, url: blobHref, label, deleted_at: null },
  });
  if (!ex) {
    await prisma.vCSourceLink.create({
      data: {
        firm_id: firmId,
        source_type: OTHER,
        label,
        url: blobHref,
        last_verified_at: new Date(),
      },
    });
  }
}

async function importRows(
  prisma: PrismaClient,
  profile: SourceId,
  rows: string[][],
  meta: { blobName: string; sourceLabel: string },
  maxRows: number,
): Promise<{ firms: number; people: number }> {
  if (rows.length < 2) return { firmUpserts: 0, personUpserts: 0 };
  const header = rows[0];
  const m = headerMap(header);
  const blobHref = blobUrl(meta.blobName);
  let firmUpserts = 0;
  let personUpserts = 0;
  let dataRows = 0;

  for (let r = 1; r < rows.length; r++) {
    if (dataRows >= maxRows) break;
    const row = rows[r];
    if (!row.some((c) => c.trim())) continue;

    if (profile === "nyc_early_stage") {
      const name = getCell(row, m, "fund name");
      if (!name) continue;
      const stage = getCell(row, m, "stage");
      const loc = getCell(row, m, "location");
      const focus = getCell(row, m, "focus area");
      const desc = getCell(row, m, "description");
      const contact = getCell(row, m, "best contact");
      const email = getCell(row, m, "e-mail");
      const lead = getCell(row, m, "lead");
      const bits = [stage && `Stage: ${stage}`, loc && `Location: ${loc}`, focus && `Focus: ${focus}`, lead && `Lead: ${lead}`].filter(
        Boolean,
      );
      const description = [bits.join(" · "), desc].filter(Boolean).join("\n\n") || null;
      const slug = slugify(name);
      const firm = await prisma.vCFirm.upsert({
        where: { slug },
        create: {
          firm_name: name,
          slug,
          firm_type: "VC",
          description,
          email: email || (contact?.includes("@") ? contact : null),
          website_url: contact && /^https?:/i.test(contact) ? normalizeWebsite(contact) : null,
          hq_city: loc?.split(",")[0]?.trim() || null,
        },
        update: {
          firm_name: name,
          description: description ?? undefined,
          email: email || undefined,
        },
      });
      await ensureSourceLink(prisma, firm.id, meta.sourceLabel, blobHref);
      firms++;
      dataRows++;
    } else if (profile === "gigasheet") {
      const name = getCell(row, m, "name");
      if (!name) continue;
      const gid = getCell(row, m, "id");
      const slug = (gid && /^[a-z0-9-]+$/i.test(gid) ? gid : slugify(name)).slice(0, 80);
      const locality = getCell(row, m, "locality");
      const region = getCell(row, m, "region");
      const country = getCell(row, m, "country");
      const hq = [locality, region, country].filter(Boolean).join(", ") || null;
      const industry = getCell(row, m, "industry");
      const founded = getCell(row, m, "founded");
      const description = [industry && `Industry: ${industry}`, founded && `Founded: ${founded}`].filter(Boolean).join(" · ") || null;
      const firm = await prisma.vCFirm.upsert({
        where: { slug },
        create: {
          firm_name: name,
          slug,
          firm_type: "VC",
          description,
          website_url: normalizeWebsite(getCell(row, m, "website")),
          linkedin_url: normalizeLinkedIn(getCell(row, m, "linkedin_url")),
          hq_country: country || null,
          hq_city: locality || null,
        },
        update: {
          firm_name: name,
          description: description ?? undefined,
          website_url: normalizeWebsite(getCell(row, m, "website")) ?? undefined,
          linkedin_url: normalizeLinkedIn(getCell(row, m, "linkedin_url")) ?? undefined,
          hq_country: country ?? undefined,
          hq_city: locality ?? undefined,
        },
      });
      await ensureSourceLink(prisma, firm.id, meta.sourceLabel, blobHref);
      firmUpserts++;
      dataRows++;
    } else if (profile === "accelerators") {
      const name = getCell(row, m, "accelerator name");
      if (!name) continue;
      const slug = slugify(name);
      const desc = getCell(row, m, "description");
      const notes = getCell(row, m, "notes");
      const description = [desc, notes].filter(Boolean).join("\n\n") || null;
      const firm = await prisma.vCFirm.upsert({
        where: { slug },
        create: {
          firm_name: name,
          slug,
          firm_type: "ACCELERATOR",
          description,
          website_url: normalizeWebsite(getCell(row, m, "website")),
          email: getCell(row, m, "email") || getCell(row, m, "contact person email"),
          address: getCell(row, m, "hq location"),
        },
        update: {
          firm_name: name,
          description: description ?? undefined,
          website_url: normalizeWebsite(getCell(row, m, "website")) ?? undefined,
        },
      });
      await ensureSourceLink(prisma, firm.id, meta.sourceLabel, blobHref);
      firmUpserts++;
      dataRows++;
    } else if (profile === "firms_grid") {
      const name = getCell(row, m, "firm name");
      if (!name) continue;
      const slug = slugify(name);
      const typeLabel = getCell(row, m, "type");
      const firmType = mapFirmTypeFromLabel(typeLabel);
      const about = getCell(row, m, "about");
      const stages = getCell(row, m, "stages");
      const sectors = getCell(row, m, "sectors (representative)");
      const check = getCell(row, m, "check size (range)");
      const geo = getCell(row, m, "geography scope");
      const description =
        [about, stages && `Stages: ${stages}`, sectors && `Sectors: ${sectors}`, check && `Check: ${check}`, geo && `Geo: ${geo}`]
          .filter(Boolean)
          .join("\n\n") || null;
      const firm = await prisma.vCFirm.upsert({
        where: { slug },
        create: {
          firm_name: name,
          slug,
          firm_type: firmType,
          description,
          website_url: normalizeWebsite(getCell(row, m, "website")),
          linkedin_url: normalizeLinkedIn(getCell(row, m, "linkedin")),
          x_url: normalizeWebsite(getCell(row, m, "x")),
          email: getCell(row, m, "email"),
          founded_year: (() => {
            const fy = parseInt(getCell(row, m, "founded") || "", 10);
            return Number.isFinite(fy) ? fy : undefined;
          })(),
          hq_country: "US",
        },
        update: {
          firm_name: name,
          firm_type: firmType,
          description: description ?? undefined,
          website_url: normalizeWebsite(getCell(row, m, "website")) ?? undefined,
          linkedin_url: normalizeLinkedIn(getCell(row, m, "linkedin")) ?? undefined,
        },
      });
      await ensureSourceLink(prisma, firm.id, meta.sourceLabel, blobHref);
      firmUpserts++;
      const gpRaw = getCell(row, m, "investor name (from gps)");
      for (const gp of splitGpNames(gpRaw)) {
        const { first, last } = splitName(gp);
        if (first.length < 2) continue;
        const ex = await prisma.vCPerson.findFirst({
          where: { firm_id: firm.id, deleted_at: null, first_name: first, last_name: last || "-" },
        });
        if (!ex) {
          await prisma.vCPerson.create({
            data: { firm_id: firm.id, first_name: first, last_name: last || "-" },
          });
          personUpserts++;
        }
      }
      dataRows++;
    } else if (profile === "investors_grid" || profile === "early_stage_list") {
      const investorName = getCell(row, m, "investor name");
      if (!investorName) continue;
      const firmName =
        getCell(row, m, "firm name (from firm)") || getCell(row, m, "firm name") || getCell(row, m, "firm");
      if (!firmName) continue;
      const firmSlug = slugify(firmName);
      const firm = await prisma.vCFirm.upsert({
        where: { slug: firmSlug },
        create: {
          firm_name: firmName,
          slug: firmSlug,
          firm_type: "VC",
        },
        update: { firm_name: firmName },
      });
      await ensureSourceLink(prisma, firm.id, meta.sourceLabel, blobHref);
      firmUpserts++;
      const title = getCell(row, m, "title");
      const email = getCell(row, m, "email");
      const bio = getCell(row, m, "bio");
      const loc = getCell(row, m, "location") || getCell(row, m, "location (metro)");
      const x = getCell(row, m, "x / twitter");
      const li = getCell(row, m, "linkedin");
      const { first, last } = splitName(investorName);
      const pData = {
        title: title?.replace(/\s+$/, "") || null,
        email: email || null,
        bio: bio || null,
        city: loc?.split(",")[0]?.trim() || null,
        x_url: normalizeWebsite(x),
        linkedin_url: normalizeLinkedIn(li),
        website_url: normalizeWebsite(getCell(row, m, "personal website / bio")),
      };
      const existing = await prisma.vCPerson.findFirst({
        where: {
          firm_id: firm.id,
          deleted_at: null,
          OR: [...(email ? [{ email }] : []), { first_name: first, last_name: last || "-" }],
        },
      });
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
      personUpserts++;
      dataRows++;
    }
  }

  return { firmUpserts, personUpserts };
}

async function loadText(urlOrPath: string): Promise<string> {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    const res = await fetch(urlOrPath, { headers: { Accept: "text/csv,text/plain,*/*" } });
    const text = await res.text();
    if (!res.ok) throw new Error(`${urlOrPath} → ${res.status}: ${text.slice(0, 200)}`);
    return text;
  }
  return readFileSync(urlOrPath, "utf8");
}

const VALID_PROFILES = new Set<SourceId>([
  "nyc_early_stage",
  "gigasheet",
  "accelerators",
  "firms_grid",
  "investors_grid",
  "early_stage_list",
]);

async function main() {
  const fetchOnly = process.env.FOUNDER_ALLY_FETCH_ONLY === "1";
  const maxRows = Math.max(1, parseInt(process.env.FOUNDER_ALLY_MAX_ROWS || "100000", 10) || 100000);
  const only = (process.env.FOUNDER_ALLY_ONLY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const singlePath = process.env.FOUNDER_ALLY_CSV_PATH?.trim();
  const outDir = join(process.cwd(), "data", "imports");
  const summary: Record<string, { firmUpserts: number; personUpserts: number; rows: number; profile: string }> = {};

  const envProfile = process.env.FOUNDER_ALLY_PROFILE?.trim();
  const singleForcedProfile =
    envProfile && VALID_PROFILES.has(envProfile as SourceId) ? (envProfile as SourceId) : undefined;

  let prisma: PrismaClient | null = null;
  const getPrisma = () => {
    if (!prisma) prisma = new PrismaClient();
    return prisma;
  };

  const runMatrix = async (label: string, text: string, blobName: string, forcedProfile?: SourceId) => {
    const matrix = parseCsv(text);
    const profile = forcedProfile ?? detectProfile(matrix[0] || []);
    if (!profile) {
      console.warn(`[${label}] Could not detect CSV profile from header: ${(matrix[0] || []).slice(0, 8).join(", ")}`);
      return;
    }
    if (only.length && !only.includes(profile)) return;

    if (fetchOnly) {
      mkdirSync(outDir, { recursive: true });
      const safe = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      writeFileSync(join(outDir, `founder-s-ally-${safe}.json`), JSON.stringify({ profile, rowCount: matrix.length - 1 }, null, 2), "utf8");
      console.log(`[${label}] fetch-only: ${profile}, ${matrix.length - 1} data rows (metadata written)`);
      return;
    }

    loadDatabaseUrl();
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set. Use FOUNDER_ALLY_FETCH_ONLY=1 to skip DB.");

    const p = getPrisma();
    const { firmUpserts, personUpserts } = await importRows(p, profile, matrix, { blobName, sourceLabel: label }, maxRows);
    summary[label] = { firmUpserts, personUpserts, rows: matrix.length - 1, profile };
    console.log(
      `[${label}] profile=${profile} firmUpserts=${firmUpserts} personUpserts=${personUpserts} (maxRows=${maxRows})`,
    );
  };

  try {
    if (singlePath) {
      const text = await loadText(singlePath);
      const blobName = process.env.FOUNDER_ALLY_BLOB_NAME?.trim() || singlePath.split("/").pop() || "import.csv";
      await runMatrix(blobName, text, blobName, singleForcedProfile);
      return;
    }

    for (const src of BUNDLED) {
      if (only.length && !only.includes(src.id)) continue;
      const url = `${RAW_BASE}/${src.rawPath}`;
      console.log(`Fetching ${src.id}…`);
      const text = await loadText(url);
      await runMatrix(src.id, text, src.blobName, src.id);
    }

    if (!fetchOnly && Object.keys(summary).length) console.log("Founder-s-ally summary:", summary);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
