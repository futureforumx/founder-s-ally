# Intelligence layer

Event-driven intelligence for founders and investors: canonical **events** (not raw headlines), ranked with explicit “why it matters,” user actions, and an extensible ingestion pipeline.

## Architecture

| Layer | Role |
|--------|------|
| **Postgres (Supabase)** | `intelligence_entities`, `intelligence_sources`, `raw_intelligence_items`, `intelligence_events`, `intelligence_event_entities`, user tables (`intelligence_watchlists`, `intelligence_saved_events`, `intelligence_dismissed_events`, `intelligence_alerts`), reference `intelligence_event_types`. |
| **Edge `intelligence-feed`** | Authenticated users: paginated feed, summary strip counts, save / dismiss / watchlist / notes / alerts. Uses service role after JWT decode to apply dismissed filtering and joins reliably. |
| **Edge `intelligence-pipeline`** | Service role or `x-intelligence-cron-secret`: RSS ingest via adapter registry, normalize → entity match → classify → dedupe → score → upsert `intelligence_events`. |
| **Frontend** | `IntelligencePage` + `intelligenceFeedApi.ts`; Market Intelligence nav: Live, Investors, Market, Tech, Network. |

## Event flow

1. **Ingestion** — `intelligence-pipeline` with `action: "ingest"` (or `"run"`) loads active `intelligence_sources`, picks an adapter from `metadata.adapter` (default `rss`), fetches items, inserts `raw_intelligence_items` with `content_hash` dedupe on `(source_id, content_hash)`.
2. **Normalization** — `_shared/intelligence/normalize.ts` produces title/summary hints, `likelyCategory`, `likelyEventType` via keyword rules.
3. **Entity linking** — `_shared/intelligence/entities.ts` substring-matches against `intelligence_entities` (name + aliases).
4. **Classification** — `event_type` must exist in `intelligence_event_types`; category aligns with taxonomy checks in SQL.
5. **Dedupe** — `buildDedupeKey()`; existing row updates `source_count`, `last_seen_at`.
6. **Scoring** — `_shared/intelligence/scoring.ts` combines source credibility, recency, rarity, optional boosts.
7. **Delivery** — `intelligence-feed` `action: "feed"` returns ranked events with `entities` and side-rail aggregates.

## Adding a source

1. Insert into `intelligence_sources` (`type`, `base_url`, `credibility_score`, `active`, `metadata`).
2. For RSS, set `metadata` to at least `{ "adapter": "rss", "feed_url": "https://example.com/feed.xml" }` (or use `base_url` as the feed URL).
3. Register a new adapter in `supabase/functions/_shared/intelligence/adapters.ts` and set `metadata.adapter` to that key.
4. Schedule `POST` to `intelligence-pipeline` with header `Authorization: Bearer <SERVICE_ROLE_KEY>` and body `{ "action": "run" }` (or split `ingest` / `process`). Optional: set env `INTELLIGENCE_CRON_SECRET` and send `x-intelligence-cron-secret`.

## Adding an event type

1. Insert a row into `intelligence_event_types` (`code`, `label`, `default_category`, `description`, `sort_order`).
2. Add classification rules in `normalize.ts` (`KEYWORD_RULES`) or future LLM step.
3. Optionally tune `rarityForEventType` in `scoring.ts`.

## Migrations and deploy

- Apply migration: `supabase/migrations/20260328230000_intelligence_layer.sql`.
- Deploy functions: `intelligence-feed`, `intelligence-pipeline` (see `supabase/config.toml` for `verify_jwt = false`; auth is handled in code).
- Demo data ships with the migration so the Live feed is populated before real ingest runs.

## pgvector

Schema is ready for a future `embedding` column and semantic dedupe; v1 uses lexical keys and title similarity in code only.
