/**
 * WAAS ↔ YC company linker (separate pipeline from `scripts/yc-export/`).
 *
 * Fetches Work at a Startup company pages `/companies/{slug}` — Inertia SSR includes
 * `founders[]` plus open `jobs[]`. Slugs align with `ycombinator.com/companies/{slug}` when the startup uses WAAS.
 *
 * Prerequisites (recommended): run `npx tsx scripts/yc-export/export-yc-universe.ts` so
 * `data/yc-export/companies.normalized.json` exists (or pass YC_SNAPSHOT_URL / YC_SNAPSHOT_JSON_PATH).
 *
 * Optional: `data/yc-export/founders.enriched.json` from YC_ENRICH_FOUNDERS=1 merges founder names onto WAAS founders.
 *
 * Outputs (WAAS_EXPORT_DIR, default ./data/waas-export):
 *   waas_company_raw.jsonl   — raw WAAS payloads + HTTP status per slug attempt
 *   waas_yc_linked.json       — merged { yc_snapshot, waas_company?, founder_links?, jobs_summary }
 *   waas_yc_misses.json       — slug list with HTTP 404 or parse failure (no WAAS profile)
 *
 * Env:
 *   WAAS_SYNC_MAX — cap slugs processed (testing)
 *   WAAS_SYNC_CONCURRENCY — parallel fetches (default 4)
 *   WAAS_SYNC_DELAY_MS — delay before each request in a worker (default 120)
 *   YC_ACTIVE_ONLY=1 — process only snapshot rows with status Active (default 1)
 *   YC_SNAPSHOT_JSON_PATH — path to companies.normalized.json export
 *   YC_SNAPSHOT_URL — e.g. https://yc-oss.github.io/api/companies/all.json
 *   FOUNDERS_REFERENCE_JSON_PATH — optional founders.enriched.json from YC HTML enrich step
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fetchWaasHtml, parseInertiaDataPage } from "../lib/waasInertiaHtml";
import { sleep } from "../lib/startupScraper";

const BASE = "https://www.workatastartup.com/companies/";
const ROLE_PATHS_DEFAULT = [
  "/jobs/l/software-engineer",
  "/jobs/l/designer",
  "/jobs/l/recruiting",
  "/jobs/l/science",
  "/jobs/l/product-manager",
  "/jobs/l/operations",
  "/jobs/l/sales-manager",
  "/jobs/l/marketing",
];

type YcSnapshotRow = {
  slug: string;
  name?: string;
  batch?: string | null;
  status?: string | null;
  website?: string | null;
  company_is_recruiting?: boolean;
  yc_url?: string | null;
};

type WaasCompanyPayload = {
  name: string;
  slug: string;
  batch: string;
  description?: string;
  founders: Array<{ name?: string; linkedin?: string; bio?: string; pastCompanies?: string; avatarUrl?: string }>;
  jobs: Array<{
    id: number;
    title: string;
    location?: string;
    jobType?: string;
    salaryRange?: string | null;
    equityRange?: string | null;
  }>;
};

type FounderRef = { founder_name?: string; company_slug?: string; linkedin_url?: string | null };

type FounderLinkRow = {
  waas_name: string;
  waas_linkedin?: string | null;
  yc_export_name?: string | null;
  yc_export_linkedin?: string | null;
  match: "exact_normalized" | "linkedin" | "none";
};

type LinkedExportRow = {
  yc_slug: string;
  yc_snapshot: YcSnapshotRow | null;
  waas_http_status?: number | null;
  waas_company: WaasCompanyPayload | null;
  founder_links: FounderLinkRow[];
  jobs_summary: {
    waas_job_count: number;
    waas_roles: Array<{ job_id: number; title: string; jobType?: string; location?: string }>;
    yc_is_hiring_snapshot?: boolean;
  };
  notes: string[];
};

function normNameKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEnvInt(name: string, defaultVal: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultVal;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : defaultVal;
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function mapYcOssAllRow(row: Record<string, unknown>): YcSnapshotRow {
  return {
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    batch: (row.batch as string) ?? null,
    status: (row.status as string) ?? null,
    website: (row.website as string) ?? null,
    company_is_recruiting: Boolean(row.isHiring),
    yc_url: (row.url as string) ?? null,
  };
}

async function loadSnapshot(): Promise<YcSnapshotRow[]> {
  const snapPath = process.env.YC_SNAPSHOT_JSON_PATH?.trim();
  const snapUrl = process.env.YC_SNAPSHOT_URL?.trim();

  const defaultNormalized = join(process.cwd(), "data", "yc-export", "companies.normalized.json");
  const defaultAll = join(process.cwd(), "data", "yc-export", "companies.all.json");

  if (snapPath && existsSync(snapPath)) return loadJson<YcSnapshotRow[]>(snapPath);
  if (snapUrl) {
    const res = await fetch(snapUrl);
    if (!res.ok) throw new Error(`GET ${snapUrl} → ${res.status}`);
    const arr = (await res.json()) as Record<string, unknown>[];
    return arr.map(mapYcOssAllRow).filter((r) => r.slug);
  }
  if (existsSync(defaultNormalized)) return loadJson<YcSnapshotRow[]>(defaultNormalized);
  if (existsSync(defaultAll)) {
    return loadJson<Record<string, unknown>[]>(defaultAll).map(mapYcOssAllRow).filter((r) => r.slug);
  }

  console.error(
    `[waas-sync] No YC snapshot. Set YC_SNAPSHOT_JSON_PATH / YC_SNAPSHOT_URL or run scripts/yc-export/export-yc-universe.ts (expected ${defaultNormalized})`,
  );
  process.exit(1);
}

function loadFoundersBySlug(path: string | undefined): Map<string, FounderRef[]> {
  const map = new Map<string, FounderRef[]>();
  if (!path || !existsSync(path)) return map;
  const rows = loadJson<Array<FounderRef & Record<string, unknown>>>(path).filter(Boolean);
  for (const r of rows) {
    const slug = String(r.company_slug ?? "").trim();
    if (!slug) continue;
    const fn = typeof r.founder_name === "string" ? r.founder_name : "";
    if (!fn.trim()) continue;
    if (!map.has(slug)) map.set(slug, []);
    map.get(slug)!.push({
      founder_name: fn,
      company_slug: slug,
      linkedin_url: typeof r.linkedin_url === "string" ? r.linkedin_url : null,
    });
  }
  return map;
}

/** Collect extra company slugs that appear only on WAAS category job listings (beyond YC-active list). */
async function scrapeDiscoverySlugsFromRolePages(maxPerRole: number): Promise<Set<string>> {
  const slugs = new Set<string>();
  const rolePathsEnv = process.env.WAAS_DISCOVERY_ROLE_PATHS?.trim();
  const paths = rolePathsEnv
    ? rolePathsEnv.split(",").map((s) => s.trim())
    : ROLE_PATHS_DEFAULT.slice(0, parseEnvInt("WAAS_DISCOVERY_ROLE_PAGES", ROLE_PATHS_DEFAULT.length));

  for (const rp of paths) {
    const url = `https://www.workatastartup.com${rp.startsWith("/") ? rp : `/${rp}`}`;
    try {
      const { html } = await fetchWaasHtml(url);
      const page = parseInertiaDataPage<{ jobs?: Array<{ companySlug?: string }> }>(html);
      const jobs = page?.props?.jobs ?? [];
      for (let i = 0; i < jobs.length && i < maxPerRole; i++) {
        const sg = jobs[i]?.companySlug;
        if (sg && typeof sg === "string") slugs.add(sg.trim());
      }
    } catch {
      /* discovery best-effort */
    }
    await sleep(80);
  }
  return slugs;
}

function linkFounders(
  slug: string,
  waasCompany: WaasCompanyPayload | null,
  refs: Map<string, FounderRef[]>,
): FounderLinkRow[] {
  const ycRefs = refs.get(slug) ?? [];
  const out: FounderLinkRow[] = [];
  if (!waasCompany?.founders?.length) return out;

  for (const f of waasCompany.founders) {
    const wname = f.name?.trim() ?? "";
    if (!wname) continue;
    const wLn = (f.linkedin || "").trim().toLowerCase();
    let best: FounderRef | null = null;
    let match: FounderLinkRow["match"] = "none";

    for (const y of ycRefs) {
      const yn = normNameKey(y.founder_name || "");
      if (normNameKey(wname) === yn && yn.length > 2) {
        best = y;
        match = "exact_normalized";
        break;
      }
      const yl = String(y.linkedin_url || "").toLowerCase();
      if (wLn && yl && wLn === yl) {
        best = y;
        match = "linkedin";
        break;
      }
    }

    out.push({
      waas_name: wname,
      waas_linkedin: f.linkedin ?? null,
      yc_export_name: best?.founder_name ?? null,
      yc_export_linkedin: best?.linkedin_url ?? null,
      match,
    });
  }
  return out;
}

async function main(): Promise<void> {
  const outDir = process.env.WAAS_EXPORT_DIR?.trim() || join(process.cwd(), "data", "waas-export");
  mkdirSync(outDir, { recursive: true });

  const activeOnly = process.env.YC_ACTIVE_ONLY !== "0";
  const max = parseEnvInt("WAAS_SYNC_MAX", 0);
  const concurrency = parseEnvInt("WAAS_SYNC_CONCURRENCY", 4);
  const delayMs = parseEnvInt("WAAS_SYNC_DELAY_MS", 120);
  const discoverExtra = process.env.WAAS_DISCOVERY === "1";
  const maxPerDiscovery = parseEnvInt("WAAS_DISCOVERY_TOP_JOBS_PER_ROLE", 80);

  const snapshotFull = (await loadSnapshot()).filter((r) => r.slug && typeof r.slug === "string");
  const snapshotBySlug = new Map(snapshotFull.map((r) => [r.slug, r]));

  const baseRows = activeOnly
    ? snapshotFull.filter((r) => String(r.status || "").toLowerCase() === "active")
    : [...snapshotFull];

  const workMap = new Map<string, YcSnapshotRow>();
  for (const r of baseRows) workMap.set(r.slug, r);

  if (discoverExtra) {
    console.log("[waas-sync] Discovery: scanning WAAS role listing pages for company slugs…");
    const extra = await scrapeDiscoverySlugsFromRolePages(maxPerDiscovery);
    let added = 0;
    for (const sg of extra) {
      if (workMap.has(sg)) continue;
      const snapRow = snapshotBySlug.get(sg);
      workMap.set(
        sg,
        snapRow ?? {
          slug: sg,
          name: sg,
          batch: null,
          status: "discovered_waas_only",
          website: null,
          company_is_recruiting: true,
          yc_url: `https://www.ycombinator.com/companies/${sg}`,
        },
      );
      added++;
    }
    console.log(`[waas-sync] Discovery added ${added} slug(s) from WAAS job category pages`);
  }

  let workList = [...workMap.values()];

  const founderRefsPath = process.env.FOUNDERS_REFERENCE_JSON_PATH?.trim();
  const founderRefs =
    founderRefsPath && existsSync(founderRefsPath)
      ? loadFoundersBySlug(founderRefsPath)
      : loadFoundersBySlug(join(process.cwd(), "data", "yc-export", "founders.enriched.json"));

  if (max > 0) workList = workList.slice(0, max);

  console.log(`[waas-sync] Processing ${workList.length} slug(s); concurrency=${concurrency}; activeOnly=${activeOnly}`);

  const linked: LinkedExportRow[] = [];
  const misses: Array<{ slug: string; http: number | null; reason: string }> = [];
  const rawRecords: unknown[] = [];

  let idx = 0;
  const pending: Promise<void>[] = [];

  for (const row of workList) {
    const slug = row.slug;
    const task = (async () => {
      await sleep(delayMs);
      const url = `${BASE}${slug}`;
      const notes: string[] = [];
      let httpStatus: number | null = null;
      let waasCompany: WaasCompanyPayload | null = null;

      try {
        const { html, status } = await fetchWaasHtml(url);
        httpStatus = status;

        if (status !== 200) {
          rawRecords.push({ slug, http_status: status, url });
          misses.push({ slug, http: status, reason: `HTTP ${status}` });
          linked.push({
            yc_slug: slug,
            yc_snapshot: row,
            waas_http_status: status,
            waas_company: null,
            founder_links: [],
            jobs_summary: { waas_job_count: 0, waas_roles: [], yc_is_hiring_snapshot: row.company_is_recruiting === true },
            notes: [...notes, status === 404 ? "No WAAS company profile" : "Non-200 from WAAS"],
          });
          return;
        }

        const page = parseInertiaDataPage<{ company?: WaasCompanyPayload }>(html);
        if (page?.component !== "jobs/public/pages/CompanyPage" || !page.props?.company) {
          rawRecords.push({ slug, http_status: status, url, inertia_component: page?.component ?? null });
          misses.push({ slug, http: status, reason: "inertia_parse_or_wrong_component" });
          notes.push(`Component ${page?.component ?? "?"} missing company`);
          linked.push({
            yc_slug: slug,
            yc_snapshot: row,
            waas_http_status: status,
            waas_company: null,
            founder_links: [],
            jobs_summary: { waas_job_count: 0, waas_roles: [], yc_is_hiring_snapshot: row.company_is_recruiting === true },
            notes,
          });
          return;
        }

        waasCompany = page.props.company;
        const fj = linkFounders(slug, waasCompany, founderRefs);

        const waas_roles = (waasCompany.jobs ?? []).map((j) => ({
          job_id: j.id,
          title: j.title,
          jobType: j.jobType,
          location: j.location,
        }));

        linked.push({
          yc_slug: slug,
          yc_snapshot: row,
          waas_http_status: status,
          waas_company: waasCompany,
          founder_links: fj,
          jobs_summary: {
            waas_job_count: waas_roles.length,
            waas_roles,
            yc_is_hiring_snapshot: row.company_is_recruiting === true,
          },
          notes,
        });

        rawRecords.push({ slug, http_status: status, url, company: waasCompany });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        rawRecords.push({ slug, http_status: httpStatus, url: `${BASE}${slug}`, error: msg });
        misses.push({ slug, http: httpStatus, reason: msg });
        linked.push({
          yc_slug: slug,
          yc_snapshot: row,
          waas_http_status: httpStatus,
          waas_company: null,
          founder_links: [],
          jobs_summary: { waas_job_count: 0, waas_roles: [], yc_is_hiring_snapshot: row.company_is_recruiting === true },
          notes: [...notes, msg],
        });
      }
    })();

    pending.push(task);
    if (pending.length >= concurrency) {
      await Promise.all(pending);
      pending.length = 0;
    }
  }

  if (pending.length) await Promise.all(pending);

  const hits = linked.filter((r) => r.waas_company);
  writeFileSync(join(outDir, "waas_company_raw.jsonl"), rawRecords.map((o) => JSON.stringify(o)).join("\n"));
  writeFileSync(join(outDir, "waas_yc_linked.json"), JSON.stringify(linked, null, 2));
  writeFileSync(join(outDir, "waas_yc_misses.json"), JSON.stringify(misses, null, 2));

  console.log(`[waas-sync] Hits: ${hits.length}; misses: ${misses.length}`);
  console.log(`[waas-sync] Wrote JSON to ${outDir}`);
}

main().catch((e) => {
  console.error("[waas-sync] Fatal:", e);
  process.exit(1);
});
