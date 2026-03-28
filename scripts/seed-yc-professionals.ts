/**
 * YC founders → StartupProfessional (robots-safe path).
 *
 * 1) Slugs from https://www.ycombinator.com/companies/sitemap (linked from /sitemap.xml; not /companies?*).
 * 2) One GET per company: https://www.ycombinator.com/companies/{slug} — parse public meta (founders line).
 *
 * Optional file imports (no HTTP to YC):
 *   YC_PROFESSIONALS_JSON_PATH — { "professionals": [ { fullName, title, currentRole, currentStartup, ycBatch?, location?, linkedin?, source } ] }
 *   YC_COMPANIES_JSON_PATH — { "companies": [ { "name", "batch"?, "founders": ["Jane Doe"], "location"? } ] }
 *
 * Throttle: YC_REQUEST_MS_DELAY (default 150), YC_MAX_SLUGS (optional cap), YC_FETCH_CONCURRENCY (default 6).
 * Merge: PROFESSIONALS_MERGE_LOG_EVERY=250 (0 = quiet), PROFESSIONALS_AUDIT_LOG=0 to skip changelogs on bulk re-runs.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadDatabaseUrl } from "./lib/loadDatabaseUrl";
import {
  mergeStartupProfessional,
  splitFullName,
  SOURCE_PRIORITY,
  type ProfessionalIngestPayload,
} from "./lib/startupProfessionalMerge";
import { enqueueDeadLetter, toErrorMessage, toJsonPayload } from "./lib/deadLetterQueue";

/** YC often 404s custom bot UAs; use a real browser string (override with YC_FETCH_USER_AGENT). */
const YC_FETCH_UA =
  process.env.YC_FETCH_USER_AGENT?.trim() ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const SITEMAP_URL = "https://www.ycombinator.com/companies/sitemap";
const SKIP_SLUGS = new Set([
  "industry",
  "batch",
  "sitemap",
  "_metadata",
  "featured",
  "breakthrough",
  "black-founders",
  "hispanic-latino-founders",
  "women-founders",
  "founders-you-may-know",
]);

loadDatabaseUrl();
const prisma = new PrismaClient();

function fetchTextViaCurl(url: string): string {
  const out = execFileSync("curl", ["-sS", "-L", "-A", YC_FETCH_UA, url], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!out.trim()) throw new Error("empty response");
  return out;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": YC_FETCH_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (res.ok) return res.text();
  if (process.env.YC_FETCH_DISABLE_CURL === "1") {
    throw new Error(`GET ${url} → ${res.status}`);
  }
  try {
    return fetchTextViaCurl(url);
  } catch (e) {
    throw new Error(`GET ${url} → ${res.status} (fetch); curl fallback: ${e instanceof Error ? e.message : e}`);
  }
}

function parseSlugsFromSitemap(xml: string): string[] {
  const re = /<loc>https:\/\/www\.ycombinator\.com\/companies\/([^<]+)<\/loc>/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const path = m[1];
    if (path.includes("/")) continue;
    if (SKIP_SLUGS.has(path)) continue;
    out.push(path);
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function metaContent(html: string, prop: "og:description" | "og:title" | "description"): string | null {
  if (prop === "og:description" || prop === "og:title") {
    const forward = html.match(new RegExp(`property="${prop}"\\s+content="([^"]*)"`, "i"));
    const reverse = html.match(new RegExp(`content="([^"]*)"\\s+property="${prop}"`, "i"));
    const og = forward || reverse;
    if (og) return decodeEntities(og[1]);
  }
  if (prop === "description") {
    const n1 = html.match(/name="description"\s+content="([^"]*)"/i);
    const n2 = html.match(/content="([^"]*)"\s+name="description"/i);
    const n = n1 || n2;
    if (n) return decodeEntities(n[1]);
  }
  return null;
}

function parseTitleCompany(html: string): string | null {
  const t = html.match(/<title>([^<|]+)\s*[|:]/i);
  if (t) return decodeEntities(t[1].trim());
  const og = metaContent(html, "og:title");
  if (og) return decodeEntities(og.split(":")[0].trim());
  return null;
}

function parseYcBatch(html: string): string | null {
  const m = html.match(/\(YC\s+([SWFXI]\d{2})\)/i);
  return m ? m[1].toUpperCase() : null;
}

function parseFoundedLine(desc: string): { foundersRaw: string; companyFromSentence: string } | null {
  const m =
    desc.match(/Founded in \d{4} by (.+),\s*(.+?)\s+has\s+\d+\s+employees/i) ??
    desc.match(/Founded in \d{4} by (.+),\s*(.+?)\s+has\s+\d+\s+team members/i);
  if (!m) return null;
  return { foundersRaw: m[1].trim(), companyFromSentence: m[2].trim() };
}

function parseLocation(desc: string): string | null {
  const m = desc.match(/based in ([^.]+)\./i);
  return m ? m[1].trim() : null;
}

function splitFounderNames(raw: string): string[] {
  const normalized = raw.replace(/\s+and\s+/gi, ", ");
  return normalized
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCompanyHtml(html: string): ProfessionalIngestPayload[] {
  const desc = metaContent(html, "og:description") ?? metaContent(html, "description") ?? "";
  const titleCo = parseTitleCompany(html);
  const batch = parseYcBatch(html);
  const location = desc ? parseLocation(desc) : null;
  const founded = desc ? parseFoundedLine(desc) : null;
  if (!founded) return [];

  const company = founded.companyFromSentence || titleCo || "Unknown startup";
  const names = splitFounderNames(founded.foundersRaw);
  const rows: ProfessionalIngestPayload[] = [];
  for (const fullName of names) {
    const { first, last } = splitFullName(fullName);
    rows.push({
      firstName: first,
      lastName: last || "",
      fullName: fullName.replace(/\s+/g, " ").trim(),
      title: `Founder @ ${company}`,
      currentRole: "Founder",
      currentStartup: company,
      prevStartups: [],
      ycBatch: batch,
      source: "yc",
      sourcePriority: SOURCE_PRIORITY.yc,
      location,
      linkedin: null,
    });
  }
  return rows;
}

async function poolMap<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

async function mergeRows(rows: ProfessionalIngestPayload[]): Promise<{ upserted: number; errors: number }> {
  let upserted = 0;
  let errors = 0;
  let firstErr: string | null = null;
  const logEvery = Math.max(0, Number(process.env.PROFESSIONALS_MERGE_LOG_EVERY ?? "250") || 250);
  const n = rows.length;
  for (let i = 0; i < n; i++) {
    const row = rows[i]!;
    try {
      await mergeStartupProfessional(prisma, row);
      upserted++;
    } catch (e) {
      if (!firstErr) firstErr = toErrorMessage(e);
      await enqueueDeadLetter(prisma, {
        targetTable: "startup_professionals",
        failedOperation: "StartupProfessional_Merge",
        errorMessage: toErrorMessage(e),
        rawPayload: toJsonPayload(row),
      });
      errors++;
    }
    const at = i + 1;
    if (logEvery > 0 && (at % logEvery === 0 || at === n)) {
      console.log(`… merge ${at}/${n} (${upserted} ok, ${errors} err)`);
    }
  }
  if (errors > 0 && firstErr) console.warn(`[merge] first error (${errors} total): ${firstErr}`);
  return { upserted, errors };
}

function loadJsonProfessionals(path: string): ProfessionalIngestPayload[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as { professionals?: Partial<ProfessionalIngestPayload>[] };
  if (!raw.professionals?.length) throw new Error(`${path}: expected { "professionals": [...] }`);
  return raw.professionals.map((p) => {
    const full = (p.fullName ?? "").trim();
    const sp = splitFullName(full);
    const src = (p.source as string) || "yc";
    return {
      firstName: p.firstName?.trim() || sp.first,
      lastName: p.lastName?.trim() ?? sp.last,
      fullName: full,
      linkedin: p.linkedin ?? null,
      email: p.email ?? null,
      title: p.title ?? `Founder @ ${p.currentStartup ?? "Startup"}`,
      currentRole: p.currentRole ?? "Founder",
      currentStartup: (p.currentStartup ?? "").trim(),
      prevStartups: p.prevStartups ?? [],
      ycBatch: p.ycBatch ?? null,
      phMaker: p.phMaker ?? false,
      phLaunchCount: p.phLaunchCount ?? 0,
      githubHandle: p.githubHandle ?? null,
      githubStars: p.githubStars ?? 0,
      angelListId: p.angelListId ?? null,
      followers: p.followers ?? 0,
      location: p.location ?? null,
      source: src,
      sourcePriority: p.sourcePriority ?? SOURCE_PRIORITY[src] ?? SOURCE_PRIORITY.yc,
    } satisfies ProfessionalIngestPayload;
  });
}

function loadJsonCompanies(path: string): ProfessionalIngestPayload[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    companies?: Array<{ name: string; batch?: string; founders: string[]; location?: string }>;
  };
  if (!raw.companies?.length) throw new Error(`${path}: expected { "companies": [ { name, founders: [] } ] }`);
  const rows: ProfessionalIngestPayload[] = [];
  for (const c of raw.companies) {
    for (const fullName of c.founders) {
      const { first, last } = splitFullName(fullName);
      rows.push({
        firstName: first,
        lastName: last || "",
        fullName: fullName.replace(/\s+/g, " ").trim(),
        title: `Founder @ ${c.name}`,
        currentRole: "Founder",
        currentStartup: c.name,
        ycBatch: c.batch ?? null,
        location: c.location ?? null,
        source: "yc",
        sourcePriority: SOURCE_PRIORITY.yc,
      });
    }
  }
  return rows;
}

async function main() {
  const delayMs = Math.max(0, Number(process.env.YC_REQUEST_MS_DELAY ?? "150") || 150);
  const maxSlugs = process.env.YC_MAX_SLUGS ? Number(process.env.YC_MAX_SLUGS) : undefined;
  const concurrency = Math.max(1, Number(process.env.YC_FETCH_CONCURRENCY ?? "6") || 6);

  const profPath = process.env.YC_PROFESSIONALS_JSON_PATH?.trim();
  const coPath = process.env.YC_COMPANIES_JSON_PATH?.trim();

  if (profPath) {
    const rows = loadJsonProfessionals(join(process.cwd(), profPath));
    const r = await mergeRows(rows);
    console.log(`YC (JSON professionals file): upserted ${r.upserted}, errors ${r.errors}`);
    return;
  }
  if (coPath) {
    const rows = loadJsonCompanies(join(process.cwd(), coPath));
    const r = await mergeRows(rows);
    console.log(`YC (JSON companies file): upserted ${r.upserted}, errors ${r.errors}`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  console.log("Fetching YC companies sitemap…");
  const xml = await fetchText(SITEMAP_URL);
  let slugs = parseSlugsFromSitemap(xml);
  if (maxSlugs && maxSlugs > 0) slugs = slugs.slice(0, maxSlugs);
  console.log(`Parsed ${slugs.length} company slugs. Fetching pages (${concurrency} concurrent, ${delayMs}ms stagger)…`);

  const allRows: ProfessionalIngestPayload[] = [];
  let done = 0;
  await poolMap(slugs, concurrency, async (slug) => {
    await new Promise((r) => setTimeout(r, delayMs * (Math.random() * 0.5 + 0.5)));
    try {
      const html = await fetchText(`https://www.ycombinator.com/companies/${slug}`);
      const rows = parseCompanyHtml(html);
      allRows.push(...rows);
    } catch (e) {
      console.warn(`[${slug}] ${e instanceof Error ? e.message : e}`);
      await enqueueDeadLetter(prisma, {
        targetTable: "startup_professionals",
        failedOperation: "YC_Scrape",
        errorMessage: toErrorMessage(e),
        rawPayload: toJsonPayload({ slug, url: `https://www.ycombinator.com/companies/${slug}` }),
      });
    }
    done++;
    if (done % 200 === 0) console.log(`… ${done}/${slugs.length} pages`);
  });

  console.log(`Parsed ${allRows.length} founder rows from HTML. Upserting…`);
  const r = await mergeRows(allRows);
  console.log(`YC crawl: upserted ${r.upserted}, errors ${r.errors}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
