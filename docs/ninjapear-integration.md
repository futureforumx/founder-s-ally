# NinjaPear enrichment

Vekta enriches people and organizations immediately before they are written to
the warm-path recommendation shortlist. The integration is server-only and uses
`NINJAPEAR_API_KEY`; the key is never exposed through a `VITE_*` variable.

## Setup

1. Create a key at <https://nubela.co/dashboard>.
2. Configure the hosted Edge Function secret:

   ```bash
   supabase secrets set NINJAPEAR_API_KEY=YOUR_KEY
   ```

3. Apply `supabase/migrations/20260819182457_ninjapear_enrichment.sql` and deploy
   `backfill-phase4-recommendations`.

The official `ninjapear` npm package is pinned at `1.6.0`. Its published JS
surface currently lags the live API reference (v1 person profile and no employee
search), so Edge Functions use the documented REST endpoints while retaining the
SDK for compatible Node tooling.

## Service surface

`supabase/functions/_shared/ninjapear.ts` exports:

- `enrich_person(name, company)` — `GET /api/v2/employee/profile`
- `enrich_company(nameOrDomain)` — aggregates Company Details, Funding,
  Customer Listing, and Competitor Listing
- `find_person_url(name, company)` — resolves a canonical NinjaPear profile URL
- `find_role_url(role, company)` — resolves a role holder through Person Profile
- `find_work_email(name, company)` — `GET /api/v1/employee/work-email`

NinjaPear's current contract does not return person LinkedIn URLs and does not
accept a person LinkedIn URL as Person Profile input. The two `find_*_url`
functions therefore return a NinjaPear profile URL. No LinkedIn URL is inferred
or fabricated.

## Billing and cache behavior

- Application records and `ninjapear_enrichment_cache` are checked before every
  vendor call. Successful and no-result lookups remain fresh for one day.
- In-flight and same-isolate requests are deduplicated in memory.
- Cache-capable NinjaPear endpoints default to `use_cache=if-present`.
- Only an explicit `forceRefresh: true` passes `use_cache=never`.
- Work Email has no documented `use_cache` parameter, so Vekta relies on its own
  one-day database cache for that endpoint.
- Customer Listing is bounded to 10 results per company. This still has variable
  credit cost; callers should not bulk-enrich without reviewing the budget.

Company headcount growth is derived from Vekta's stored headcount snapshots.
NinjaPear's live Company Details response supplies a current count/range, not a
historical growth field.

## Failure behavior

`204`, empty, and documented `404` lookups become `not_found`; they do not break
shortlist generation. API failures are logged as `ninjapear_api_error`, while
empty results use `ninjapear_no_result`. HTTP 429 and 503 responses retry up to
three attempts with `Retry-After` or exponential backoff.

Tests mock `fetch` and use the documentation's `demo-api-key` convention. CI
never sends requests to NinjaPear and never consumes credits.
