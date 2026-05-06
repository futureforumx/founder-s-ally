/**
 * Export YC “universe” into local JSON (companies + optional founder enrichment).
 *
 * Companies (full coverage, no HTML scraping):
 *   GET https://yc-oss.github.io/api/companies/all.json — community mirror of YC’s Algolia index,
 *   updated daily (~5k+ launched companies). Includes isHiring, status, batch, locations, etc.
 *
 * Founders (optional — reads each public company page):
 *   Set YC_ENRICH_FOUNDERS=1 to fetch ycombinator.com/companies/{slug} and parse __NEXT_DATA__
 *   for founder names, titles, LinkedIn URLs. Rate-limit with YC_ENRICH_DELAY_MS / CONCURRENCY.
 *
 * NOT available from these sources:
 *   • Work at a Startup “operator” profiles (people job-searching / open to roles) — different site & ToS.
 *   • “Looking for a cofounder” intent — mostly Bookface (private) or ad-hoc pages; not bulk-exportable here.
 *
 * Usage:
 *   npx tsx scripts/yc-export/export-yc-universe.ts
 *   YC_EXPORT_DIR=./data/yc-export YC_ENRICH_FOUNDERS=1 YC_ENRICH_MAX=100 npx tsx scripts/yc-export/export-yc-universe.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchYcCompanyHtml, parseYcCompanyPage } from "../lib/ycCompanyHtml";
import { sleep } from "../lib/startupScraper";

const YC_OSS_ALL = "https://yc-oss.github.io/api/companies/all.json";

type YcOssCompany = {
  id?: number;
  name?: string;
  slug?: string;
  website?: string;
  batch?: string;
  status?: string;
  one_liner?: string;
  long_description?: string;
  all_locations?: string;
  team_size?: number;
  isHiring?: boolean;
  industries?: string[];
  url?: string;
  top_company?: boolean;
  nonprofit?: boolean;
  tags?: string[];
  regions?: string[];
  stage?: string;
};

type FounderExportRow = {
  company_slug: string;
  company_name_from_page?: string;
  /** From yc-oss snapshot */
  company_name_from_index?: string;
  company_batch?: string;
  company_status?: string;
  company_is_hiring?: boolean;
  founder_name: string;
  title?: string | null;
  linkedin_url?: string | null;
  /** True when listed on the YC company page (implies association with that startup). */
  listed_on_yc_company_page: boolean;
  /** Best-effort: Active company → often still involved; acquired/inactive → interpret cautiously. */
  employment_note: string;
};

function isPlausibleFounderName(name: string): boolean {
  const t = name.trim();
  if (t.length < 2 || t.length > 100) return false;
  if (/^(directory|founders?|team|apply|jobs?|about)$/i.test(t)) return false;
  return true;
}

function employmentNote(status: string | undefined): string {
  const s = (status || "").toLowerCase();
  if (s === "active") return "Company active on YC directory; founders often still operating there unless exited.";
  if (s === "acquired") return "Company acquired; founders may have moved on — verify separately.";
  if (s === "inactive" || s === "public") return `Status: ${status || "unknown"} — verify current roles separately.`;
  return "Verify current employment via LinkedIn or company site.";
}

async function enrichFounders(
  bySlug: Map<string, YcOssCompany>,
  slugs: string[],
  delayMs: number,
  concurrency: number,
): Promise<FounderExportRow[]> {
  const rows: FounderExportRow[] = [];
  const pending: Promise<void>[] = [];

  for (const slug of slugs) {
    const task = (async () => {
      await sleep(delayMs);
      const meta = bySlug.get(slug);
      try {
        const html = await fetchYcCompanyHtml(`https://www.ycombinator.com/companies/${slug}`);
        const page = parseYcCompanyPage(html, slug);
        const founders = page?.founders ?? [];
        const note = employmentNote(meta?.status);

        if (founders.length === 0) return;

        for (const f of founders) {
          if (!f.name?.trim() || !isPlausibleFounderName(f.name)) continue;
          rows.push({
            company_slug: slug,
            company_name_from_page: page?.name,
            company_name_from_index: meta?.name,
            company_batch: page?.batch ?? meta?.batch,
            company_status: page?.status ?? meta?.status,
            company_is_hiring: meta?.isHiring,
            founder_name: f.name.trim(),
            title: f.title ?? null,
            linkedin_url: f.linkedin ?? null,
            listed_on_yc_company_page: true,
            employment_note: note,
          });
        }
      } catch (e) {
        console.warn(`[yc-export] ${slug}: ${e instanceof Error ? e.message : e}`);
      }
    })();

    pending.push(task);
    if (pending.length >= concurrency) {
      await Promise.all(pending);
      pending.length = 0;
    }
  }

  if (pending.length > 0) await Promise.all(pending);
  return rows;
}

async function main(): Promise<void> {
  const outDir = process.env.YC_EXPORT_DIR?.trim() || join(process.cwd(), "data", "yc-export");
  mkdirSync(outDir, { recursive: true });

  console.log("[yc-export] Fetching yc-oss companies/all.json …");
  const res = await fetch(YC_OSS_ALL);
  if (!res.ok) throw new Error(`GET ${YC_OSS_ALL} → ${res.status}`);
  const all = (await res.json()) as YcOssCompany[];

  writeFileSync(join(outDir, "companies.all.json"), JSON.stringify(all));
  console.log(`[yc-export] Wrote ${all.length} companies → ${join(outDir, "companies.all.json")}`);

  const normalized = all.map((c) => ({
    slug: c.slug ?? "",
    name: c.name ?? "",
    batch: c.batch ?? null,
    status: c.status ?? null,
    website: c.website ?? null,
    /** Company-level hiring signal (open roles), not individual job-seeker state */
    company_is_recruiting: Boolean(c.isHiring),
    team_size: c.team_size ?? null,
    one_liner: c.one_liner ?? null,
    locations: c.all_locations ?? null,
    industries: c.industries ?? [],
    regions: c.regions ?? [],
    yc_url: c.url ?? null,
    top_company: Boolean(c.top_company),
    nonprofit: Boolean(c.nonprofit),
    stage: c.stage ?? null,
  }));

  writeFileSync(join(outDir, "companies.normalized.json"), JSON.stringify(normalized, null, 2));

  const hiringOnly = all.filter((c) => c.isHiring);
  writeFileSync(join(outDir, "companies.hiring.json"), JSON.stringify(hiringOnly, null, 2));
  console.log(`[yc-export] hiring.json: ${hiringOnly.length} companies with isHiring=true`);

  writeFileSync(
    join(outDir, "operators.placeholder.json"),
    JSON.stringify(
      {
        _note:
          "Candidate (job-seeker) profiles on WAAS are login-gated — not exported here. For Work at a Startup company pages (founders + open roles) linked to YC slugs, run: npx tsx scripts/waas-export/sync-waas-yc.ts",
        operators: [] as unknown[],
      },
      null,
      2,
    ),
  );

  if (process.env.YC_ENRICH_FOUNDERS === "1") {
    const max = parseInt(process.env.YC_ENRICH_MAX || "0", 10);
    const delayMs = parseInt(process.env.YC_ENRICH_DELAY_MS || "200", 10);
    const concurrency = parseInt(process.env.YC_ENRICH_CONCURRENCY || "4", 10);
    const bySlug = new Map(all.map((c) => [c.slug ?? "", c] as const));
    let slugs = all.map((c) => c.slug).filter((s): s is string => Boolean(s));
    if (max > 0) slugs = slugs.slice(0, max);
    console.log(`[yc-export] Enriching founders for ${slugs.length} slugs (delay=${delayMs}ms, concurrency=${concurrency}) …`);
    const founderRows = await enrichFounders(bySlug, slugs, delayMs, concurrency);
    const ndjson = founderRows.map((r) => JSON.stringify(r)).join("\n");
    writeFileSync(join(outDir, "founders.enriched.jsonl"), ndjson);
    writeFileSync(join(outDir, "founders.enriched.json"), JSON.stringify(founderRows, null, 2));
    console.log(`[yc-export] Wrote ${founderRows.length} founder rows`);
  } else {
    console.log("[yc-export] Skip founder HTML enrichment (set YC_ENRICH_FOUNDERS=1 to enable).");
  }

  console.log(`[yc-export] Done. Output: ${outDir}`);
}

main().catch((e) => {
  console.error("[yc-export] Fatal:", e);
  process.exit(1);
});
