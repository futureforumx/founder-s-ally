# Company jobs ingestion

Server-side pipeline: discover careers pages and ATS embeds from each organization’s `website`, fetch structured listings (Ashby, Greenhouse, Lever) or fall back to same-origin job links on the careers page, normalize, dedupe (ATS preferred over website), and **upsert** into `company_jobs`. The Network UI reads **only** from Supabase (`company_jobs`); it does not scrape on render.

## 11. Schema audit (before this feature)

- Canonical companies live in **`public.organizations`** (UUID `id`, `website`, `ready_for_live`, etc.).
- Prisma already models funding/intel tables; there was **no** `company_jobs` (or job-ingestion) table in `schema.prisma` prior to this work.

## 12. Proposed schema changes (implemented)

| Table | Purpose |
|-------|---------|
| **`company_jobs`** | Normalized postings per `organization_id`, with `source_type` enum (`WEBSITE`, `ASHBY`, `GREENHOUSE`, `LEVER`), apply URL, optional comp/location/employment fields, `dedupe_key` + `@@unique([organizationId, dedupeKey])`, lifecycle `is_active`, `first_seen_at`, `last_seen_at`, `raw_json`. |
| **`company_job_ingestion_runs`** | One row per ingest attempt: status, counts, optional `source_detection_json` (careers URL, ATS hints, probe errors). |

Prisma: `CompanyJob`, `CompanyJobIngestionRun`, enum `CompanyJobSourceType`. SQL: `prisma/migrations/20260416190000_company_jobs/migration.sql`. RLS (anon/authenticated `SELECT`): `supabase/migrations/20260416193000_company_jobs_anon_select.sql`.

## 13. Source detection

`detect.ts` builds the site origin from `organizations.website`, probes common paths (`/careers`, `/jobs`, …), and parses HTML (plus homepage) with Cheerio for:

- `jobs.ashbyhq.com/{board}`
- `boards.greenhouse.io/{token}` / `job-boards.greenhouse.io/{token}`
- `jobs.lever.co/{site}`
- Inline hints: `boards-api.greenhouse.io/v1/boards/{token}`, `api.ashbyhq.com/posting-api/job-board/{board}`, `api.lever.co/v0/postings/{site}`

Failures are recorded in `probeErrors` on the detection object and persisted into the run’s `source_detection_json`.

## 14. ATS handlers

| Provider | Module | Endpoint |
|----------|--------|----------|
| Ashby | `ats/ashby.ts` | `GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` |
| Greenhouse | `ats/greenhouse.ts` | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs` |
| Lever | `ats/lever.ts` | `GET https://api.lever.co/v0/postings/{site}?mode=json` |

## 15. Website fallback

`website/fallback.ts` loads the resolved careers URL and collects **same-origin** links whose paths look like job postings (`/jobs/`, `/job/`, etc.). It only fills fields we can observe (title from anchor text, apply URL, optional rough location from surrounding text). Missing fields stay null.

## 16. Ingestion / refresh job

- **CLI:** `scripts/company-jobs-ingest/run.ts` (npm scripts below).
- **Scheduled:** `.github/workflows/company-jobs-ingest.yml` (daily + `workflow_dispatch`).
- **Idempotency:** `upsert` on `(organization_id, dedupe_key)`; `last_seen_at` refreshed on each sighting; rows not seen in the current run are marked `is_active = false`.

## 17. UI

- **`FounderDetailPanel`**: **Jobs** tab after **Investors** when `organizationId` is passed (directory company rows).
- **`CommunityView`**: passes `organizationId` from `selectedFounder._firmId` when `category === "company"` and UUID.
- **`OrganizationProfile`**: “Open roles” card reuses `JobsTab`.
- Data: `useCompanyJobs` → `supabasePublicDirectory.from("company_jobs")` (+ last successful run timestamp from `company_job_ingestion_runs`).

## Coverage report (Postgres)

After you have migrated tables and some ingest history:

```bash
npm run company-jobs:coverage
```

The stdout JSON has three top-level parts:

1. **`report`** — unchanged aggregate shape: `activeBySource`, `rowCounts`, `percentages`, `source_type_share_of_active_jobs`, etc.
2. **`measurement`** — per-organization rows for triage (see buckets below).
3. **`previousSnapshot`** — last written snapshot file (if any), for diff context.

### Production command

From a machine that can reach Postgres (replace with your connection string or use `sslmode=require` as needed):

```bash
cd /path/to/VEKTA-APP
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require'
npm run company-jobs:coverage
```

Establish a baseline, run ingest, then measure again:

```bash
export DATABASE_URL='postgresql://…'
COMPANY_JOBS_COVERAGE_WRITE=1 npm run company-jobs:coverage   # writes .cache/company-jobs-coverage-snapshot.json
npm run company-jobs:ingest                                     # or your production refresh job
npm run company-jobs:coverage                                   # prints wins vs previous snapshot
```

### `measurement` buckets (interpretation)

| Key | Meaning | Sort / priority |
|-----|---------|-----------------|
| **`highest_impact_wins`** | Orgs with **previous** snapshot `active_count = 0` and **now** `active_jobs_count > 0`. Empty until you have run once with `COMPANY_JOBS_COVERAGE_WRITE=1`. | **`sort.impact`** desc = most new active jobs. |
| **`likely_parser_gaps`** | Latest run **`success`**, **ATS hints present**, but **0** active jobs — board detected but fetch/parse/merge likely wrong. | **`sort.parser_signal`** desc = more hints with still zero jobs. |
| **`stale_after_failed_latest`** | Latest run **`failed`** but **active jobs > 0** — UI may show stale listings. | **`sort.stale_exposure`** desc = more rows at risk. |
| **`likely_source_coverage_gaps`** | Latest run **`success`**, **no ATS hints**, **0** jobs — wrong careers URL, SPA-only shell, or unsupported ATS. | Sorted by **company name** for manual triage. |

`measurement.interpretation` repeats the same text in JSON for tooling. If `measurement.notes` is set, the previous snapshot had no `org_index` (upgrade: run once with `WRITE=1`).

### Sample output shape (truncated)

```json
{
  "report": {
    "percentages": {
      "live_with_zero_active_jobs": 62.4,
      "latest_success_run_with_ats_detected": 41.2
    },
    "activeBySource": { "ASHBY": 120, "GREENHOUSE": 340, "WEBSITE": 89 }
  },
  "measurement": {
    "notes": null,
    "highest_impact_wins": [
      {
        "organization_id": "uuid…",
        "canonical_name": "ExampleCo",
        "website": "https://example.com",
        "website_domain": "example.com",
        "source_detection_summary": "GREENHOUSE:exampleco | careers=https://example.com/careers",
        "active_jobs_count": 14,
        "latest_run_status": "success",
        "ats_hint_count": 1,
        "sort": { "impact": 14, "parser_signal": 0, "stale_exposure": 0 }
      }
    ],
    "likely_parser_gaps": [],
    "stale_after_failed_latest": [],
    "likely_source_coverage_gaps": []
  },
  "meta": { "snapshot_path": "…/.cache/company-jobs-coverage-snapshot.json", "had_previous_org_index": true }
}
```

Snapshot file (when `WRITE=1`) = `{ ...report, org_index: { generated_at, active_count_by_org_id } }` so the **next** run can compute `highest_impact_wins`.

## Playwright (SPA careers) — ingest only

When `COMPANY_JOBS_PLAYWRIGHT` is **not** `0`, the worker may load careers/home URLs with headless Chromium if the static HTML looks like an SPA shell and ATS detection or website parsing found nothing. CI installs browsers in `.github/workflows/company-jobs-ingest.yml`. The Vite app never imports Playwright.

## 18. Local test command

```bash
# Apply migrations to local DB, then dry-run (no writes)
npx prisma migrate dev
COMPANY_JOBS_DRY_RUN=1 COMPANY_JOBS_ORG_ID='<org-uuid>' npm run company-jobs:ingest:dry
```

Single-org **write** test (requires real `DATABASE_URL` + migrated DB):

```bash
COMPANY_JOBS_ORG_ID='<org-uuid>' npm run company-jobs:ingest
```

## 19. Production refresh command

Same as ingest (typically from CI or a secure runner):

```bash
npx prisma migrate deploy
npm run company-jobs:ingest
```

Optional env:

| Variable | Meaning |
|----------|---------|
| `COMPANY_JOBS_ORG_ID` | If set, only that organization. |
| `COMPANY_JOBS_LIMIT` | Max orgs per batch (default `40`, or `1` when `ORG_ID` set). |
| `COMPANY_JOBS_INCLUDE_NOT_LIVE` | `1` = ignore `ready_for_live` filter (batch only). |
| `COMPANY_JOBS_DRY_RUN` | `1` = no DB writes. |

## 20. Sample companies tested & sample rows

**Recommended manual checks** (replace UUIDs with real `organizations.id` values from your project):

1. **Ashby (public API)** — any org whose careers page links to `jobs.ashbyhq.com/{slug}` (e.g. Ashby’s own board slug `ashby`). After ingest you should see `source_type = ASHBY`, non-null `external_job_id`, rich `location_type` / `employment_type` when the API provides them.
2. **Greenhouse** — org whose site links `boards.greenhouse.io/{token}` (e.g. consumer tech companies using Greenhouse). Expect `source_type = GREENHOUSE`, `absolute_url` mapped to `apply_url`.
3. **Website-only** — org with HTML careers page but no ATS links; expect a smaller row set with `source_type = WEBSITE` and mostly null structured fields except title/apply URL.

Example **expected** row shape (illustrative):

```json
{
  "source_type": "ASHBY",
  "title": "Engineer Who Can Design, Americas",
  "department": "Engineering",
  "location": "Remote - North to South America",
  "location_type": "Remote",
  "employment_type": "FullTime",
  "apply_url": "https://jobs.ashbyhq.com/ashby/<uuid>/application",
  "is_active": true
}
```

## Extending

Add a new ATS by introducing `ats/<name>.ts`, extending `AtsHint` / `CompanyJobSourceType` (DB enum + migration), and wiring `ingest.ts` + `detect.ts`.
