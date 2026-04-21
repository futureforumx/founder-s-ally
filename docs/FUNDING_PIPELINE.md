# Funding Ingestion Pipeline

Production-grade, multi-source funding announcement ingestion for the Vekta app.

---

## Overview

The pipeline fetches startup funding announcements from multiple public sources, normalizes them into a canonical data model, deduplicates across sources, and surfaces them via the existing `get_recent_funding_feed` RPC.

**Key properties:**
- Additive — does not modify any existing Prisma-managed table (`source_articles`, `funding_deals`, `funding_deal_investors`)
- Idempotent — re-running a source never creates duplicate canonical deals
- Provenance-first — every canonical deal links back to every raw source that contributed to it
- Rumor-aware — VC Stack items are explicitly classified confirmed vs. rumor
- Classification gate — TechCrunch articles are scored before ingestion; non-funding articles are dropped

---

## Architecture

```
fi_sources           (registry of data sources)
  └── fi_fetch_runs  (one per polling execution per source)
       └── fi_documents  (raw fetched HTML / API responses)
            └── fi_deals_raw  (parsed candidates, one per document × slot)
                 └── fi_deals_canonical  (deduped, merged canonical deals)
                      ├── fi_deal_investors   (lead + co-investors)
                      └── fi_deal_source_links  (provenance map)

fi_errors            (pipeline error log, per stage)
```

**Public read path:** `get_recent_funding_feed(p_limit)` — a SECURITY DEFINER SQL function that unions `funding_deals` (legacy Prisma) + `fi_deals_canonical` (new pipeline), deduplicates by `(normalized_company_name, round_type, week)`, and returns the most recent `p_limit` deals.

---

## Sources

| Slug | Adapter key | Source type | Credibility | Poll interval |
|---|---|---|---|---|
| `startups_gallery_news` | `startups_gallery` | curated_feed | 0.82 | 120 min |
| `vc_news_daily` | `vc_news_daily` | curated_feed | 0.80 | 60 min |
| `techcrunch_venture` | `techcrunch` | news | 0.88 | 30 min |
| `venture5_vc_deals` | `venture5` | curated_feed | 0.77 | 90 min |
| `vcstack_funding` | `vcstack` | rumor_feed | 0.60 | 60 min |
| `crunchbase_api` | `crunchbase_api` | api | 0.95 | 360 min |

### Source-specific notes

**TechCrunch** — The venture category page contains opinion, analysis, and podcast posts in addition to funding announcements. The adapter fetches the RSS feed and runs a keyword classifier (`classifyTechCrunchArticle`) on each title + snippet. Items below 0.50 classification confidence are dropped before any detail-page fetch.

**VC Stack** — All items go through `classifyVcStackItem` which looks for explicit rumor signals ("reportedly", "may be raising", "in talks to raise", etc.). Confirmed items get `source_type = 'curated_feed'` and `is_rumor = false`; rumors get `source_type = 'rumor'`, `is_rumor = true`, and a meaningfully lower `confidence_score` (≤ 0.45). Both are stored in `fi_deals_canonical` with `is_rumor` set accordingly. The `get_recent_funding_feed` RPC deprioritizes rumors in the dedup ranking.

**Crunchbase** — The adapter is a clean stub. It activates when `CRUNCHBASE_API_KEY` is set. It does NOT scrape authenticated Crunchbase Discover pages. See `adapters/crunchbase.ts` for the field mapping reference and TODOs to complete the implementation.

---

## Dedupe rules

Canonical deals are deduplicated using a layered approach:

1. **Exact dedupe_key match** (fastest path):  
   `dedupe_key = normalized_company_name :: round_type_normalized :: week_of_announced_date`  
   The week snapping absorbs reporting lag — if TechCrunch covers a deal on Monday and VC News Daily covers it on Wednesday, they share the same week bucket.

2. **Domain-based fuzzy lookup**: if no key match, look for recent canonical deals with the same `company_domain`. Score each candidate using `scoreDedupeMatch` (checks: domain, normalized name, amount similarity, round type). Score ≥ 60 → merge.

3. **No match** → new canonical record.

**Merge policy** when a duplicate is found: higher-priority source wins each field. Source priority: `api > curated_feed > news > rumor`. Confidence score on the merged record is nudged up (max `confidence_score + 0.05`) because corroboration from multiple sources increases certainty. `is_rumor` is `true` only if *all* contributing sources were rumors.

---

## Confidence scoring

| Factor | Impact |
|---|---|
| Base source credibility | 0.60–0.95 (from `fi_sources.credibility_score`) |
| TechCrunch classification | Blended: `source_cred × 0.6 + classifier_conf × 0.4` |
| VC Stack rumor | Forced to ≤ 0.45 |
| Multi-source corroboration | +0.05 per additional source (capped at 1.0) |

---

## Normalization

All normalization is in `_shared/funding/normalize.ts`:

| Field | Rule |
|---|---|
| `normalized_company_name` | lowercase, strip legal suffixes (Inc, LLC, Ltd, Corp, Technologies…), strip punctuation, replace spaces with `_` |
| `lead_investor_normalized` | lowercase, strip fund suffixes (Capital, Ventures, VC, Fund, Partners…) |
| `round_type_normalized` | regex map → `pre_seed \| seed \| series_a…e \| growth \| strategic \| debt \| grant \| unknown \| other` |
| `amount_minor_units` | parse `$50M` → `5_000_000_00` (cents), handles `k/m/b/million/billion`, `€/£/¥` |
| `announced_date` | ISO `YYYY-MM-DD`; uses `new Date(string)` fallback |
| `sector_normalized` | regex map → `fintech \| healthtech \| ai_ml \| saas \| climatetech \| proptech \| edtech \| ecommerce \| logistics \| cybersecurity \| devtools \| agrifood \| hrtech \| media \| legaltech \| gaming \| deep_tech \| biotech` |
| `company_domain` | extract hostname from `company_website`, strip `www.` |

---

## Cron / scheduling

Add a cron job in the Supabase dashboard (**Database → Cron Jobs**) or via pg_cron:

```sql
-- Incremental poll every 30 minutes
SELECT cron.schedule(
  'funding-ingest-incremental',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url    => current_setting('app.supabase_url') || '/functions/v1/funding-ingest',
      headers => jsonb_build_object(
        'Content-Type',         'application/json',
        'x-fi-cron-secret',     current_setting('app.funding_ingest_cron_secret')
      ),
      body   => '{"action":"run","limit":30}'::jsonb
    );
  $$
);

-- Weekly backfill on Sunday 02:00 UTC
SELECT cron.schedule(
  'funding-ingest-backfill',
  '0 2 * * 0',
  $$
    SELECT net.http_post(
      url    => current_setting('app.supabase_url') || '/functions/v1/funding-ingest',
      headers => jsonb_build_object(
        'Content-Type',         'application/json',
        'x-fi-cron-secret',     current_setting('app.funding_ingest_cron_secret')
      ),
      body   => '{"action":"backfill","limit":80}'::jsonb
    );
  $$
);
```

---

## Secrets

| Secret | Required | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-set | DB writes + auth |
| `SUPABASE_URL` | Auto-set | Supabase client |
| `FUNDING_INGEST_CRON_SECRET` | **You must set this** | Cron auth header |
| `CRUNCHBASE_API_KEY` | Optional | Activates Crunchbase adapter |

Set secrets:
```bash
supabase secrets set FUNDING_INGEST_CRON_SECRET=<your-random-secret>
supabase secrets set CRUNCHBASE_API_KEY=<your-crunchbase-key>   # optional
```

---

## Deploy commands

```bash
# 1. Apply schema migrations
supabase db push

# 2. Deploy the Edge Function
supabase functions deploy funding-ingest --no-verify-jwt

# 3. Set secrets (first time)
supabase secrets set FUNDING_INGEST_CRON_SECRET=<secret>

# 4. Test locally
supabase functions serve funding-ingest --env-file .env.local
curl -X POST http://localhost:54321/functions/v1/funding-ingest \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"run","source":"techcrunch_venture","limit":5}'

# 5. Run a single source in production
curl -X POST https://zmnlsdohtwztneamvwaq.supabase.co/functions/v1/funding-ingest \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"run","source":"startups_gallery_news","limit":20}'

# 6. Retry failed documents
curl -X POST https://zmnlsdohtwztneamvwaq.supabase.co/functions/v1/funding-ingest \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"retry"}'
```

---

## Adding a new source

1. **Create the adapter** in `supabase/functions/_shared/funding/adapters/my-source.ts`:

```typescript
import type { SourceAdapter, AdapterContext, ListingItem, RawDealCandidate, FiSource } from "../types.ts";

async function fetchListing(ctx: AdapterContext): Promise<ListingItem[]> {
  const result = await ctx.fetchUrl("https://my-source.com/deals");
  // parse HTML, return array of { url, title, ... }
  return [];
}

function parseDocument(html: string, url: string, item: ListingItem, source: FiSource): RawDealCandidate[] {
  // extract fields, return array of candidates
  return [];
}

export const MySourceAdapter: SourceAdapter = {
  key: "my_source",
  fetchListing,
  parseDocument,
};
```

2. **Register it** in `adapters/index.ts`:
```typescript
import { MySourceAdapter } from "./my-source.ts";
export const ADAPTER_REGISTRY = {
  // ...existing,
  [MySourceAdapter.key]: MySourceAdapter,
};
```

3. **Insert a row** into `fi_sources`:
```sql
INSERT INTO public.fi_sources (slug, name, base_url, adapter_key, source_type, credibility_score, poll_interval_minutes)
VALUES ('my_source', 'My Source', 'https://my-source.com/deals', 'my_source', 'news', 0.750, 60);
```

4. **Deploy** the updated function:
```bash
supabase functions deploy funding-ingest --no-verify-jwt
```

---

## File layout

```
supabase/
  migrations/
    20260430100000_fi_canonical_schema.sql     ← All fi_* tables + seed sources
    20260430110000_fi_get_funding_feed_union.sql ← Extended RPC
  functions/
    funding-ingest/
      index.ts                                 ← Main orchestrator Edge Function
    _shared/
      funding/
        types.ts                               ← All TypeScript interfaces
        fetch.ts                               ← Polite fetch + sha256
        normalize.ts                           ← All normalization utilities
        dedupe.ts                              ← Dedupe scoring + merge
        adapters/
          index.ts                             ← Adapter registry
          startups-gallery.ts
          vc-news-daily.ts
          techcrunch.ts
          venture5.ts
          vcstack.ts
          crunchbase.ts                        ← Stub (activate with API key)
docs/
  FUNDING_PIPELINE.md                          ← This file
```

---

## Monitoring

```sql
-- Latest run summary per source
SELECT
  fs.slug,
  fr.run_mode,
  fr.status,
  fr.started_at,
  fr.completed_at,
  fr.docs_fetched,
  fr.deals_upserted,
  fr.error_count
FROM fi_fetch_runs fr
JOIN fi_sources fs ON fs.id = fr.source_id
ORDER BY fr.started_at DESC
LIMIT 20;

-- Recent canonical deals
SELECT company_name, round_type_normalized, amount_raw, announced_date,
       source_type, is_rumor, confidence_score, source_count
FROM fi_deals_canonical
ORDER BY announced_date DESC NULLS LAST
LIMIT 20;

-- Recent errors
SELECT error_stage, error_message, url, created_at
FROM fi_errors
ORDER BY created_at DESC
LIMIT 20;

-- Feed (same as the app)
SELECT * FROM public.get_recent_funding_feed(20);
```

---

## Legal + safety notes

- All sources accessed are **public pages** — no authenticated scraping.
- Crunchbase adapter uses the **official API** only; it will not scrape protected Discover pages. If no API key is set, it silently skips.
- User-Agent is set to `VektaFundingBot/1.0 (+https://vekta.so/bot)` on all requests.
- Per-domain rate limiting: minimum 800ms between requests to the same hostname.
- Retry back-off: exponential (1s, 2s, 4s) with jitter.
- Timeout: 15 seconds per fetch.
- `429 / 503` responses: respects `Retry-After` header.
