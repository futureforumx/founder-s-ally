# People Intelligence Graph — Backend Architecture

## Overview

A multi-source enrichment and inference backend that builds canonical identity, employment history, activity signals, relationship edges, and reputation scores for people (investors, operators, founders) and organizations (VC firms, startups, portfolio companies).

LinkedIn is treated as one seed identity source among many — not the ground truth. All derived data carries provenance.

---

## Architecture Summary

```
LinkedIn URL / known entity
        │
        ▼
identity-resolution.service  ← resolveCanonicalPerson / Org
        │                       deterministic match → heuristic
        ▼
source-discovery.service     ← reads person_external_identities
        │                       + canonical URL fields
        ▼
[per source] fetch → parse → persist
source-parser.service        ← NormalizedPersonProfile / NormalizedOrgProfile
        │                       + RoleEntry[] + ActivitySignal[]
        ▼
person/org-enrichment.service (orchestrator)
        │
        ├── inference.service         → person/org_inferred_attributes
        ├── relationship-extraction   → person/org/person_org_relationship_edges
        ├── change-detection          → person/org_change_log
        └── reputation-scoring        → person/org_reputation_scores
        │
        ▼
pig_enrichment_runs / pig_enrichment_run_steps  (job tracking)
```

---

## New Migrations

| File | Description |
|------|-------------|
| `supabase/migrations/20260423120000_people_intelligence_graph.sql` | All new tables, indexes, triggers, RLS, views |

---

## New Tables

| Table | Purpose |
|-------|---------|
| `person_external_identities` | Polymorphic provider→external_id mapping per person |
| `organization_external_identities` | Same for orgs |
| `person_source_profiles` | Raw + normalized snapshots per provider per person |
| `organization_source_profiles` | Same for orgs |
| `person_organization_roles` | Employment/role history with normalization |
| `person_activity_signals` | Blog posts, job changes, press mentions, etc. |
| `organization_activity_signals` | Funding, hires, product launches, etc. |
| `person_relationship_edges` | Person↔person edges (co_worker, co_founder, mentor…) |
| `organization_relationship_edges` | Org↔org edges (investor_in, co_investor…) |
| `person_org_relationship_edges` | Person↔org edges (founder_of, investor_at, board_member…) |
| `person_inferred_attributes` | Rule-inferred seniority, function, topics, velocity, completeness |
| `organization_inferred_attributes` | Org type, sector, stage, hiring intensity |
| `person_reputation_scores` | 0–1 scores: credibility, visibility, centrality, completeness |
| `organization_reputation_scores` | Same for orgs |
| `person_capabilities` | Normalized skill/capability labels with scores |
| `person_topics` | Topic labels with scores |
| `organization_topics` | Topic labels for orgs |
| `person_change_log` | Detected field-level changes over time |
| `organization_change_log` | Same for orgs |
| `pig_enrichment_runs` | Top-level run tracking (idempotent via run_key) |
| `pig_enrichment_run_steps` | Per-step tracking within a run |

---

## New Views

| View | Purpose |
|------|---------|
| `person_current_roles` | Roles where `is_current = true` |
| `recent_person_role_changes` | Change log entries for employment fields, last 90d |
| `recent_org_activity` | Org signals in last 90d |
| `organization_recent_hiring_signals` | New hires + job post surges |
| `strongest_person_connectors` | People with highest edge count |
| `strongest_founder_to_investor_paths_basis` | 1-hop shared-org paths (founder→shared_org←investor) |

---

## New Services

| File | Exports |
|------|---------|
| `src/services/people-intel/types.ts` | All shared types, enums, Logger |
| `src/services/people-intel/db.ts` | `getServiceClient()` |
| `src/services/people-intel/identity-resolution.service.ts` | `resolveCanonicalPerson`, `resolveCanonicalOrganization`, `attachPersonExternalIdentity`, `scorePersonMatch` |
| `src/services/people-intel/source-discovery.service.ts` | `discoverPersonSources`, `discoverOrganizationSources` |
| `src/services/people-intel/source-parser.service.ts` | `parseLinkedInPersonSnapshot`, `parseOrgSnapshot`, `normalizeRoleFunction`, `normalizeSeniority` |
| `src/services/people-intel/person-enrichment.service.ts` | `enrichPerson` |
| `src/services/people-intel/organization-enrichment.service.ts` | `enrichOrganization` |
| `src/services/people-intel/inference.service.ts` | `inferPersonAttributes`, `inferOrganizationAttributes` |
| `src/services/people-intel/relationship-extraction.service.ts` | `extractPersonRelationships`, `extractOrganizationRelationships` |
| `src/services/people-intel/change-detection.service.ts` | `detectPersonChanges`, `detectOrganizationChanges` |
| `src/services/people-intel/reputation-scoring.service.ts` | `scorePersonReputation`, `scoreOrganizationReputation` |

---

## New Runners (CLI)

| File | Usage |
|------|-------|
| `src/services/people-intel/runners/run-person-refresh.ts` | Single person or batch by entity type |
| `src/services/people-intel/runners/run-org-refresh.ts` | Single org or batch by entity type |
| `src/services/people-intel/runners/run-needs-refresh-sweep.ts` | Nightly sweep of stale entities |

---

## New Edge Function

`supabase/functions/people-intel/index.ts` — single function with action-based routing.

### API Surface

All requests use `POST` with JSON body `{ action, ...params }`. Service role key required.

| Action | Params | Returns |
|--------|--------|---------|
| `enrich/person` | `entity_type`, `entity_id` | `{ run_id, status: "queued" }` |
| `enrich/organization` | `entity_type`, `entity_id` | `{ run_id, status: "queued" }` |
| `refresh/person` | same | same |
| `refresh/organization` | same | same |
| `person/graph` | `entity_type`, `entity_id`, `limit` | edges, roles, scores, attributes |
| `organization/graph` | same | org edges, person edges, signals, scores |
| `person/changes` | `entity_type`, `entity_id`, `limit`, `offset` | change log rows |
| `organization/changes` | same | change log rows |
| `intro-paths` | `entity_id` (founder), `limit` | shared-org path rows |
| `signals/recent` | `limit` | recent person + org signals |

---

## Commands

### Apply migration

```bash
# Via Supabase CLI (if local dev):
supabase db push

# Via Supabase SQL editor (remote):
# Paste supabase/migrations/20260423120000_people_intelligence_graph.sql
```

### Local test — dry run a single investor

```bash
pnpm tsx src/services/people-intel/runners/run-person-refresh.ts \
  --entity-type=firm_investor \
  --entity-id=<uuid> \
  --dry-run
```

### Enrich from a LinkedIn seed URL

```bash
pnpm tsx src/services/people-intel/runners/run-person-refresh.ts \
  --linkedin-url=https://linkedin.com/in/someone \
  --dry-run
```

### Batch nightly refresh sweep

```bash
pnpm tsx src/services/people-intel/runners/run-needs-refresh-sweep.ts \
  --freshness-days=7 \
  --limit=200
```

### Org refresh (single VC firm)

```bash
pnpm tsx src/services/people-intel/runners/run-org-refresh.ts \
  --entity-type=firm_record \
  --entity-id=<uuid> \
  --force
```

### Deploy edge function

```bash
supabase functions deploy people-intel
```

### Call edge function locally

```bash
curl -X POST http://localhost:54321/functions/v1/people-intel \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "action": "signals/recent", "limit": 10 }'
```

---

## Entity Type Conventions

| entity_type | Canonical table | PK type |
|-------------|----------------|---------|
| `firm_investor` | `firm_investors` | uuid |
| `operator_profile` | `operator_profiles` | uuid |
| `startup_founder` | `startup_founders` | text (cuid) |
| `firm_record` | `firm_records` | uuid |
| `organization` | `organizations` | uuid |
| `startup` | `startups` | text (cuid) |
| `generic` | — (no FK) | any text |

---

## Source Priority (merge rules)

For identity fields:
1. `website_official` / `website_personal`
2. `linkedin`
3. `website_team_page`
4. `press_release`
5. `speaker_page` / `podcast_page`
6. `x`, `github`
7. Aggregators: `crunchbase`, `angellist`, `signal_nfx`, `pitchbook`, `tracxn`

---

## Assumptions

1. **No real web fetching implemented** — parsers operate on data already stored in `*_source_profiles`. Add a fetcher/scraper adapter per provider as a follow-up.
2. **Relationship dedup** — uses SQL UNIQUE constraint on normalized (least/greatest) pair + edge_type. The `pig_upsert_person_rel_edge` RPC is referenced but not yet created; the code falls back to plain upsert.
3. **LinkedIn is seed-only** — URLs are used for identity resolution but not scraped directly.
4. **Model version** `rules-v1` on all inferences — no LLM. Upgrade path: add an `llm-v1` model_version that calls Anthropic and stores higher-confidence attribute values.
5. **Edge function is thin** — heavy enrichment (web fetching, parsing) lives in Node CLI runners. The edge function handles graph reads and queues run records.

---

## Phase 2 Follow-up

- [ ] Add web fetcher adapters per provider (LinkedIn → Playwright, Crunchbase → API, etc.)
- [ ] Add `pig_upsert_person_rel_edge` SQL RPC for evidence_count increment
- [ ] Add pgvector embeddings on `normalized_payload` for similarity search
- [ ] Add `person_capabilities` + `person_topics` population from parsed profiles
- [ ] Implement `enrichPersonFromLinkedInSeed` fully (resolve → attach → fetch raw LinkedIn profile)
- [ ] Add Supabase `pg_cron` schedule for `runNeedsRefreshSweep`
- [ ] Add warm intro path scoring via BFS over relationship edges
- [ ] Wire `intelligence_events` → `organization_activity_signals` ETL
- [ ] RLS policies for authenticated reads (currently service_role only)
