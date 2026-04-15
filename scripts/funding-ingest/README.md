# Daily funding / deal news ingestion

Production pipeline that runs on a **Pacific** schedule, fetches new articles from four deal-news surfaces, parses article HTML, extracts structured rounds, normalizes + dedupes, and writes to **Postgres via Prisma** with idempotent upserts, per-source checkpoints, and run-level summaries.

## 1. Where data lives (schema audit)

These tables were added in `prisma/migrations/20260415120000_funding_news_ingestion/migration.sql` (and `listing_url` in `20260416100000_source_articles_listing_url`):

| Table | Role |
| --- | --- |
| `ingestion_runs` | One row per job execution: `status`, `started_at` / `finished_at`, `pacific_date`, `summary_json`, `error_message`, `trigger_kind`. |
| `ingestion_source_checkpoints` | **One row per `FundingIngestSourceKey`**: `last_article_published_at` (high-water mark), `last_success_at`, `last_run_id`, optional `cursor_json` for future cursors. |
| `source_articles` | **Canonical article** keyed by `canonical_url` (unique). Stores `source_key`, `listing_url` (hub page), title, `published_at`, `raw_excerpt` / `raw_text`, `content_hash`, fetch metadata. |
| `funding_deals` | **Structured deal** per article (`slot_index` default `0` for v1). Company, round, amount, currency, dates, sector, founders, summary, `extraction_confidence`, `needs_review`, `duplicate_of_deal_id`, `raw_extraction_json`. |
| `funding_deal_investors` | **Lead / participant / existing** investor strings linked to a deal (`LEAD`, `PARTICIPANT`, `EXISTING`, `UNKNOWN`). |
| `extraction_logs` | Per-run **info / warn / error** events (fetch failures, OpenAI errors, duplicate skips, `needs_review` flags). |

No separate `funding_deals` in Supabase migrations — this pipeline targets the **same Postgres database** configured in `DATABASE_URL` (Prisma).

### Requested field → column mapping

| Requirement | Storage |
| --- | --- |
| `source_name` | `source_articles.source_key` (`FundingIngestSourceKey` enum: `STARTUPS_GALLERY_NEWS`, `TECHCRUNCH_VENTURE`, `GEEKWIRE_FUNDINGS`, `ALLEYWATCH_FUNDING`). |
| `source_url` | `source_articles.listing_url` (category / news hub URL). |
| `article_url` | `source_articles.article_url` (and `canonical_url` after normalization). |
| `article_title` | `source_articles.title`. |
| `article_publish_date` | `source_articles.published_at`. |
| `company_name` | `funding_deals.company_name` (+ `company_name_normalized`). |
| `company_website` | `funding_deals.company_website`. |
| `company_location` | `funding_deals.company_hq`. |
| `round_type` | `funding_deals.round_type_raw` / `round_type_normalized`. |
| `amount_raised` | `funding_deals.amount_raw` + `amount_minor_units` (cents, USD-first parser). |
| `currency` | `funding_deals.currency`. |
| `lead_investors` | `funding_deal_investors` rows with `role = LEAD`. |
| `participating_investors` | `funding_deal_investors` with `role = PARTICIPANT`. |
| `founder_names` | `funding_deals.founders_mentioned` (`text[]`). |
| `sector` | `funding_deals.sector_raw` / `sector_normalized`. |
| `summary` | `funding_deals.deal_summary`. |
| `extraction_confidence` | `funding_deals.extraction_confidence`. |
| `raw_text` / excerpt | `source_articles.raw_text` / `raw_excerpt`; full structured attempt in `funding_deals.raw_extraction_json`. |
| Low confidence | `funding_deals.needs_review = true` + `review_reason` + `extraction_logs` row (`warn`). |

## 2. Per-source ingestion strategy

| Source | Listing discovery | Article body | Notes |
| --- | --- | --- | --- |
| **TechCrunch** `/category/venture/` | WordPress RSS `…/feed/` | `fetch` + HTML strip | Reliable in CI; `listing_url` = category page. |
| **AlleyWatch** `/category/funding/` | Category RSS `…/feed/` | Same | Same pattern as TechCrunch. |
| **GeekWire** `/fundings/` | Try RSS feeds under `tag/funding` and `category/fundings`; fallback: parse hub HTML for `/YYYY/MM/DD/` article links | Same | Many datacenters get **403**; retries with backoff still may fail. Use `INGEST_SKIP_SOURCES=GEEKWIRE_FUNDINGS` in Actions vars or a residential/proxy egress. **Date**: parsed from GeekWire article URL when RSS missing. |
| **startups.gallery** `/news` | Cheerio on static HTML; if zero `/companies/` links, **Playwright** (Framer client render) scrolls `/news` and re-parses DOM | Fetches each company page URL as the “article” | `listing_url` = `/news`. Playwright can be disabled with `INGEST_STARTUPS_GALLERY_PLAYWRIGHT=0`. |

**Extraction**: `extract.ts` deterministic regex/heuristics on title + body; optional **OpenAI** JSON (`openaiExtract.ts`) merged in `run.ts` when `OPENAI_API_KEY` is set and `INGEST_DISABLE_OPENAI` is not `1`.

**Dedupe**: `dedupe.ts` — same `company_name_normalized` + `announced_date` within ±5 days + overlapping round label → skip **deal** insert (article row still upserted). Logged in `extraction_logs`.

**Idempotency**: `source_articles.canonical_url` unique upsert; `funding_deals (source_article_id, slot_index)` unique upsert; investors replaced each run for that deal.

## 3. Scheduling (1:00 AM America/Los_Angeles)

GitHub Actions `cron` is **UTC-only**. Workflow `.github/workflows/funding-ingest.yml` fires at **08:00 and 09:00 UTC** daily so **01:00 local** is covered across **PST (UTC−8)** and **PDT (UTC−7)**.

The script sets `INGEST_REQUIRE_PACIFIC_HOUR=1` for **scheduled** runs only; it **exits 0 without work** unless the current hour in `America/Los_Angeles` is **1**. Manual `workflow_dispatch` sets `INGEST_SKIP_PACIFIC_GUARD=1` so operators can run a full ingest anytime.

## Commands

```bash
# Apply schema (local or CI)
npx prisma migrate deploy

# Local dry run (no DB writes; still requires DATABASE_URL for Prisma client)
INGEST_DRY_RUN=1 INGEST_SKIP_PACIFIC_GUARD=1 npm run funding:ingest:dry

# Production-style run (writes DB)
INGEST_SKIP_PACIFIC_GUARD=1 npm run funding:ingest

# Listing smoke test — no DATABASE_URL; verifies RSS + startups.gallery listing
npm run funding:ingest:smoke

# After a real ingest — print latest deals as JSON (requires DATABASE_URL)
npm run funding:ingest:samples
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes (for writes / dry with Prisma) | Postgres connection string |
| `OPENAI_API_KEY` | No | Enables LLM extraction (`gpt-4o-mini` default) |
| `OPENAI_MODEL` | No | Override model id |
| `INGEST_DRY_RUN` | No | `1` = no DB writes |
| `INGEST_MAX_ARTICLES_PER_SOURCE` | No | Default `40` per source per run |
| `INGEST_REQUIRE_PACIFIC_HOUR` | No | `1` = exit unless Pacific hour is **01** |
| `INGEST_SKIP_PACIFIC_GUARD` | No | `1` = bypass Pacific hour guard |
| `INGEST_SKIP_SOURCES` | No | Comma list: `GEEKWIRE_FUNDINGS`, `TECHCRUNCH_VENTURE`, … |
| `INGEST_DISABLE_OPENAI` | No | `1` = never call OpenAI |
| `INGEST_STARTUPS_GALLERY_PLAYWRIGHT` | No | `0` = do not use Playwright for `/news` |
| `INGEST_TRIGGER` | No | Stored on `ingestion_runs.trigger_kind` |

## Production / CI

1. Set GitHub **secret** `DATABASE_URL` and optional `OPENAI_API_KEY`.
2. Optional **variable** `INGEST_SKIP_SOURCES` (e.g. `GEEKWIRE_FUNDINGS` if 403 persists).
3. Workflow **Funding ingest** runs on schedule + `workflow_dispatch`.
4. First CI run: `npx playwright install --with-deps chromium` is already in the workflow for Framer.

## Market intelligence (linking + rollups + scores)

After ingest, run the **intel pipeline** to link deals to `startups` / `vc_firms`, compute snapshots, and refresh `vc_firm_derived_market_intel`:

```bash
npm run intel:funding:pipeline
```

See [`scripts/funding-intel/README.md`](../funding-intel/README.md).

## Extending sources

1. Add enum value to `FundingIngestSourceKey` in `prisma/schema.prisma` + migration `ALTER TYPE ... ADD VALUE`.
2. Add `LISTING_PAGE_URLS` entry and a `fetch*` function in `sources.ts`.
3. Register in `loaders` inside `scripts/funding-ingest/run.ts`.
