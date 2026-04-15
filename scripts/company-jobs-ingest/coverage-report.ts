/**
 * Coverage stats for `company_jobs` + ingestion hints (requires DATABASE_URL).
 *
 *   npm run company-jobs:coverage
 *
 * Optional:
 *   COMPANY_JOBS_COVERAGE_WRITE=1  — write snapshot to .cache/company-jobs-coverage-snapshot.json
 *   (includes per-org active counts for win detection on the next run)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SNAPSHOT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.cache/company-jobs-coverage-snapshot.json",
);

function pct(n: number, d: number): number {
  if (!d || !Number.isFinite(d)) return 0;
  return Math.round((10000 * n) / d) / 100;
}

type Json = Record<string, unknown> | null;

type OrgMeasurementRow = {
  organization_id: string;
  canonical_name: string | null;
  website: string | null;
  website_domain: string | null;
  source_detection_summary: string;
  active_jobs_count: number;
  latest_run_status: string | null;
  ats_hint_count: number;
  sort: {
    /** More new jobs = higher impact win */
    impact: number;
    /** More ATS hints but zero jobs = stronger parser-gap signal */
    parser_signal: number;
    /** More active jobs while latest failed = more stale exposure */
    stale_exposure: number;
  };
};

function safeTrim(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t.length ? t : null;
}

function domainFromWebsite(website: string | null): string | null {
  if (!website) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    return u.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

function atsHintCountFromJson(json: Json): number {
  if (!json || typeof json !== "object") return 0;
  const hints = (json as { atsHints?: unknown }).atsHints;
  return Array.isArray(hints) ? hints.length : 0;
}

function summarizeSourceDetection(json: Json): string {
  if (!json || typeof json !== "object") {
    return "(no detection payload on latest run)";
  }
  const o = json as {
    atsHints?: { kind?: string; token?: string }[];
    careersPageUrl?: string;
    rootUrl?: string;
    probeErrors?: { url?: string; message?: string }[];
  };
  const parts: string[] = [];
  if (Array.isArray(o.atsHints) && o.atsHints.length) {
    parts.push(
      o.atsHints
        .map((h) => `${h.kind ?? "?"}:${h.token ?? "?"}`)
        .slice(0, 8)
        .join("; ") + (o.atsHints.length > 8 ? ` (+${o.atsHints.length - 8} more)` : ""),
    );
  } else {
    parts.push("no ATS hints");
  }
  if (o.careersPageUrl) parts.push(`careers=${String(o.careersPageUrl).slice(0, 120)}`);
  else if (o.rootUrl) parts.push(`root=${String(o.rootUrl).slice(0, 80)}`);
  if (Array.isArray(o.probeErrors) && o.probeErrors.length) {
    parts.push(`probe_errors=${o.probeErrors.length}`);
  }
  return parts.join(" | ");
}

function loadPreviousOrgIndex(previous: unknown): Record<string, number> | null {
  if (!previous || typeof previous !== "object") return null;
  const p = previous as {
    org_index?: { active_count_by_org_id?: Record<string, number> };
  };
  const m = p.org_index?.active_count_by_org_id;
  if (m && typeof m === "object") return m;
  return null;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const activeBySource = await prisma.$queryRaw<{ source_type: string; n: bigint }[]>`
    SELECT source_type::text AS source_type, COUNT(*)::bigint AS n
    FROM company_jobs
    WHERE is_active = true
    GROUP BY source_type
    ORDER BY source_type
  `;

  const rowCounts = await prisma.$queryRaw<
    { active_jobs: bigint; inactive_jobs: bigint; orgs_with_active: bigint }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE is_active)::bigint AS active_jobs,
      COUNT(*) FILTER (WHERE NOT is_active)::bigint AS inactive_jobs,
      COUNT(DISTINCT organization_id) FILTER (WHERE is_active)::bigint AS orgs_with_active
    FROM company_jobs
  `;

  const liveOrgsWithWebsite = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n
    FROM organizations o
    WHERE o.ready_for_live = true
      AND o.website IS NOT NULL
      AND length(trim(o.website::text)) > 3
  `;

  const liveOrgsZeroActive = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n
    FROM organizations o
    WHERE o.ready_for_live = true
      AND o.website IS NOT NULL
      AND length(trim(o.website::text)) > 3
      AND NOT EXISTS (
        SELECT 1 FROM company_jobs j
        WHERE j.organization_id = o.id AND j.is_active = true
      )
  `;

  const orgsWithWebsiteSourcedJob = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT organization_id)::bigint AS n
    FROM company_jobs
    WHERE is_active = true AND source_type = 'WEBSITE'
  `;

  const orgsWithAnyRun = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT organization_id)::bigint AS n
    FROM company_job_ingestion_runs
  `;

  const latestRunHints = await prisma.$queryRaw<
    {
      orgs_in_latest: bigint;
      latest_success: bigint;
      latest_success_with_ats: bigint;
      latest_success_no_ats: bigint;
      latest_not_success: bigint;
    }[]
  >`
    WITH latest AS (
      SELECT DISTINCT ON (organization_id)
        organization_id,
        status,
        coalesce(
          jsonb_array_length(coalesce(source_detection_json->'atsHints', '[]'::jsonb)),
          0
        ) AS hint_count
      FROM company_job_ingestion_runs
      ORDER BY organization_id, started_at DESC
    )
    SELECT
      COUNT(*)::bigint AS orgs_in_latest,
      COUNT(*) FILTER (WHERE status = 'success')::bigint AS latest_success,
      COUNT(*) FILTER (WHERE status = 'success' AND hint_count > 0)::bigint AS latest_success_with_ats,
      COUNT(*) FILTER (WHERE status = 'success' AND hint_count = 0)::bigint AS latest_success_no_ats,
      COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'success')::bigint AS latest_not_success
    FROM latest
  `;

  const orgRows = await prisma.$queryRaw<
    {
      organization_id: string;
      canonical_name: string | null;
      website: string | null;
      active_jobs_count: bigint;
      latest_run_status: string | null;
      source_detection_json: unknown;
    }[]
  >`
    SELECT
      o.id::text AS organization_id,
      NULLIF(trim(o."canonicalName"::text), '') AS canonical_name,
      NULLIF(trim(o.website::text), '') AS website,
      (
        SELECT COUNT(*)::bigint
        FROM company_jobs j
        WHERE j.organization_id = o.id AND j.is_active = true
      ) AS active_jobs_count,
      lr.status AS latest_run_status,
      lr.source_detection_json AS source_detection_json
    FROM organizations o
    LEFT JOIN LATERAL (
      SELECT r.status, r.source_detection_json
      FROM company_job_ingestion_runs r
      WHERE r.organization_id = o.id
      ORDER BY r.started_at DESC
      LIMIT 1
    ) lr ON true
    WHERE o.ready_for_live = true
      AND o.website IS NOT NULL
      AND length(trim(o.website::text)) > 3
  `;

  const liveDen = Number(liveOrgsWithWebsite[0]?.n ?? 0n);
  const zeroActive = Number(liveOrgsZeroActive[0]?.n ?? 0n);
  const hints = latestRunHints[0];
  const latestSuccess = Number(hints?.latest_success ?? 0n);
  const latestWithAts = Number(hints?.latest_success_with_ats ?? 0n);
  const latestNoAts = Number(hints?.latest_success_no_ats ?? 0n);

  const report = {
    activeBySource: Object.fromEntries(activeBySource.map((r) => [r.source_type, Number(r.n)])),
    rowCounts: {
      active_jobs: Number(rowCounts[0]?.active_jobs ?? 0n),
      inactive_jobs: Number(rowCounts[0]?.inactive_jobs ?? 0n),
      orgs_with_active: Number(rowCounts[0]?.orgs_with_active ?? 0n),
    },
    live_orgs_with_website: liveDen,
    live_orgs_zero_active_jobs: zeroActive,
    orgs_with_any_ingest_run: Number(orgsWithAnyRun[0]?.n ?? 0n),
    orgs_with_active_website_sourced_jobs: Number(orgsWithWebsiteSourcedJob[0]?.n ?? 0n),
    latest_run_per_org: {
      orgs_with_a_run_row: Number(hints?.orgs_in_latest ?? 0n),
      latest_run_is_success: latestSuccess,
      latest_success_had_ats_hints: latestWithAts,
      latest_success_no_ats_hints: latestNoAts,
      latest_run_not_success: Number(hints?.latest_not_success ?? 0n),
    },
    percentages: {
      live_with_zero_active_jobs: pct(zeroActive, liveDen),
      live_with_any_active_job: pct(Number(rowCounts[0]?.orgs_with_active ?? 0n), liveDen),
      latest_success_run_with_ats_detected:
        latestSuccess > 0 ? pct(latestWithAts, latestSuccess) : null,
      latest_success_run_website_only_detection:
        latestSuccess > 0 ? pct(latestNoAts, latestSuccess) : null,
      live_with_website_sourced_active_jobs: pct(
        Number(orgsWithWebsiteSourcedJob[0]?.n ?? 0n),
        liveDen,
      ),
    },
    source_type_share_of_active_jobs: (() => {
      const total = Number(rowCounts[0]?.active_jobs ?? 0n);
      const o: Record<string, number> = {};
      for (const r of activeBySource) {
        o[r.source_type] = pct(Number(r.n), total || 1);
      }
      return o;
    })(),
  };

  const activeCountByOrgId: Record<string, number> = {};
  const measurements: OrgMeasurementRow[] = [];

  for (const r of orgRows) {
    const active = Number(r.active_jobs_count);
    activeCountByOrgId[r.organization_id] = active;
    const sd = (r.source_detection_json as Json) ?? null;
    const hintCount = atsHintCountFromJson(sd);
    const website = safeTrim(r.website);
    measurements.push({
      organization_id: r.organization_id,
      canonical_name: safeTrim(r.canonical_name),
      website,
      website_domain: domainFromWebsite(website),
      source_detection_summary: summarizeSourceDetection(sd),
      active_jobs_count: active,
      latest_run_status: r.latest_run_status,
      ats_hint_count: hintCount,
      sort: {
        impact: active,
        parser_signal: active === 0 ? hintCount : 0,
        stale_exposure: r.latest_run_status === "failed" ? active : 0,
      },
    });
  }

  let previous: unknown = null;
  try {
    previous = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
  } catch {
    /* no snapshot */
  }

  const prevIndex = loadPreviousOrgIndex(previous);

  const highest_impact_wins: OrgMeasurementRow[] = [];
  if (prevIndex) {
    for (const m of measurements) {
      const prev = prevIndex[m.organization_id];
      if (prev === undefined) continue;
      if (prev === 0 && m.active_jobs_count > 0) {
        highest_impact_wins.push(m);
      }
    }
    highest_impact_wins.sort((a, b) => b.sort.impact - a.sort.impact || (b.ats_hint_count - a.ats_hint_count));
  }

  const likely_parser_gaps: OrgMeasurementRow[] = [];
  for (const m of measurements) {
    if (
      m.latest_run_status === "success" &&
      m.active_jobs_count === 0 &&
      m.ats_hint_count > 0
    ) {
      likely_parser_gaps.push(m);
    }
  }
  likely_parser_gaps.sort(
    (a, b) => b.sort.parser_signal - a.sort.parser_signal || (a.canonical_name ?? "").localeCompare(b.canonical_name ?? ""),
  );

  const stale_after_failed_latest: OrgMeasurementRow[] = [];
  for (const m of measurements) {
    if (m.latest_run_status === "failed" && m.active_jobs_count > 0) {
      stale_after_failed_latest.push(m);
    }
  }
  stale_after_failed_latest.sort(
    (a, b) => b.sort.stale_exposure - a.sort.stale_exposure || (a.canonical_name ?? "").localeCompare(b.canonical_name ?? ""),
  );

  const likely_source_coverage_gaps: OrgMeasurementRow[] = [];
  for (const m of measurements) {
    if (
      m.latest_run_status === "success" &&
      m.active_jobs_count === 0 &&
      m.ats_hint_count === 0
    ) {
      likely_source_coverage_gaps.push(m);
    }
  }
  likely_source_coverage_gaps.sort(
    (a, b) =>
      (a.canonical_name ?? "").localeCompare(b.canonical_name ?? "") ||
      (a.organization_id ?? "").localeCompare(b.organization_id ?? ""),
  );

  const interpretation = {
    highest_impact_wins:
      "Orgs that had **0** active indexed jobs in the **previous** snapshot and now have **>0**. Requires `COMPANY_JOBS_COVERAGE_WRITE=1` at least once before this run. Sort: `sort.impact` desc = most new active rows.",
    likely_parser_gaps:
      "**Latest** ingest succeeded, **ATS hints were stored**, but **zero** active jobs — ATS fetch or merge likely failed, or listings empty while board mis-detected. Sort: `sort.parser_signal` = ATS hint count.",
    stale_after_failed_latest:
      "**Latest** run **failed** but **active** job rows still exist (last good index). Sort: `sort.stale_exposure` desc = most stale rows at risk.",
    likely_source_coverage_gaps:
      "**Latest** run **success**, **no ATS hints**, **zero** jobs — careers URL wrong, SPA shell, or site uses an unsupported ATS. Sort: company name for triage lists.",
  };

  const measurement = {
    notes: prevIndex
      ? null
      : "No `org_index` in previous snapshot — `highest_impact_wins` is empty until you run once with COMPANY_JOBS_COVERAGE_WRITE=1, then ingest, then run coverage again.",
    org_count_in_measurement: measurements.length,
    sort_hints: {
      wins: "sort.impact (active_jobs_count) descending",
      parser_gaps: "sort.parser_signal (ats_hint_count when zero jobs) descending",
      stale: "sort.stale_exposure (active count when latest=failed) descending",
      source_gaps: "canonical_name ascending",
    },
    highest_impact_wins,
    likely_parser_gaps,
    stale_after_failed_latest,
    likely_source_coverage_gaps,
    interpretation,
  };

  const fullSnapshot = {
    ...report,
    org_index: {
      generated_at: new Date().toISOString(),
      active_count_by_org_id: activeCountByOrgId,
    },
  };

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        report,
        measurement,
        previousSnapshot: previous,
        meta: {
          snapshot_path: SNAPSHOT_PATH,
          had_previous_org_index: prevIndex != null,
        },
      },
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );

  if (process.env.COMPANY_JOBS_COVERAGE_WRITE === "1") {
    await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
    await writeFile(SNAPSHOT_PATH, JSON.stringify(fullSnapshot, null, 2), "utf8");
    // eslint-disable-next-line no-console
    console.error(`[company-jobs:coverage] wrote snapshot → ${SNAPSHOT_PATH}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
