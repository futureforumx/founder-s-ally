# Operator Network Layer — Intelligence Documentation

> Last updated: 2026-04-02
> Data as of enrichment run: 9,286 people · 5,020 orgs · 48 YC batches · 16 expertise clusters

---

## What This Is

The Operator Network layer turns the raw founder/org data in Supabase into a queryable intelligence surface. It is built entirely on top of the existing `people`, `organizations`, `roles`, and `source_records` tables — no new ingestion, no new schema, no external APIs.

The layer has three parts:

1. **Six PostgreSQL views** — pre-computed joins and signals, always fresh
2. **NestJS `NetworkModule`** — REST API backed by raw SQL against those views
3. **Type definitions** in `packages/types` — shared DTOs for frontend consumption

---

## PostgreSQL Views

All views live in the `public` schema and are readable via the Supabase REST API or directly from the NestJS service with `prisma.$queryRawUnsafe`.

### `v_person_signals`
Full operator profile with seven derived boolean signals per person.

**Key columns:**

| Column | Type | Meaning |
|---|---|---|
| `person_id` | uuid | Primary key |
| `name` | text | Canonical display name |
| `expertise` | text[] | Enriched expertise tags |
| `yc_batch` | text | YC batch of primary org (e.g. "Summer 2021") |
| `is_yc_backed` | bool | True if any org is YC-backed |
| `is_repeat_founder` | bool | Founded 2+ companies |
| `is_first_time_founder` | bool | Founded exactly 1 company |
| `is_cross_company_operator` | bool | Active at 3+ orgs (any role) |
| `is_co_founder` | bool | Co-founded with at least 1 other person |
| `is_solo_founder` | bool | Founded a company alone |
| `is_currently_active` | bool | Has at least one current role |
| `founder_org_count` | int | # companies founded |
| `org_count` | int | # orgs with any role |
| `primary_org_*` | various | Name/id/stage/logo/industry of most relevant org |

**Signal counts (current):**
- 199 repeat founders
- 8 cross-company operators
- 7,847 co-founders
- 1,463 solo founders
- 9,258 YC-backed
- 3,367 with expertise tags
- 1,433 with avatar URL

---

### `v_org_profile`
Full org profile with aggregated founder arrays and seven derived signals.

**Key columns:**

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid | Primary key |
| `founder_count` | int | # people with founder/C-suite roles |
| `founder_names` | text[] | Array of founder canonical names |
| `founder_ids` | text[] | Array of founder person UUIDs |
| `founder_expertise` | text[] | Union of all founder expertise tags |
| `is_founder_unknown` | bool | No founder data at all |
| `is_solo_founded` | bool | Exactly 1 founder |
| `is_duo_founded` | bool | Exactly 2 founders |
| `is_multi_founder` | bool | 2+ founders |
| `is_large_team` | bool | 3+ founders |
| `has_repeat_founder` | bool | At least 1 founder with 2+ companies |
| `repeat_founder_count` | int | # repeat founders on the team |

**Signal counts (current):**
- 5,020 orgs total
- 1,471 solo-founded
- 2,597 duo-founded
- 3,477 multi-founder
- 880 large-team (≥3 founders)
- 323 with at least one repeat founder
- 72 with unknown founder

---

### `v_repeat_founders`
Pre-filtered view of `v_person_signals` where `founder_org_count >= 2`. 199 rows.

### `v_cross_company_operators`
Pre-filtered view of `v_person_signals` where `org_count >= 3`. 8 rows.

### `v_batch_clusters`
One row per YC batch. Aggregates company count, founder count, industry list, and top expertise tags.

### `v_expertise_clusters`
One row per expertise tag. Aggregates founder count, repeat founder count, YC founder count, and a sample of 5 founder names.

---

## REST API — `NetworkModule`

Base path: `/network`

### Founder Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/network/founders` | Paginated operator list with signal filters |
| GET | `/network/founders/repeat` | All repeat founders (founder_org_count ≥ 2) |
| GET | `/network/founders/cross-company` | Cross-company operators (org_count ≥ 3) |
| GET | `/network/founders/:id/profile` | Full profile + signals for one person |

**Query params for `/network/founders`:**

| Param | Type | Effect |
|---|---|---|
| `page` / `limit` | number | Pagination (default 1/20, max 100) |
| `expertise` | string | Filter by single expertise tag |
| `ycBatch` | string | Filter by batch (partial match, e.g. "W21") |
| `ycOnly` | boolean | Restrict to YC-backed founders |
| `repeatFounder` | boolean | Restrict to repeat founders |
| `soloFounder` | boolean | Restrict to solo founders |
| `coFounder` | boolean | Restrict to co-founders |
| `crossCompany` | boolean | Restrict to cross-company operators |
| `country` | string | Filter by country code |
| `domain` | string | Filter by primary domain (partial match) |

### Batch Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/network/batches` | All YC batch clusters (most recent first) |
| GET | `/network/batches/:batch` | Cluster for a specific batch (e.g. "W21") |

### Expertise Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/network/expertise` | All expertise clusters (by founder count) |
| GET | `/network/expertise/:tag` | Cluster for a specific tag (e.g. "engineering") |

### Org Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/network/orgs/:id/profile` | Full org profile + founder signals |
| GET | `/network/orgs/:id/founders` | All operator profiles connected to an org |

---

## Response Shapes

All shapes are exported from `@founder-intel/types`:

- **`OperatorProfileDto`** — full person + `PersonSignalsDto` signals block
- **`OrgProfileDto`** — full org + founder arrays + signals block
- **`BatchClusterDto`** — `{ ycBatch, companyCount, founderCount, industries, topExpertiseTags }`
- **`ExpertiseClusterDto`** — `{ tag, founderCount, repeatFounders, ycFounders, sampleFounders }`
- **`PaginatedResponse<T>`** — wraps list endpoints with `{ data, meta }`

---

## Most Useful Signals

**For investor/scout workflows:**
- `is_repeat_founder` — highest signal; 199 identified
- `is_co_founder` + `has_repeat_founder` on the org side — team quality proxy
- `yc_batch` — network provenance, alumni matching

**For recruiting/network workflows:**
- `expertise` array + `is_currently_active` — available talent with domain tags
- `is_cross_company_operator` — high-value connector nodes (8 people across 3+ companies)
- `org_count` + `role_count` — operator density signal

**For competitive intelligence:**
- Org `founder_expertise` — team capability fingerprint
- `is_large_team` — indicates well-resourced early teams
- `repeat_founder_count` on org — experienced founding team indicator

---

## Data Gaps & Next Steps

| Gap | Impact | Mitigation |
|---|---|---|
| Only 3,367 / 9,286 (36%) have expertise tags | Expertise filter returns partial results | Run enrich_fast.py phase 5 again after new role data ingested |
| Only 1,433 / 9,286 (15%) have avatarUrl | Profile cards lack headshots | Deploy `enrich-avatars` edge function (unavatar.io, ~83% hit rate) |
| Only 8 cross-company operators | Signal too sparse for clustering | Needs richer role data beyond YC founders list |
| `location`/`country` missing for ~60% | Geography filters limited | Run enrich_fast.py phase 9 more broadly |
| No LinkedIn scraping (blocked) | Bio/work history gaps | Consider Clay or Apollo integration for enrichment |
| `ycBatch` format inconsistent ("Summer 2021" vs "S21") | Batch filter needs normalization | Add a normalization step in enrich_fast.py |
