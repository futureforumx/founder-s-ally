# Supabase Data Cleanup Plan

**Tables:** `investor_database` (firms) + `investor_partners` (people)
**Goal:** Ensure the right values are attached to each VC firm and investor/partner
**Date:** March 30, 2026

---

## The Problem

After auditing the codebase, import scripts, and schema, here's what's causing bad data:

1. **No validation at the database level** — no CHECK constraints, no UNIQUE on firm_name, score fields can be any integer (not just 0–100)
2. **Lossy CSV parsing** — location is parsed from free-text (e.g., "San Francisco, CA" vs "Singapore" vs "Boston | MA"), names default to "Investment Team" when missing (~400+ records)
3. **Enrichment overwrites without history** — Apollo, Clay, Hunter, and Gemini all write to the same fields with no conflict resolution. Last writer wins, no audit trail.
4. **Mixed types** — `aum` and `headcount` are TEXT fields that store "$500M–$1B", "unknown", or raw numbers. `total_headcount` is an INTEGER. Both coexist and can conflict.
5. **Partner ↔ Firm linkage gaps** — `partner_names` array on `investor_database` is populated separately from actual `investor_partners` rows, so they can drift apart
6. **Placeholder data treated as real** — client hooks silently fill nulls with defaults like `is_actively_deploying ?? true` and `stage: "Seed–Growth"`, masking actual gaps

---

## Phase 1: Audit (read-only, no changes)

Run diagnostic queries against live Supabase to quantify the damage before touching anything.

### 1A — Duplicate Firms

Find firms that share the same name (case-insensitive) or website domain.

```sql
-- Duplicate firm names
SELECT LOWER(firm_name), COUNT(*), ARRAY_AGG(id)
FROM investor_database
WHERE deleted_at IS NULL
GROUP BY LOWER(firm_name)
HAVING COUNT(*) > 1;

-- Duplicate website domains
SELECT LOWER(website_url), COUNT(*), ARRAY_AGG(id)
FROM investor_database
WHERE deleted_at IS NULL AND website_url IS NOT NULL
GROUP BY LOWER(website_url)
HAVING COUNT(*) > 1;
```

### 1B — Orphaned Partners

Partners pointing to firms that don't exist or were soft-deleted.

```sql
SELECT ip.id, ip.full_name, ip.firm_id
FROM investor_partners ip
LEFT JOIN investor_database id ON ip.firm_id = id.id
WHERE id.id IS NULL OR id.deleted_at IS NOT NULL;
```

### 1C — Placeholder / Junk Names

Partners with generic names from the import fallback.

```sql
SELECT id, full_name, first_name, last_name, firm_id
FROM investor_partners
WHERE first_name IN ('Investment', 'N/A', '', 'Unknown')
   OR last_name IN ('Team', 'N/A', '', 'Unknown')
   OR full_name ~ '^\s*$';
```

### 1D — Field Completeness Report

Count nulls/empty values for every critical field.

```sql
-- Firms
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE email IS NULL OR email = '') AS missing_email,
  COUNT(*) FILTER (WHERE website_url IS NULL) AS missing_website,
  COUNT(*) FILTER (WHERE hq_city IS NULL) AS missing_city,
  COUNT(*) FILTER (WHERE hq_state IS NULL) AS missing_state,
  COUNT(*) FILTER (WHERE hq_country IS NULL) AS missing_country,
  COUNT(*) FILTER (WHERE aum IS NULL OR aum = '') AS missing_aum,
  COUNT(*) FILTER (WHERE total_headcount IS NULL) AS missing_headcount,
  COUNT(*) FILTER (WHERE founded_year IS NULL) AS missing_founded,
  COUNT(*) FILTER (WHERE min_check_size IS NULL) AS missing_min_check,
  COUNT(*) FILTER (WHERE max_check_size IS NULL) AS missing_max_check,
  COUNT(*) FILTER (WHERE preferred_stage IS NULL) AS missing_stage,
  COUNT(*) FILTER (WHERE thesis_verticals = '{}') AS empty_verticals,
  COUNT(*) FILTER (WHERE description IS NULL) AS missing_description,
  COUNT(*) FILTER (WHERE reputation_score IS NULL) AS missing_rep_score,
  COUNT(*) FILTER (WHERE match_score IS NULL) AS missing_match_score,
  COUNT(*) FILTER (WHERE logo_url IS NULL) AS missing_logo
FROM investor_database
WHERE deleted_at IS NULL;

-- Partners
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE email IS NULL OR email = '') AS missing_email,
  COUNT(*) FILTER (WHERE linkedin_url IS NULL) AS missing_linkedin,
  COUNT(*) FILTER (WHERE title IS NULL) AS missing_title,
  COUNT(*) FILTER (WHERE bio IS NULL) AS missing_bio,
  COUNT(*) FILTER (WHERE stage_focus IS NULL OR stage_focus = '{}') AS missing_stage,
  COUNT(*) FILTER (WHERE sector_focus IS NULL OR sector_focus = '{}') AS missing_sector,
  COUNT(*) FILTER (WHERE check_size_min IS NULL) AS missing_check_min,
  COUNT(*) FILTER (WHERE check_size_max IS NULL) AS missing_check_max
FROM investor_partners
WHERE deleted_at IS NULL;
```

### 1E — Score Range Violations

Find scores outside the expected 0–100 range.

```sql
SELECT id, firm_name,
  match_score, reputation_score, responsiveness_score,
  value_add_score, network_strength, industry_reputation,
  founder_reputation_score, community_rating, volatility_score
FROM investor_database
WHERE deleted_at IS NULL
  AND (match_score NOT BETWEEN 0 AND 100
    OR reputation_score NOT BETWEEN 0 AND 100
    OR responsiveness_score NOT BETWEEN 0 AND 100
    OR value_add_score NOT BETWEEN 0 AND 100
    OR network_strength NOT BETWEEN 0 AND 100);
```

### 1F — Check Size Sanity

```sql
-- min > max (inverted ranges)
SELECT id, firm_name, min_check_size, max_check_size
FROM investor_database
WHERE min_check_size > max_check_size AND deleted_at IS NULL;

-- Same for partners
SELECT id, full_name, check_size_min, check_size_max
FROM investor_partners
WHERE check_size_min > check_size_max AND deleted_at IS NULL;
```

### 1G — Partner Count Mismatch

Compare the `partner_names` array on the firm vs actual partner rows.

```sql
SELECT
  id.id,
  id.firm_name,
  COALESCE(array_length(id.partner_names, 1), 0) AS listed_partners,
  COUNT(ip.id) AS actual_partners
FROM investor_database id
LEFT JOIN investor_partners ip ON ip.firm_id = id.id AND ip.deleted_at IS NULL
WHERE id.deleted_at IS NULL
GROUP BY id.id, id.firm_name, id.partner_names
HAVING COALESCE(array_length(id.partner_names, 1), 0) != COUNT(ip.id);
```

**Deliverable from Phase 1:** A report with exact counts for each issue category. This tells us how big the cleanup is before we start changing data.

---

## Phase 2: Schema Hardening (migration)

Add database-level constraints so bad data can't get in again. Run as a Supabase migration.

### 2A — CHECK constraints on scores

```sql
ALTER TABLE investor_database
  ADD CONSTRAINT chk_match_score CHECK (match_score BETWEEN 0 AND 100),
  ADD CONSTRAINT chk_reputation_score CHECK (reputation_score BETWEEN 0 AND 100),
  ADD CONSTRAINT chk_responsiveness_score CHECK (responsiveness_score BETWEEN 0 AND 100),
  ADD CONSTRAINT chk_value_add_score CHECK (value_add_score BETWEEN 0 AND 100),
  ADD CONSTRAINT chk_network_strength CHECK (network_strength BETWEEN 0 AND 100);

ALTER TABLE investor_partners
  ADD CONSTRAINT chk_p_match_score CHECK (match_score BETWEEN 0 AND 100),
  ADD CONSTRAINT chk_p_reputation_score CHECK (reputation_score BETWEEN 0 AND 100),
  ADD CONSTRAINT chk_p_responsiveness_score CHECK (responsiveness_score BETWEEN 0 AND 100);
```

### 2B — CHECK constraints on check sizes

```sql
ALTER TABLE investor_database
  ADD CONSTRAINT chk_check_size_range CHECK (min_check_size <= max_check_size);

ALTER TABLE investor_partners
  ADD CONSTRAINT chk_p_check_size_range CHECK (check_size_min <= check_size_max);
```

### 2C — Founded year range

```sql
ALTER TABLE investor_database
  ADD CONSTRAINT chk_founded_year CHECK (founded_year BETWEEN 1900 AND 2026);
```

### 2D — Unique firm name (case-insensitive)

```sql
CREATE UNIQUE INDEX idx_unique_firm_name
ON investor_database (LOWER(firm_name))
WHERE deleted_at IS NULL;
```

### 2E — NOT NULL slug with uniqueness

```sql
-- Backfill any null slugs first (Phase 3)
-- Then enforce:
ALTER TABLE investor_database
  ALTER COLUMN slug SET NOT NULL;
-- Unique index likely already exists, verify.
```

**Note:** Phase 2 constraints can only be applied AFTER Phase 3 fixes the data that would violate them. Write the migration, but apply constraints after cleanup.

---

## Phase 3: Data Fixes

Run these in order. Each step is idempotent (safe to re-run).

### 3A — Merge Duplicate Firms

For each set of duplicates found in 1A:

1. Pick the "best" record (most populated fields, most recent `last_enriched_at`)
2. Re-point all `investor_partners.firm_id` from duplicates to the winner
3. Merge any non-null fields from losers into winner
4. Soft-delete the losers (`SET deleted_at = NOW()`)

### 3B — Fix Placeholder Partner Names

For partners with "Investment Team" or similar:

1. If the firm has a `partner_names` array with real names, match by position and update
2. If enrichment data exists (Gemini output in `/data/enriched/`), pull names from there
3. If no real name is available, flag the record with a `needs_review = true` column (or tag)

### 3C — Normalize AUM Field

Convert the TEXT `aum` field to a clean numeric value:

```sql
-- Examples of what's in there now:
-- "$500M–$1B" → store 750000000 (midpoint)
-- "unknown" → NULL
-- "4500000000" → 4500000000
-- "$2.5B" → 2500000000

UPDATE investor_database SET aum =
  CASE
    WHEN aum ~ '^\d+(\.\d+)?$' THEN aum  -- already numeric
    WHEN aum ILIKE '%unknown%' THEN NULL
    -- Add more patterns based on audit results
  END
WHERE deleted_at IS NULL;
```

Consider adding a new `aum_numeric` BIGINT column alongside the text field for clean queries.

### 3D — Backfill Missing Locations

```sql
-- Default missing country to 'US' for firms with US state codes
UPDATE investor_database
SET hq_country = 'US'
WHERE hq_country IS NULL
  AND hq_state ~ '^[A-Z]{2}$'
  AND deleted_at IS NULL;
```

### 3E — Fix Inverted Check Sizes

```sql
UPDATE investor_database
SET min_check_size = max_check_size, max_check_size = min_check_size
WHERE min_check_size > max_check_size AND deleted_at IS NULL;

UPDATE investor_partners
SET check_size_min = check_size_max, check_size_max = check_size_min
WHERE check_size_min > check_size_max AND deleted_at IS NULL;
```

### 3F — Sync partner_names Array with Actual Partners

```sql
UPDATE investor_database id
SET partner_names = (
  SELECT ARRAY_AGG(ip.full_name ORDER BY ip.created_at)
  FROM investor_partners ip
  WHERE ip.firm_id = id.id AND ip.deleted_at IS NULL
),
total_partners = (
  SELECT COUNT(*)
  FROM investor_partners ip
  WHERE ip.firm_id = id.id AND ip.deleted_at IS NULL
)
WHERE deleted_at IS NULL;
```

### 3G — Clamp Out-of-Range Scores

```sql
UPDATE investor_database SET
  match_score = LEAST(GREATEST(match_score, 0), 100),
  reputation_score = LEAST(GREATEST(reputation_score, 0), 100),
  responsiveness_score = LEAST(GREATEST(responsiveness_score, 0), 100),
  value_add_score = LEAST(GREATEST(value_add_score, 0), 100),
  network_strength = LEAST(GREATEST(network_strength, 0), 100)
WHERE deleted_at IS NULL;
```

### 3H — Backfill Null Slugs

```sql
UPDATE investor_database
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(firm_name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
WHERE slug IS NULL AND deleted_at IS NULL;
```

### 3I — Clean Up Orphaned Partners

```sql
-- Soft-delete partners whose firm no longer exists
UPDATE investor_partners
SET deleted_at = NOW()
WHERE firm_id NOT IN (SELECT id FROM investor_database WHERE deleted_at IS NULL)
  AND deleted_at IS NULL;
```

---

## Phase 4: Code Fixes

Update the application code so it stops masking and creating bad data.

### 4A — Remove Silent Defaults in Hooks

In `useInvestorDirectory.ts`, change fallbacks to explicit "Unknown" values instead of plausible-sounding defaults:

| Current | Fix |
|---------|-----|
| `is_actively_deploying ?? true` | `is_actively_deploying ?? null` (show "Unknown" in UI) |
| `stage: "Seed–Growth"` | `stage: null` (show "—" in UI) |
| `description: firm_name + " is an active investor..."` | `description: null` |
| `checkSize: "$1M–$10M"` | `checkSize: null` |

### 4B — Add Validation to Import Scripts

In `seed-us-investors-920.ts`:

1. Add email format validation (regex or `validator` library)
2. Add `min_check_size <= max_check_size` assertion
3. Log warnings for records that fall back to defaults
4. Add uniqueness check: query existing firm by `LOWER(firm_name)` before insert

### 4C — Add Enrichment Conflict Resolution

In `enrich-investor-profiles.ts`:

1. Before overwriting a field, check if the existing value is non-null
2. If both old and new values exist, prefer the higher-confidence source
3. Log all overwrites to a new `enrichment_log` table for audit

### 4D — Add `updated_at` Trigger

```sql
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_investor_database_updated
  BEFORE UPDATE ON investor_database
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_investor_partners_updated
  BEFORE UPDATE ON investor_partners
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

---

## Phase 5: Verify

### 5A — Re-run Phase 1 Audit Queries

Every count should be 0 (or within acceptable thresholds).

### 5B — Spot-Check 10 Firms

Manually verify 10 randomly-selected firms:

- Does the firm name match the website?
- Are the listed partners real people at that firm? (Check LinkedIn)
- Is the check size range plausible for the firm type?
- Is the HQ location correct?

### 5C — UI Smoke Test

Load the investor directory in the app and verify:

- No "Investment Team" showing as partner names
- No "$1M–$10M" defaults on firms where check size is unknown
- Scores display correctly (0–100 range)
- Firm detail pages load partners correctly

---

## Execution Order

| Step | What | Risk | Reversible? |
|------|------|------|-------------|
| **Phase 1** | Run audit queries | None (read-only) | N/A |
| **Phase 3A** | Merge duplicates | Medium | Yes (soft-delete, can restore) |
| **Phase 3B–3I** | Fix data values | Low | Yes (backup first) |
| **Phase 2** | Apply constraints | Low | Yes (drop constraints) |
| **Phase 4A–D** | Code changes | Low | Yes (git revert) |
| **Phase 5** | Verify | None | N/A |

**Before starting Phase 3:** Take a full backup of `investor_database` and `investor_partners` tables.

---

## Questions to Decide Before Starting

1. **Duplicate strategy** — When two firm records exist for the same company, which wins? Most recently enriched? Most complete?
2. **Placeholder partners** — Delete "Investment Team" records entirely, or keep them as firm-level contacts?
3. **Score defaults** — Should null scores default to 50 (middle), 0, or stay null?
4. **AUM field** — Add a new `aum_numeric` column, or replace the text `aum` in place?
