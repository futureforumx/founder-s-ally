# Alexandria enrichment

Enriches EXISTING Vekta records (firms, investors, companies, founders, operators) through Firecrawl
Alexandria. It never creates a parallel directory, never changes IDs/FKs, and every run is a dry run
unless explicitly told otherwise.

Code: `src/lib/alexandria/*` · CLIs: `scripts/alexandria-enrichment/*` · Migration:
`supabase/migrations/20261026120000_alexandria_enrichment.sql` · Admin report:
`supabase/functions/admin-enrichment-report`.

## Entity to table map

| Entity   | Table              | Notes |
|----------|--------------------|-------|
| firm     | `firm_records`     | |
| investor | `firm_investors`   | individual investors |
| company  | `startups`         | |
| founder  | `startup_founders` | |
| operator | `operator_profiles`| |

Column lists are taken from `src/integrations/supabase/types.ts`, not from Prisma (only a partial mirror).

## Reused vs new tables

Reused (CHECK constraints widened, nullable columns added, nothing dropped):
`enrichment_field_provenance`, `enrichment_candidate_values`, `enrichment_match_failures`,
`enrichment_scrape_runs`, `enrichment_scrape_checkpoints`, `enrichment_review_queue`
(new enum label `alexandria_identity_match`), `firm_recent_deals`.

New (service_role-only RLS): `alexandria_enrichment_state` (per-record status, last run, refresh
bookkeeping), `alexandria_credit_ledger` (one row per request, unique `request_id`),
`alexandria_provider_cache` (30-day response cache), `alexandria_enrichment_changes` (before/after log
used for rollback). `alexandria_enrichment_report(p_since)` returns aggregates only, never values.

## Relationships

- WORKS_AT / FOUNDED reuse existing FKs on the person tables. There is no operator-to-company join table; none is created.
- INVESTED_IN (firm to company) goes to `firm_recent_deals`. It is firm-level only: deals are never attributed to individual investors. Claims are held for review until the provider's nested shape is trusted (see below).
- CO_INVESTED_WITH is stored in the existing `co_investor_patterns` field (union merge, no removals).
- BOARD_MEMBER_OF (`board_seats`) and `prior_exits` are review-only: never auto-written.
- Association is not a warm-intro path; nothing here computes or implies one.
- Caveat: `firm_recent_deals.firm_id` has differing FK targets across history; existing scripts write `firm_records.id`, and so does this pipeline.

## Pipeline

1. Select records (incomplete / stale / high-value investor matches first).
2. Identity resolution: domain/website or LinkedIn first, then normalized name plus corroboration. Score >= .92 high, >= .85 medium, .60-.85 ambiguous (review queue, no spend), < .60 no match. Existing duplicates are ambiguous and cost nothing.
3. Waterfall, cheapest first: cache, Fireround, FullEnrich, then PDL/Apollo only if material fields remain and strong identifiers exist. Data Legion only if explicitly selected. Web tier (`--allow-web-research`) last.
4. Map responses to facts, score confidence, decide per field. Only high-confidence explicit facts auto-apply; medium goes to `enrichment_review_queue`; low is recorded as a candidate and never applied. Manual values are never overwritten; monotonic current-state fields (e.g. `total_raised_usd`, `last_round_date`) may advance; multi-value fields are union-merged.
5. Write: change log first, then a read-compare-write update (skips a field if it changed since read). Provenance (source, timestamp, verification, confidence, batch id) per decision.

Residual risk: read-compare-write is not a DB transaction; a concurrent writer can slip between compare and write within one statement window. The compare narrows this to a very small window and the change log makes it detectable.

## Budgets and safety

Reserve-before-call across job, daily, per-provider and per-record scopes; stops before exceeding any cap.
Deterministic request ids make retries idempotent (`requestId` replay). Retries only on 408/429/5xx/network
errors with exponential backoff and jitter. A terms-required error blocks that provider for the run;
terms are NEVER accepted automatically (Apollo needs an org admin at
https://www.firecrawl.dev/app/settings?tab=data-sources).

Refresh intervals (override with `ALEXANDRIA_REFRESH_DAYS_<GROUP>`): funding/deals 1d, roles 30d,
criteria 30-60d, company growth 30d, founder/operator profiles 60-90d, firmographics 90-180d.
Nothing is scheduled; `.github/workflows/alexandria-refresh.yml` is `workflow_dispatch` only.

## Run modes

| Mode | Flags | Spends credits | Writes |
|------|-------|----------------|--------|
| Dry run (default) | none | no | no |
| Lookup-only pilot | `--allow-billable` | yes (cached) | no, shows diff |
| Apply | `--allow-billable --no-dry-run --apply` | cache replay is free | high-confidence fields |

Each of `--allow-billable`, `--apply`, `--force-refresh`, `--allow-contact-lookups` also needs its env var:
`ALEXANDRIA_ALLOW_BILLABLE`, `ALEXANDRIA_ALLOW_WRITES`, `ALEXANDRIA_ALLOW_FORCE_REFRESH`,
`ALEXANDRIA_ALLOW_CONTACT_LOOKUPS` (all `=1`). `--allow-web-research` needs `--allow-billable`.

## Environment variables

`FIRECRAWL_API_KEY` (server-side only), `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL`),
`SUPABASE_SERVICE_ROLE_KEY`, the four gates above, `ALEXANDRIA_DAILY_CREDIT_CAP`,
`ALEXANDRIA_TRUSTED_SHAPES`, `ALEXANDRIA_REFRESH_DAYS_<GROUP>`.

## Commands

```bash
pnpm alexandria:discover                       # free: re-verify the capability catalog
pnpm alexandria:audit                          # read-only completeness/duplicate audit (needs DB creds)
pnpm alexandria:audit --fixtures scripts/alexandria-enrichment/fixtures/sample.json

# 1. Dry run (free), per entity, default
pnpm alexandria:run --entity firm --limit 25 --missing-only

# 2. Pilot: capture response shapes, no entity writes, hard cap
ALEXANDRIA_ALLOW_BILLABLE=1 pnpm alexandria:run --entity firm --limit 10 --max-credits 100 \
  --allow-billable --capture-shapes --out pilot-firm.json

# 3. Apply a small, capped batch (replays cached pilot responses at zero extra cost)
ALEXANDRIA_ALLOW_BILLABLE=1 ALEXANDRIA_ALLOW_WRITES=1 pnpm alexandria:run --entity firm --limit 10 \
  --max-credits 100 --allow-billable --no-dry-run --apply

# 4. Wider backfill (only after reviewing the pilot): raise --limit / --max-credits deliberately
ALEXANDRIA_ALLOW_BILLABLE=1 ALEXANDRIA_ALLOW_WRITES=1 ALEXANDRIA_DAILY_CREDIT_CAP=500 \
  pnpm alexandria:run --entity all --limit 500 --batch-size 25 --max-credits 500 \
  --missing-only --allow-billable --no-dry-run --apply

pnpm alexandria:run --resume <run_id> ...      # resume a checkpointed run
pnpm alexandria:report --since-days 30         # aggregates (admin/service role)
pnpm alexandria:rollback --id <run_id>         # dry run of rollback
ALEXANDRIA_ALLOW_WRITES=1 pnpm alexandria:rollback --id <run_id> --apply
ALEXANDRIA_ALLOW_WRITES=1 pnpm alexandria:rollback --cancel <run_id>
```

`--fixtures <file>` runs against an in-memory store with synthetic data and a fake provider port: no DB, no credits.

## Trusted shapes (pilot procedure)

Provider contracts do not document nested response shapes (for example Fireround `recent_rounds`).
Until verified, facts derived from nested structures are capped at medium confidence and go to review.
After a pilot with `--capture-shapes` (logs key/type skeletons, never values), review the skeletons and
set `ALEXANDRIA_TRUSTED_SHAPES=fireround/investors/profile,fullenrich/companies/lookup` to allow
auto-apply for those provider/capability pairs.

## Tests

`pnpm vitest run src/test/alexandria*` covers identity resolution, duplicates, source conflicts,
confidence thresholds, malformed provider responses, failed requests, credit caps, idempotency and
cache replay, all with a fake provider port (no paid calls). `alexandriaSupabaseStore.integration.test.ts`
runs `SupabaseStore` against a real Postgres/PostgREST when `ALEXANDRIA_IT_SUPABASE_URL` and
`ALEXANDRIA_IT_SERVICE_KEY` are set (use `ALEXANDRIA_IT_BARE_POSTGREST=0` for hosted Supabase URLs);
otherwise it is skipped.
