# Phase 4 Blockers

## B1 — pg_net extension required for DB trigger

**Severity:** High (trigger silently no-ops without it)

The `notify_phase4_recs_refresh()` trigger calls `net.http_post()` from pg_net. If pg_net is not enabled, the trigger returns `NEW` without calling the Edge Function — org note changes will not auto-trigger rec refreshes.

**Resolution:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
```
Or enable it in the Supabase dashboard under Database → Extensions.

The trigger already has a safe-degradation path (`IF v_url IS NULL THEN RETURN NEW`), so it won't error if the URL is unconfigured — but recs will only refresh on manual backfill calls.

---

## B2 — app.supabase_url must be set for trigger to fire

**Severity:** Medium (trigger degrades gracefully but auto-refresh is disabled)

The trigger reads `current_setting('app.supabase_url', true)` to construct the Edge Function URL. This must be set at the database level:

```sql
ALTER DATABASE postgres SET "app.supabase_url" = 'https://<ref>.supabase.co';
ALTER DATABASE postgres SET "app.webhook_secret" = '<secret>';
```

Without this, inserting/updating `context_entity_notes` will not trigger a rec refresh. A manual backfill call is required instead.

---

## B3 — roles table: personId type assumption

**Severity:** Low (schema assumption, verify before deploy)

`person_org_affiliations` view joins `roles."personId"` directly to `people.id`. The roles table is Prisma-managed and uses camelCase. The view assumes `roles."personId"` is a `uuid` that matches `people.id`.

If Prisma stores `personId` as TEXT (UUID as string), the join `r."personId" = people.id` will still work in PostgreSQL due to implicit casting, but explicit cast may be needed if column types differ.

**Resolution:** Verify column types before migration:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'roles'
  AND column_name IN ('personId', 'organizationId', 'isCurrent');
```

---

## B4 — No person → org affiliation if roles/email data is absent

**Severity:** Low (data completeness issue, not a code bug)

`paths_to_organization()` relies on `person_org_affiliations` to identify org members. If:
- No Prisma roles exist for the org
- No people/crm_contacts have email matching the org's domain
- The org has no `domain` set

...then `target_members` will be empty and no paths (and therefore no recs) will be generated.

**Resolution:** Ensure organizations have a `domain` set, or that the org has roles populated via Prisma sync.

---

## B5 — Edge Function shared import path pattern

**Severity:** Medium (deployment concern — known from Phase 3)

The Edge Function (`backfill-phase4-recommendations/index.ts`) imports shared modules via `"./_shared/..."`. When deploying via the Supabase MCP `deploy_edge_function`, all shared files must be included in the deploy payload with their `_shared/` prefix preserved.

File name mapping for deploy payload:
```
index.ts                             → index.ts
_shared/generateRecommendations.ts  → _shared/generateRecommendations.ts
_shared/askIntro.ts                 → _shared/askIntro.ts
_shared/reachOut.ts                 → _shared/reachOut.ts
_shared/resolveIdentity.ts          → _shared/resolveIdentity.ts
_shared/connector-types.ts          → _shared/connector-types.ts
```

Do NOT use `"../_shared/..."` imports — the deploy API flattens the directory structure.

---

## B6 — expireStaleRecs: Supabase `.not("col", "in", ...)` syntax

**Severity:** Low (potential query bug if filter format is wrong)

The `expireStaleRecs` function constructs the NOT IN filter manually:
```ts
query.not("dedup_key", "in", `(${touchedDedupKeys.map(k => `"${k}"`).join(",")})`)
```

Supabase JS v2 expects the `in` filter value as an array, not a string. The `.not("col", "in", array)` syntax may need adjustment:
```ts
// Preferred alternative using direct filter:
query.filter("dedup_key", "not.in", `(${touchedDedupKeys.join(",")})`)
```

**Resolution:** If expiry isn't working, verify by logging the Supabase query and checking PostgREST filter syntax. A safe fallback is to fetch all open rec IDs and filter in TypeScript before issuing the UPDATE.
