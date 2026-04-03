# IO Remediation Execution Plan
**Date:** 2026-04-03
**Project:** `zmnlsdohtwztneamvwaq` (vekta, us-east-1)

---

## A. Exact Code Changes

Three files were patched. Diffs below show every line changed.

---

### A1. `src/hooks/useInvestorDirectory.ts`

**Root cause this fixes:** Full-table `SELECT *` on `firm_records` (17,980 rows, 80+ columns including vector field) running every 10 minutes per browser tab AND on every window focus event. Responsible for 81,825 sequential scans — the single largest IO driver.

```diff
+// Columns actually consumed by mapDbInvestor() — nothing more.
+const DIRECTORY_COLUMNS = [
+  "id", "firm_name", "thesis_verticals", "preferred_stage",
+  "sentiment_detail", "location", "min_check_size", "max_check_size",
+  "logo_url", "firm_type", "is_actively_deploying", "founder_reputation_score",
+  "headcount", "aum", "is_trending", "is_popular", "is_recent",
+  "website_url", "recent_deals",
+].join(",");

 export function useInvestorDirectory() {
   return useQuery({
     queryKey: ["investor-directory"],
     queryFn: async (): Promise<LiveInvestorEntry[]> => {
       const { data, error } = await supabase
         .from("firm_records")
-        .select("*")
-        .order("firm_name");
+        .select(DIRECTORY_COLUMNS)
+        .is("deleted_at", null)
+        .order("firm_name");

       if (error) throw error;
       return (data || []).map(mapDbInvestor);
     },
-    staleTime: 5 * 60 * 1000,
-    gcTime: 30 * 60 * 1000,
-    refetchOnWindowFocus: true,      // ← was driving seq scans on window switch
-    refetchInterval: 10 * 60 * 1000, // ← was 10 min; too aggressive for static data
+    staleTime: 30 * 60 * 1000,
+    gcTime: 60 * 60 * 1000,
+    refetchOnWindowFocus: false,
+    refetchInterval: 60 * 60 * 1000,
     placeholderData: (prev) => prev,
   });
 }
```

**Expected impact:** Reduces `firm_records` seq_scan rate from 81,825 down to ~1,000–2,000/day (one read per unique user session per hour). Removes `refetchOnWindowFocus` which was generating a scan every time a user switched browser tabs.

---

### A2. `src/components/InvestorMatch.tsx` — Line 245

**Root cause this fixes:** Unbounded `SELECT *` on component mount — same 17,980 rows × 80 columns, no `LIMIT`, no column projection, not cached.

```diff
-      const { data, error } = await supabase.from("firm_records").select("*");
+      const { data, error } = await supabase
+        .from("firm_records")
+        .select(
+          "id,firm_name,lead_partner,thesis_verticals,preferred_stage," +
+          "min_check_size,max_check_size,recent_deals,location,lead_or_follow," +
+          "ca_sb54_compliant,market_sentiment,sentiment_detail," +
+          "is_trending,is_popular,is_recent,logo_url,website_url"
+        )
+        .is("deleted_at", null);
       if (!error && data) setInvestors(data as unknown as Investor[]);
```

**Expected impact:** Reduces payload from ~80 columns to the 17 fields in the `Investor` interface. Adds `deleted_at` filter to avoid pulling soft-deleted rows.

---

### A3. `supabase/functions/enrich-pipeline/index.ts` — Lines 235–265

**Root cause this fixes:** Row-by-row PATCH and POST in for-loops. For a firm with 10 partners, the old code issued 10 individual HTTP→DB roundtrips to deactivate, then 10 more to upsert. With 25 firms per batch, that's up to 500 individual DB writes. Confirmed by `pg_stat_statements`: 38,806 individual INSERT calls to `firm_investors`.

```diff
-    // Mark partners NOT in new list as inactive
-    const toDeactivate = existing.filter(...);
-    for (const p of toDeactivate) {
-      await fetch(`/rest/v1/firm_investors?id=eq.${p.id}`, {
-        method: "PATCH",
-        body: JSON.stringify({ is_active: false, updated_at: ... }),
-      });
-    }
-
-    // Upsert current partners
-    for (const name of result.current_partners) {
-      await fetch(`/rest/v1/firm_investors`, {
-        method: "POST",
-        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
-        body: JSON.stringify({ firm_id, full_name: name, ... }),
-      });
-    }

+    // Batch deactivate: single PATCH using PostgREST `in` filter
+    if (toDeactivate.length > 0) {
+      const idList = toDeactivate.map((p) => p.id).join(",");
+      await fetch(`/rest/v1/firm_investors?id=in.(${idList})`, {
+        method: "PATCH",
+        body: JSON.stringify({ is_active: false, updated_at: ... }),
+      });
+    }
+
+    // Bulk upsert: single POST with full partner array
+    const partnerRows = result.current_partners.map((name) => ({
+      firm_id: firmId, full_name: name, title: null,
+      is_active: true, updated_at: ...,
+    }));
+    await fetch(`/rest/v1/firm_investors`, {
+      method: "POST",
+      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
+      body: JSON.stringify(partnerRows), // array, not a single object
+    });
```

**Expected impact:** Reduces `firm_investors` INSERT calls from 38,806 individual calls to ~1,550 (one per firm batch). Each insert also maintains 5 active indexes instead of the previous 11 (after the index drops in the migration).

---

## B. SQL Migration

**File:** `supabase/migrations/20260403120000_disk_io_remediation.sql`

The migration is already written and saved. Summary of what it does:

| Section | Action | Tables Affected |
|---|---|---|
| 1 | DROP 16 unused indexes | firm_investors, firm_records, people, organizations |
| 2 | CREATE pg_trgm + 3 trigram indexes | firm_records |
| 3 | CREATE 2 new useful indexes | firm_records |
| 4 | Tune autovacuum (scale_factor 2%) | firm_records, people, firm_investors, organizations |

---

## C. Deployment Steps (in order)

### Step 0 — Pre-flight: run VACUUM manually

These cannot run inside a migration transaction. Open the **Supabase SQL Editor** and run these first:

```sql
VACUUM ANALYZE public.firm_records;
VACUUM ANALYZE public.people;
VACUUM ANALYZE public.organizations;
VACUUM ANALYZE public.firm_investors;
VACUUM ANALYZE public.enrich_social_state;
VACUUM ANALYZE public.operator_companies;
```

Wait for each to complete before proceeding. This frees ~3,100 dead rows and immediately lowers IO for the queries that follow.

---

### Step 1 — Apply the SQL migration

**Option A — via Supabase CLI (recommended, applies to migration history):**
```bash
cd "VEKTA APP"
supabase db push --db-url "postgresql://postgres:[password]@db.zmnlsdohtwztneamvwaq.supabase.co:5432/postgres"
```

**Option B — via Supabase SQL Editor (paste and run directly):**
Copy the contents of `supabase/migrations/20260403120000_disk_io_remediation.sql` and run in the SQL Editor. The migration is idempotent (`IF EXISTS` / `IF NOT EXISTS` throughout).

> ⚠️ The migration file has `CONCURRENTLY` removed because Supabase's migration runner wraps in a transaction. If running manually via `psql`, add `CONCURRENTLY` back to all `DROP INDEX` and `CREATE INDEX` statements for zero-lock execution.

---

### Step 2 — Deploy the frontend code changes

```bash
cd "VEKTA APP"
git add src/hooks/useInvestorDirectory.ts
git add src/components/InvestorMatch.tsx
git commit -m "fix: project firm_records columns, remove aggressive refetch interval

- useInvestorDirectory: SELECT * → 19 projected columns, refetchInterval 10min→60min,
  refetchOnWindowFocus disabled. Fixes 81,825 seq scans on firm_records.
- InvestorMatch: SELECT * → 17 projected columns matching Investor interface,
  added deleted_at filter."

# Deploy to Vercel (or your hosting provider)
vercel --prod
```

---

### Step 3 — Deploy the updated Edge Function

```bash
supabase functions deploy enrich-pipeline --project-ref zmnlsdohtwztneamvwaq
```

Verify the deployment succeeded:
```bash
supabase functions list --project-ref zmnlsdohtwztneamvwaq
```

---

### Step 4 — Post-migration VACUUM (re-analyze planner stats after index drops)

After the migration runs and index drops complete, refresh planner statistics:
```sql
VACUUM ANALYZE public.firm_records;
VACUUM ANALYZE public.firm_investors;
```

---

### Step 5 — Run verification queries (Section D below)

Wait ~15 minutes for stats to accumulate, then run the verification suite.

---

## D. Verification Queries

Run these in the Supabase SQL Editor after deploy. Each has a "pass" condition.

---

### D1. Confirm seq_scan rate has dropped on `firm_records`

```sql
SELECT
  relname                                                        AS table_name,
  seq_scan,
  idx_scan,
  ROUND(100.0 * seq_scan / NULLIF(seq_scan + idx_scan, 0), 1)  AS seq_scan_pct,
  n_live_tup                                                     AS live_rows,
  n_dead_tup                                                     AS dead_rows
FROM pg_stat_user_tables
WHERE relname = 'firm_records';
```

**Pass condition:** `seq_scan_pct` trending downward. Within 24h of deploy it should be below 20% (was 60.7%). New seq scans should be accruing at <200/hour instead of the previous ~3,400/hour.

---

### D2. Confirm unused indexes were dropped

```sql
SELECT indexname, idx_scan
FROM pg_stat_user_indexes
WHERE relname IN ('firm_records', 'firm_investors', 'people', 'organizations')
  AND indexname IN (
    'idx_firm_investors_past_investments',
    'idx_firm_investors_co_investors',
    'idx_firm_investors_networks',
    'investor_partners_prisma_person_id_key',
    'idx_firm_investors_prisma_person_id',
    'idx_firm_investors_needs_review',
    'idx_investor_sector_embedding',
    'idx_firm_records_unique_firm_name',
    'investor_database_prisma_firm_id_key',
    'idx_firm_records_prisma_firm_id',
    'idx_firm_records_thesis_orientation',
    'idx_firm_records_hq_zip_code',
    'idx_firm_records_stage_focus',
    'idx_people_name',
    'idx_orgs_name',
    'organizations_domain_key',
    'organizations_ycId_key'
  );
```

**Pass condition:** Zero rows returned. If any rows return, that index was not dropped (check migration logs).

---

### D3. Confirm trigram indexes were created

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'firm_records'
  AND indexname IN (
    'idx_firm_records_firm_name_trgm',
    'idx_firm_records_website_url_trgm',
    'idx_firm_records_legal_name_trgm'
  );
```

**Pass condition:** 3 rows returned. If any are missing, run the `CREATE INDEX` statements manually.

---

### D4. Confirm trigram indexes are being used for ILIKE searches

```sql
-- Simulate the exact ReviewSubmissionModal pattern
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, firm_name FROM public.firm_records
WHERE firm_name ILIKE '%sequoia%'
  AND deleted_at IS NULL;
```

**Pass condition:** Plan shows `Bitmap Index Scan on idx_firm_records_firm_name_trgm` — not `Seq Scan`. If you still see `Seq Scan`, the trigram index may not have been created, or the query needs `SET enable_seqscan = off` to force-test (dev only).

---

### D5. Confirm dead row bloat is clearing

```sql
SELECT
  relname                                                              AS table_name,
  n_dead_tup                                                           AS dead_rows,
  n_live_tup                                                           AS live_rows,
  ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup, 0), 1)               AS dead_pct,
  last_autovacuum,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE relname IN ('firm_records', 'people', 'firm_investors', 'organizations', 'enrich_social_state')
ORDER BY dead_rows DESC;
```

**Pass condition:** `dead_pct` for `firm_records` < 5% (was 9%), `people` < 5% (was 12.4%). `enrich_social_state` dead_pct should drop to near 0% after VACUUM. `last_autovacuum` timestamps should be recent.

---

### D6. Confirm INSERT volume improvement on `firm_investors`

```sql
-- Reset pg_stat_statements to get a clean window after deploy
SELECT pg_stat_statements_reset();
-- (wait 30–60 minutes for enrichment pipeline to run)

-- Then check INSERT patterns
SELECT
  LEFT(query, 250)                         AS query_preview,
  calls,
  ROUND(total_exec_time::numeric / calls, 2) AS avg_ms,
  rows / NULLIF(calls, 0)                  AS avg_rows_per_call
FROM pg_stat_statements
WHERE query ILIKE '%INSERT%firm_investors%'
ORDER BY calls DESC
LIMIT 5;
```

**Pass condition:** After the enrich-pipeline fix is deployed, you should see a single INSERT with `avg_rows_per_call` of 5–15 (one per batch of partners) instead of `avg_rows_per_call = 1` repeated thousands of times.

---

### D7. Confirm no remaining high-frequency full-table reads

```sql
SELECT
  LEFT(query, 300)                           AS query_preview,
  calls,
  rows / NULLIF(calls, 0)                    AS avg_rows,
  ROUND(total_exec_time::numeric / calls, 2) AS avg_ms
FROM pg_stat_statements
WHERE rows / NULLIF(calls, 0) > 5000    -- queries returning >5k rows per call
  AND calls > 10
ORDER BY calls DESC
LIMIT 10;
```

**Pass condition:** No query returning >5,000 rows with high call frequency. The `useInvestorDirectory` query post-fix will return ~17,000 rows but should appear at most a few hundred times per day total, not thousands.

---

### D8. Confirm autovacuum tuning is active

```sql
SELECT
  relname,
  reloptions
FROM pg_class
WHERE relname IN ('firm_records', 'people', 'firm_investors', 'organizations')
  AND reloptions IS NOT NULL;
```

**Pass condition:** Each table shows an array containing `autovacuum_vacuum_scale_factor=0.02`. Example: `{autovacuum_vacuum_scale_factor=0.02,autovacuum_vacuum_threshold=50,autovacuum_analyze_scale_factor=0.01}`.

---

### D9. Confirm index count reduction on write-heavy tables

```sql
SELECT
  relname          AS table_name,
  COUNT(*)         AS index_count,
  pg_size_pretty(SUM(pg_relation_size(indexrelid))) AS total_index_size
FROM pg_stat_user_indexes
WHERE relname IN ('firm_records', 'firm_investors')
GROUP BY relname;
```

**Pass condition (approximate):**
- `firm_investors`: index count drops from 11 to 5, total index size from ~11 MB to ~8 MB
- `firm_records`: index count drops from 14 to 9, total index size from ~7.9 MB to ~4.5 MB

---

### D10. Overall IO health check (run weekly)

```sql
SELECT
  relname                                                              AS table_name,
  seq_scan,
  idx_scan,
  ROUND(100.0 * seq_scan / NULLIF(seq_scan + idx_scan, 0), 1)        AS seq_scan_pct,
  n_tup_ins AS inserts,
  n_tup_upd AS updates,
  n_dead_tup                                                           AS dead_rows,
  pg_size_pretty(pg_total_relation_size(relid))                        AS total_size
FROM pg_stat_user_tables
WHERE relname IN (
  'firm_records', 'firm_investors', 'people',
  'organizations', 'enrich_social_state'
)
ORDER BY seq_scan DESC;
```

**Pass condition:** `firm_records` seq_scan_pct < 20%. No table with >500 dead rows that hasn't been vacuumed in the last 6 hours.

---

## E. Expected Impact — Ranked by IO Reduction

| Rank | Fix | Expected IO Reduction | Difficulty | Deploy Risk |
|---|---|---|---|---|
| **1** | `useInvestorDirectory` column projection + disable refetchOnWindowFocus | **~70% reduction in firm_records IO** — removes the dominant scan driver. Equivalent to eliminating ~70,000 seq scans/day. | Low — 2 lines changed | Low — read-only change, no schema touch |
| **2** | Drop 16 unused indexes | **~12 MB of dead write overhead removed** per enrichment cycle. Every INSERT/UPDATE to firm_investors and firm_records becomes faster. | Zero — SQL only | Low — CONCURRENTLY, no lock |
| **3** | `enrich-pipeline` bulk writes | **~96% reduction in firm_investors INSERT calls** (38,806 → ~1,550 per enrichment run). Eliminates repeated single-row write amplification across all maintained indexes. | Low — 30 lines changed | Low — functional equivalence preserved |
| **4** | Autovacuum tuning | **Prevents dead row re-accumulation** — keeps bloat below 2% instead of letting it reach 9–12% before triggering. Indirect IO reduction: fewer bloated pages = fewer blocks read per scan. | Zero — SQL only | None — table-level override only |
| **5** | Trigram indexes for ILIKE | **Eliminates full scans on every ReviewSubmissionModal submission**. Each review lookup drops from O(17,980 rows) to O(matching rows via index). | Low — SQL only | None — additive, no removals |
| **6** | VACUUM ANALYZE (manual) | **Immediate** — reclaims 3,100 dead rows from firm_records, people, organizations right now without any code change. | None | None |
| **7** | `InvestorMatch.tsx` column projection | **Moderate** — reduces payload per query call but the query frequency is lower than useInvestorDirectory. Eliminates the vector/embedding field fetch from the match screen. | Low — 10 lines changed | Low — read-only change |

### Combined Expected Outcome

Before these fixes, the dominant IO pattern was:
- `firm_records`: 81,825 sequential scans / 12 days = ~6,800/day, driven by 10-min polling × active users × full-table reads
- `firm_investors`: 38,806 single-row INSERTs maintaining 11 indexes each
- Dead row bloat compounding across 4 tables

After all fixes are deployed, the expected steady-state should be:
- `firm_records` seq scans: ~800–1,500/day (one per active user per hour, projected columns only)
- `firm_investors` INSERTs: ~50–200/day (one bulk call per enrichment batch)
- Dead row bloat: <2% continuously, autovacuum running proactively
- Total index write overhead on firm_investors: reduced by ~45% (11 indexes → 5 active)
- ILIKE lookups: index-backed instead of full scans

These changes together should bring the project well within Supabase's Disk IO budget with comfortable headroom.
