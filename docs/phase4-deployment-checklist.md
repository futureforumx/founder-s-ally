# Phase 4 Deployment Checklist

## Pre-flight

- [ ] Confirm Phase 1–3 migrations are applied and all Edge Functions are ACTIVE
- [ ] Confirm `pg_net` extension is enabled (`SELECT * FROM pg_extension WHERE extname = 'pg_net'`)
- [ ] Confirm `app.supabase_url` DB setting is configured (required for the DB trigger to fire the webhook)

---

## Step 1 — Apply migration

```sql
-- Apply via Supabase dashboard SQL editor or MCP apply_migration
-- File: supabase/migrations/0007_phase4_targeting_and_recommendations.sql
```

Via MCP:
```
apply_migration(name="0007_phase4_targeting_and_recommendations", query=<contents of file>)
```

Verify:
- [ ] `context_entity_notes` table exists with XOR constraint and partial UNIQUE indexes
- [ ] `recommendations` table exists with dedup UNIQUE constraint
- [ ] `person_org_affiliations` view is queryable
- [ ] `paths_to_organization()` function exists (`\df paths_to_organization`)
- [ ] `notify_phase4_recs_refresh` trigger is attached to `context_entity_notes`

---

## Step 2 — Set app.supabase_url DB setting (if not already set)

```sql
ALTER DATABASE postgres SET "app.supabase_url" = 'https://<your-project-ref>.supabase.co';
ALTER DATABASE postgres SET "app.webhook_secret" = '<your-webhook-secret>';
```

This allows the DB trigger to call the Edge Function. Without it, the trigger degrades safely (no-op) but recommendations won't auto-refresh on org note changes.

---

## Step 3 — Deploy Edge Function

The function reads shared modules via `./_shared/` imports. Deploy all files together:

Files to include in deploy payload:
- `backfill-phase4-recommendations/index.ts` → `index.ts`
- `_shared/generateRecommendations.ts` → `_shared/generateRecommendations.ts`
- `_shared/askIntro.ts` → `_shared/askIntro.ts`
- `_shared/reachOut.ts` → `_shared/reachOut.ts`
- `_shared/resolveIdentity.ts` → `_shared/resolveIdentity.ts`
- `_shared/connector-types.ts` → `_shared/connector-types.ts`

Via MCP `deploy_edge_function`:
```
name: backfill-phase4-recommendations
```

Verify:
- [ ] Function status = ACTIVE in Supabase dashboard
- [ ] Smoke test: POST with `{"dryRun": true}` returns 200 with `notesProcessed >= 0`

---

## Step 4 — Verify person_org_affiliations view

```sql
SELECT affiliation_type, count(*)
FROM person_org_affiliations
GROUP BY affiliation_type;
```

Expected: rows from `role`, `email_domain`, and/or `crm_contact` sources depending on data.

---

## Step 5 — Initial backfill

Trigger a full recommendation backfill across all contexts:

```bash
curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/backfill-phase4-recommendations \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Or via a test context:
```json
{ "ownerContextId": "<uuid>" }
```

Check response for `errors: []` and non-zero `notesProcessed` if any org notes exist in active stages.

---

## Step 6 — RLS spot-check

```sql
-- As authenticated user (Clerk JWT), confirm they can see their own recs
SELECT id, kind, state, score FROM recommendations LIMIT 5;

-- Confirm no cross-context leakage
SELECT DISTINCT owner_context_id FROM recommendations;
```
