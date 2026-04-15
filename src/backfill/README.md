# Firm Backfill Pipeline

Playwright-first, source-adapter-based backfill for `firm_records`.

Architecture highlights:

- One adapter per source (website, Crunchbase, CB Insights, Tracxn, Signal NFX, OpenVC, VCSheet, Startups.gallery, Wellfound, AngelList, Medium, Substack).
- All extractions produce a normalized `ExtractedProfile` plus per-field provenance.
- Deterministic merge — source-priority map, confidence-weighted, conflicts flagged for manual review.
- Classification inferred from text signals + tags (regex + weights, no LLM).
- Idempotent writes to `firm_records`, `firm_field_sources`, `firm_tags`, `firm_tag_links`, `backfill_runs`.
- Rate limits per source, exponential backoff, cooldown on repeated failures.
- Session persistence via Playwright `storageState` for auth-gated sources.

## Setup

```bash
# 1. Install deps (already in root package.json: playwright, supabase-js, zod, tsx)
pnpm install
npx playwright install chromium

# 2. Apply migration
# In the Supabase SQL editor, run:
#   supabase/migrations/20260415_backfill_pipeline.sql
```

## Environment

Create `.env.local` (or export before running):

```env
SUPABASE_URL=https://zmnlsdohtwztneamvwaq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_STORAGE_STATE=
PLAYWRIGHT_BROWSER=chromium
PLAYWRIGHT_TIMEOUT_MS=30000

# Optional — only used if you add LLM-backed classifiers later
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

Session state lives at `data/sessions/{source}.json` (see `src/backfill/browser/sessions.ts`).

## Run — dry run (default, writes nothing)

```bash
pnpm tsx src/backfill/run-firm-backfill.ts \
  --limit=50 --source=all --only-missing=true
```

JSON-line logs go to stdout. Every would-be write is logged as `upsert.*.dry`.

## Run — commit mode

```bash
pnpm tsx src/backfill/run-firm-backfill.ts \
  --limit=500 --offset=0 --source=all --commit=true
```

## Run — single firm

```bash
pnpm tsx src/backfill/run-firm-backfill.ts \
  --firm-id=00000000-0000-0000-0000-000000000000 \
  --source=all --commit=true
```

## Run — single source

```bash
pnpm tsx src/backfill/run-firm-backfill.ts --source=website --commit=true
pnpm tsx src/backfill/run-firm-backfill.ts --source=crunchbase,openvc --commit=true
pnpm tsx src/backfill/run-firm-backfill.ts --source=signal_nfx --commit=true
```

Source shortcuts: `signal`→`signal_nfx`, `cb`→`crunchbase`, `cbi`→`cbinsights`, `sg`→`startups_gallery`.

## Recording an authenticated session

For CB Insights, Tracxn, Signal NFX, Wellfound, AngelList:

```bash
# 1. Launch Playwright in a one-off session recorder
npx playwright codegen https://app.cbinsights.com \
  --save-storage=data/sessions/cbinsights.json

# (log in manually, close the browser)

# 2. Re-run the backfill — it picks up the saved session automatically
pnpm tsx src/backfill/run-firm-backfill.ts --source=cbinsights --commit=true
```

Repeat for each auth-gated source, saving to `data/sessions/{name}.json`.

## Flags

| Flag | Default | Description |
|---|---|---|
| `--firm-id=UUID` | — | Restrict to a single firm |
| `--source=NAME[,NAME,…]` | `all` | One or many adapters |
| `--commit=true\|false` | `false` | Write to DB |
| `--dry-run=true\|false` | `true` | Opposite of commit |
| `--limit=N` | `100` | Max firms per run |
| `--offset=N` | `0` | Pagination offset |
| `--only-missing=true\|false` | `true` | Only firms missing ≥2 fields |
| `--freshness-days=N` | `30` | Skip firms verified within N days |
| `--concurrency=N` | `2` | Concurrent firm workers |
| `--headless=true\|false` | `true` | Playwright headless mode |
| `--storage-state=PATH` | — | Override session path |

## Field coverage per source

| Field | Primary | Secondary | Tertiary |
|---|---|---|---|
| `description` | website | crunchbase | cbinsights |
| `elevator_pitch` | website | medium/substack | — |
| `website_url` | crunchbase | cbinsights | tracxn |
| `linkedin_url` / `x_url` | website/crunchbase | linkedin | — |
| `crunchbase_url` | crunchbase | — | — |
| `cbinsights_url` | cbinsights | — | — |
| `tracxn_url` | tracxn | — | — |
| `signal_nfx_url` | signal_nfx | — | — |
| `openvc_url` | openvc | — | — |
| `hq_city/state/country` | crunchbase | website | cbinsights |
| `founded_year` | crunchbase | cbinsights | website |
| `aum` | cbinsights | crunchbase | tracxn |
| `min_check_size` / `max_check_size` | openvc | signal_nfx | website |
| `email` / `phone` | website | openvc | — |
| `stage_focus` / `stage_min/max` | openvc | signal_nfx | cbinsights |
| `geo_focus` | openvc | crunchbase | website |
| `stage_classification` etc. | `classification` parser (derived) | — | — |

## How merge works

1. Each adapter returns a partial profile + provenance entries.
2. `merge.ts` groups provenance by field and picks the winner:
   - sort by `source-priority.ts` (per-field priority map), then by confidence
3. If top two candidates have similar priority and different values → field marked as conflicting → firm gets `manual_review_status = 'needs_review'`
4. `firm_records` UPDATE never overwrites a non-null value unless `forceOverwriteKeys` is set (only used for derived classification fields).

## Recommended run order

Cheap public sources first (seed identity), then auth-gated sources that rely on that identity to match correctly:

```bash
# Phase 1 — public sources, identity + socials + categories
pnpm tsx src/backfill/run-firm-backfill.ts --source=website,crunchbase,openvc --commit=true

# Phase 2 — curated directories
pnpm tsx src/backfill/run-firm-backfill.ts --source=vcsheet,startups_gallery,medium,substack --commit=true

# Phase 3 — auth-gated (record sessions first)
pnpm tsx src/backfill/run-firm-backfill.ts --source=signal_nfx --commit=true
pnpm tsx src/backfill/run-firm-backfill.ts --source=cbinsights --commit=true
pnpm tsx src/backfill/run-firm-backfill.ts --source=tracxn --commit=true

# Phase 4 — heavy bot-protection (optional, low priority)
pnpm tsx src/backfill/run-firm-backfill.ts --source=wellfound,angellist --commit=true
```

## Fully implemented vs needs selector tuning

- **Fully implemented, robust**: `website`, `crunchbase`, `openvc`, `medium`, `substack`
  These use JSON-LD + meta + outbound-link scanning — structural extraction that's stable across layout changes.
- **Implemented, may need selector tuning after first live run**: `cbinsights`, `signal_nfx`, `tracxn`, `vcsheet`, `startups_gallery`, `wellfound`, `angellist`
  All selectors have `TODO[selector]` comments marking the most fragile locators.
- **Not implemented**: `linkedin` — included in `SOURCE_NAMES` as a passive recipient of URLs (from other sources) but no standalone adapter yet.

## Debugging

- Failed navigations save screenshots + HTML to `data/snapshots/`.
- Run `pnpm tsx src/backfill/run-firm-backfill.ts --headless=false` to watch adapters live.
- `backfill_runs` table has per-firm per-run status, fields written, and duration.
