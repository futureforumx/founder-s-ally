# Funding → market intelligence layer

Extends the [funding news ingest](../funding-ingest/README.md) into **canonical links**, **activity rollups**, **transparent scores**, and **app-facing derived profiles** (without overwriting canonical `vc_firms` identity fields).

## Schema audit (where things live)

| Existing | Purpose |
|----------|---------|
| `funding_deals`, `funding_deal_investors`, `source_articles` | Raw ingested deals |
| `startups` | Canonical portfolio companies (`domain`, `company_name` unique) |
| `vc_firms`, `vc_firm_aliases`, `vc_people` | Canonical investors / firms |

## New tables (Prisma + `20260416120000_funding_intel_layer`)

| Table | Purpose |
|-------|---------|
| `funding_deal_company_links` | Deal → `startups` (match method + confidence + evidence JSON) |
| `funding_deal_investor_links` | Parsed investor string → `vc_firms` / optional `vc_people` |
| `entity_match_reviews` | Ambiguous fuzzy candidates (no auto-link) |
| `firm_market_intel_snapshots` | Per-firm, per-window (30/90/180/365d) metrics + **component scores** + focus JSON |
| `investor_market_intel_snapshots` | Reserved for person-level links (`vc_person_id` populated) |
| `vc_firm_derived_market_intel` | **Latest** app-facing enrichment (summaries, JSON metrics, scores) |
| `vc_person_derived_market_intel` | Same for individuals when person linking exists |
| `intel_batch_runs` | Batch job audit (`aggregate_snapshot`, future jobs) |

**Views** (SQL, query with Prisma `$queryRaw` or psql):

- `v_intel_vc_firm_rankings_90d` — latest 90d snapshot joined to `vc_firms`
- `v_intel_vc_person_rankings_90d` — latest 90d person snapshot

## Matching design (deterministic → fuzzy → review)

1. **Companies (`funding_deals` → `startups`)**  
   - `DOMAIN_EXACT`: normalized host from `company_website` matches `startups.domain`.  
   - `NAME_EXACT`: `normalizeCompanyName(company_name)` equals startup name key.  
   - `FUZZY_HIGH`: token Jaccard ≥ **0.88** → auto-link with confidence = score.  
   - **0.72–0.88**: create `entity_match_reviews` row (`DEAL_COMPANY`), **no link**.

2. **Investors (`funding_deal_investors` → `vc_firms`)**  
   - `NAME_EXACT` / `ALIAS_EXACT` on normalized firm name + alias table (`WEBSITE_DOMAIN` aliases also keyed by canonical host).  
   - `FUZZY_HIGH`: Jaccard ≥ **0.88** on `vc_firms.firm_name`.  
   - **0.72–0.88**: `entity_match_reviews` (`DEAL_INVESTOR`).

3. **No duplicate entities** — only links; never `INSERT` into `vc_firms` / `startups` from this pipeline.

## Scoring (`formula_version = intel_v1`)

Documented in `lib/scoring.ts`:

- **Activity** (0–100): blend of recency-weighted deal volume (365d cap), leads (90d), participants (90d), article corroboration (90d). Weights: **0.45 / 0.30 / 0.15 / 0.10**. Caps are stored in `activity_components_json`.
- **Momentum** (0–100): `tanh(ratio - 1)` around 50, where `ratio = pace_recent / pace_prior`, `pace_recent` = weighted deals **0–30d**, `pace_prior` = weighted **31–90d**. Pace label: **accelerating** (>1.25), **steady**, **slowing** (<0.75), or **insufficient_data**.

All intermediates are persisted in `*_components_json` / `focus_json.provenance`.

## Commands

```bash
# Apply migrations (includes intel tables + views)
npx prisma migrate deploy

# 1) Link deals to startups / investors to vc_firms
npx tsx scripts/funding-intel/link-entities.ts

# 2) Rebuild snapshots + derived profiles
npx tsx scripts/funding-intel/aggregate-and-snapshot.ts

# Or both
npx tsx scripts/funding-intel/run-pipeline.ts

# Dry-run linking only
INTEL_DRY_RUN=1 npx tsx scripts/funding-intel/link-entities.ts

# Sample derived rows
npx tsx scripts/funding-intel/print-intel-samples.ts
```

### Daily refresh (after funding ingest)

```bash
npm run funding:ingest
npx tsx scripts/funding-intel/run-pipeline.ts
```

### Example ranking queries (SQL)

```sql
-- Most active firms (90d), AI-related sector tag in metrics JSON
SELECT f.firm_name, s.activity_score, s.momentum_score
FROM firm_market_intel_snapshots s
JOIN vc_firms f ON f.id = s.vc_firm_id
WHERE s.window_days = 90
  AND s.as_of_date = (SELECT MAX(as_of_date) FROM firm_market_intel_snapshots WHERE window_days = 90)
  AND (s.metrics_json->'sectors' ? 'ai')
ORDER BY s.activity_score DESC NULLS LAST
LIMIT 25;
```

(Adjust JSON path to match normalized sector keys stored in `metrics_json.sectors`.)

## Profile enrichment rules

- **Writes only** to `vc_firm_derived_market_intel` / `vc_person_derived_market_intel` and optional future patches to **activity-oriented** columns on `vc_people` (`recent_deal_count`, `last_active_date`) — **never** overwrite `vc_firms.firm_name`, `website_url`, thesis copy, etc.

## Backfill

Run `link-entities` then `aggregate-and-snapshot` once per environment after historical `funding_deals` exist. Re-running is **idempotent** (upserts by unique keys).
