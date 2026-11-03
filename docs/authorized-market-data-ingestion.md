# Authorized Crunchbase and Tracxn ingestion

## How this fits VEKTA

This pipeline extends the existing global ingestion model. `source_records` stores provider payloads and provenance; `ingestion_jobs` stores run status and checkpoints. Reviewed canonical data maps to the existing VEKTA records: `startups`, `startup_founders`, `startup_funding_rounds`, `firm_records`, `firm_investors`, and the current company funding tables. Tenant-scoped `connector_source_records` remains for email, calendar, and CRM connectors. No provider-specific canonical tables are introduced.

The initial safe workflow accepts licensed CSV/JSON exports, normalizes and validates them in preview, then stages raw rows. Crunchbase API search uses the documented v4 POST request and `after_id` keyset cursor, with licensed `field_ids` supplied by configuration. Tracxn API integration requires the licensed dataset's exact endpoint, pagination, and response schema via the adapter callbacks; these vary by entitlement and are not guessed. Neither API connector is currently wired to scheduled retrieval. The import path does not write canonical company, person, investor, or funding records. Name-only and fuzzy matches are review suggestions. Exact provider IDs, verified domains, and profile IDs can be matched automatically by the reusable resolver. Field-level promotion is intentionally not enabled until VEKTA has a source permission policy for customer-facing use and an approved reversible merge endpoint.

## Source permissions

- Crunchbase's current [Terms of Service](https://about.crunchbase.com/terms-of-service) prohibit crawling/scraping and significant copying by default. Use only an approved API key or an export and license that expressly permits the chosen storage, transformation, and downstream VEKTA customer use. The Crunchbase API is available to approved developers and returns licensed fields only: [API essentials](https://data.crunchbase.com/docs/api-essentials).
- Tracxn's [Terms of Use](https://tracxn.com/termsofuse) prohibit automated extraction except through explicitly permitted APIs, and state that platform data is for internal business use with broader third-party distribution requiring prior written approval. Tracxn's [API help](https://help.tracxn.com/en/articles/8512359-getting-started-with-tracxn-apis) describes API tokens and 20-record request limits.
- Browser extraction is disabled for both sources in the new workflow. Do not automate login, export or profile browsing unless the provider has expressly authorized that exact workflow in writing. No CAPTCHA, paywall, bot defense, or authentication bypass is implemented.

## Setup

Configure server-side Supabase secrets only after confirming the relevant data license and use scope:

```sh
supabase secrets set CRUNCHBASE_LICENSE_SCOPE='approved-license-reference'
supabase secrets set TRACXN_LICENSE_SCOPE='approved-license-reference'
```

The scope value is an opaque approval reference, not a credential. Provider API keys belong in server-side secret storage if/when scheduled API retrieval is enabled. Never use `VITE_` variables for source API keys. The Edge Function rejects imports without an exact server-configured provider scope. `authorized-market-data-ingest` requires an admin caller, limits batches to 100 records, hashes payloads, and avoids creating a second raw row for unchanged provider ID/hash pairs.

Existing direct-write Crunchbase/Tracxn scraper commands are now fail-closed. Crunchbase browser mode additionally requires `CRUNCHBASE_BROWSER_EXTRACTION_WRITTEN_PERMISSION=1`; Tracxn browser mode requires `TRACXN_BROWSER_EXTRACTION_WRITTEN_PERMISSION=1`. Both also require a license scope. Direct writes from those legacy scripts require a separate explicit `*_CANONICAL_WRITES_APPROVED=1` flag; leave it unset and use dry-run or the raw staging workflow unless the data license and the platform approval process authorize canonical writes.

Deploy the additive migration and Edge Function through the repository's normal Supabase release process. The migration only adds operational/provenance columns to the existing source tables and indexes; review the generated diff and linked migration history before applying. Do not run it against production as part of a dry-run.

## Supported import shape

CSV uses a header row. JSON accepts an array or `{ "records": [...] }`. Every record should include a stable provider ID (`source_id`, `uuid`, `id`, or `external_id`) and the provider's source/profile URL. Common fields are mapped by `src/lib/data-ingestion/normalize.ts`; original fields are retained in the staged raw payload. Funding amounts retain their explicit currency and no USD conversion is performed.

## Retention, deletion, and customer display

`license_scope` and `usage_expires_at` are stored with raw provenance. Current staging does not expire or delete records automatically. Before a license expires, implement the license's deletion/export requirements against `source_records` and associated field provenance, and verify deletion from backups where required. Customer display and API responses remain disabled until legal/licensing approval is recorded server-side for the precise fields and redistribution scope.

## Local validation

Run `npm test -- src/lib/data-ingestion/data-ingestion.test.ts`, then `npx playwright test tests/authorized-data-ingestion.spec.ts`. Playwright tests use a local HTML fixture only. They do not visit Crunchbase or Tracxn, authenticate, or perform export actions. The only sample records are deliberately messy fixture records; they are not provider data and must not be imported to production.
