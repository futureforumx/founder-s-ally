# Founder Intelligence — Ingestion System

Backend-only founder intelligence platform for mapping the early-stage startup ecosystem.
Builds a canonical **people + company graph** from multiple public sources with full provenance,
deterministic deduplication, and YC as the highest-trust backbone.

---

## Quick Start

### Prerequisites
- Node.js ≥ 20
- pnpm ≥ 9
- Docker + Docker Compose

### 1. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env — set YC_ALGOLIA_SEARCH_KEY if you have it
```

### 4. Run database migrations

```bash
pnpm db:migrate
```

### 5. Start the API

```bash
pnpm dev
# API available at http://localhost:3000/api/v1
```

### 6. Trigger an ingestion run

```bash
# YC Companies (fully implemented)
curl -X POST http://localhost:3000/api/v1/ingestion/run \
  -H "Content-Type: application/json" \
  -d '{"source": "yc-companies"}'

# FoundersList (fully implemented)
curl -X POST http://localhost:3000/api/v1/ingestion/run \
  -H "Content-Type: application/json" \
  -d '{"source": "founders-list"}'

# Check job status
curl http://localhost:3000/api/v1/ingestion/jobs
```

### 7. Run via Docker Compose (all-in-one)

```bash
docker compose up
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/ingestion/run` | Trigger ingestion for a source |
| `GET` | `/api/v1/ingestion/jobs` | List ingestion jobs (paginated) |
| `GET` | `/api/v1/ingestion/jobs/:id` | Get single job |
| `GET` | `/api/v1/organizations` | List organizations (paginated, filtered) |
| `GET` | `/api/v1/organizations/:id` | Get organization |
| `GET` | `/api/v1/people` | List people (paginated, filtered) |
| `GET` | `/api/v1/people/:id` | Get person |
| `GET` | `/api/v1/search?q=stripe` | Full-text search across orgs + people |
| `GET` | `/api/v1/sources` | List registered adapters + compliance status |
| `GET` | `/api/v1/health` | DB + Redis + worker health check |

### Query parameters — `/organizations`

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page (default: 1) |
| `limit` | number | Per page, max 100 (default: 20) |
| `sortBy` | string | `canonicalName \| createdAt \| updatedAt \| foundedYear` |
| `sortOrder` | string | `asc \| desc` |
| `ycOnly` | boolean | Filter to YC-backed only |
| `ycBatch` | string | Filter by batch (e.g. `W24`) |
| `industry` | string | Filter by industry |
| `status` | string | Filter by status |
| `country` | string | Filter by country |

### Query parameters — `/people`

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page (default: 1) |
| `limit` | number | Per page, max 100 (default: 20) |
| `expertise` | string | Filter by expertise tag |
| `country` | string | Filter by country |
| `orgId` | string | Filter by organization ID |

---

## Adapter Status

| Source | Status | Notes |
|--------|--------|-------|
| `yc-companies` | ✅ Implemented | Uses YC Algolia search API. Robots.txt checked. |
| `founders-list` | ✅ Implemented | HTML scraping with Cheerio. Robots.txt checked. |
| `product-hunt` | 🟡 Scaffolded | Requires OAuth API key. Set `PRODUCT_HUNT_ENABLED=true`. |
| `betalist` | 🟡 Scaffolded | Compliance unclear. Disabled pending review. |
| `cofounders-lab` | 🟡 Scaffolded | Requires auth. Disabled pending review. |

---

## Matching Logic

Organizations are matched in priority order:

1. **Exact domain** → confidence 1.0, AUTO
2. **Normalized domain** → confidence 0.95, AUTO
3. **LinkedIn URL slug** → confidence 0.95, AUTO
4. **Name fuzzy** (single candidate ≥ 0.85) → confidence score, AUTO
5. **Name fuzzy** (multiple candidates or score < 0.85) → REVIEW
6. **No match** → create new record

People are matched in priority order:

1. **LinkedIn URL slug** → confidence 1.0, AUTO
2. **Name + org domain boost** (score ≥ 0.85) → AUTO
3. **Name + location boost** → may be REVIEW
4. **No match** → create new record

Every matching decision is stored in `match_decisions` with:
- `matchRuleUsed` — which rule fired
- `confidenceScore` — 0.0–1.0
- `decisionType` — AUTO or REVIEW
- `resolverVersion` — semver for reproducibility
- `candidateIds` — all candidates considered

---

## Architecture

```
founder-intel/
├── apps/
│   └── api/                    # NestJS REST API
│       └── src/
│           ├── ingestion/      # POST /ingestion/run, GET /ingestion/jobs
│           ├── organizations/  # GET /organizations
│           ├── people/         # GET /people
│           ├── search/         # GET /search
│           ├── sources/        # GET /sources
│           └── health/         # GET /health
│
└── packages/
    ├── types/                  # Shared TypeScript types (normalized, adapter, API)
    ├── database/               # Prisma schema + singleton client
    ├── adapters/               # Data source adapters
    │   ├── base/               # HttpClient, robots.txt checker
    │   ├── yc/                 # YC Companies (Algolia API)
    │   ├── founders-list/      # FoundersList (Cheerio scraper)
    │   ├── product-hunt/       # Scaffolded
    │   ├── betalist/           # Scaffolded
    │   └── cofounders-lab/     # Scaffolded
    ├── matching/               # Deduplication service
    │   └── utils/              # Levenshtein, token similarity, normalizers
    └── jobs/                   # BullMQ queues + ingestion processor
```

### Data Flow

```
POST /ingestion/run
      │
      ▼
  IngestionService
      │  creates IngestionJob (DB)
      │  enqueues BullMQ job
      │
      ▼
  processIngestionJob (BullMQ worker)
      │
      ├─ adapter.run() → AdapterResult
      │     ├── organizations[]
      │     ├── people[]
      │     ├── roles[]
      │     └── sourceRecords[]
      │
      ├─ MatchingService.upsertOrganization()
      │     ├── OrgMatcher.findMatch()  ← logs MatchDecision
      │     └── prisma.organization.upsert()
      │
      ├─ MatchingService.upsertPerson()
      │     ├── PersonMatcher.findMatch()  ← logs MatchDecision
      │     └── prisma.person.upsert()
      │
      ├─ MatchingService.upsertRole()
      │
      ├─ SourceRecord upsert (raw payload + provenance)
      │
      └─ IngestionJob status → completed
```

---

## YC-Specific Handling

- All YC API payload is stored verbatim in `Organization.ycRawJson` and `YcCompany.rawJson`
- YC fields (`ycBatch`, `ycId`, `isYcBacked`) are **never overwritten** by other sources
- `YcCompany` and `YcPerson` tables preserve the full YC object graph
- `ycId` is a unique identifier across both orgs and people
- YC batch is preserved as-is (e.g., `W24`, `S23`)

---

## Running Tests

```bash
# All tests
pnpm test

# Matching utilities only (fast, no DB)
pnpm --filter @founder-intel/matching test

# API tests
pnpm --filter @founder-intel/api test
```

---

## Compliance Notes

| Source | Robots.txt | API Auth | Notes |
|--------|-----------|----------|-------|
| YC | Checked at runtime | None (public Algolia key) | Read-only search key embedded in YC frontend |
| FoundersList | Checked at runtime | None | Public listing pages only |
| ProductHunt | Disallowed for scraping | OAuth required | Use official API |
| BetaList | Unknown | None | Disabled pending review |
| CoFoundersLab | Disallowed | Session auth required | Disabled pending review |

All adapters check `robots.txt` before fetching. If `robots.txt` disallows access or the check
fails for safety reasons, the adapter aborts gracefully and logs a warning.
