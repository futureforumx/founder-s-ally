# Phase 4 Testing Checklist

All tests use the existing test context and owner: `owner_context_id = 63f046f1-9638-4ddb-8109-ef8396c21af3`.

---

## Test 1 — Org note insertion triggers webhook

**Setup:** Insert a `context_entity_notes` row for an organization in `researching` stage.

```sql
INSERT INTO context_entity_notes (owner_context_id, subject_type, organization_id, pipeline_stage)
VALUES (
  '63f046f1-9638-4ddb-8109-ef8396c21af3',
  'organization',
  '<known-org-uuid>',
  'researching'
);
```

**Assert:**
- [ ] Row inserted successfully (XOR constraint satisfied: `organization_id` set, `person_id` NULL)
- [ ] DB trigger `cen_notify_phase4_refresh` fires (check `pg_net` request queue or Edge Function logs)
- [ ] No duplicate on re-insert (unique index `cen_unique_org` returns 23505)

---

## Test 2 — person_org_affiliations returns org members

```sql
SELECT person_id, affiliation_type
FROM person_org_affiliations
WHERE organization_id = '<known-org-uuid>';
```

**Assert:**
- [ ] At least one row returned (from `roles`, `email_domain`, or `crm_contact`)
- [ ] Generic email domains (gmail.com etc.) are absent from `email_domain` rows
- [ ] Deduplication: same (person_id, org_id) can appear from multiple sources — that's expected

---

## Test 3 — paths_to_organization returns direct paths

**Setup:** Ensure a `relationship_edge` exists between selfPersonId and a member of the target org.

```sql
SELECT *
FROM paths_to_organization(
  '63f046f1-9638-4ddb-8109-ef8396c21af3',  -- owner_context_id
  '<target-org-uuid>',
  '<self-person-uuid>'
);
```

**Assert:**
- [ ] Rows returned with `path_type = 'direct'` for known direct connections
- [ ] `path_score` equals the `strength` of the corresponding `relationship_edge`
- [ ] `via_person_id` is NULL for direct rows

---

## Test 4 — paths_to_organization returns one-hop paths

**Setup:** Ensure self → A edge exists, and A → B edge exists where B is an org member but self → B edge does not exist.

```sql
SELECT * FROM paths_to_organization(
  '63f046f1-9638-4ddb-8109-ef8396c21af3',
  '<target-org-uuid>',
  '<self-person-uuid>'
);
```

**Assert:**
- [ ] `path_type = 'one_hop'` rows returned
- [ ] `via_person_id` is the intermediate person (A)
- [ ] `path_score = (strength_self_A * strength_A_B) / 100.0`
- [ ] One-hop rows do NOT include targets that already appear as `direct`

---

## Test 5 — ask_intro rec generated when only one-hop path exists

**Setup:** Ensure the target org has only one-hop paths from self (no direct connections).

Invoke backfill:
```bash
POST /functions/v1/backfill-phase4-recommendations
{ "ownerContextId": "63f046f1-9638-4ddb-8109-ef8396c21af3" }
```

**Assert:**
```sql
SELECT kind, subject_organization_id, via_person_id, score, state
FROM recommendations
WHERE owner_context_id = '63f046f1-9638-4ddb-8109-ef8396c21af3'
  AND kind = 'ask_intro';
```
- [ ] `ask_intro` rows exist for the target org
- [ ] `via_person_id` is non-null
- [ ] `score` reflects freshness decay (< path_score if last_interaction_at > 30d ago)
- [ ] At most 3 `ask_intro` recs per org
- [ ] `dedup_key` format: `ask_intro|{org_id}|{target_person_id}|{via_person_id}`

---

## Test 6 — reach_out rec generated for stale direct path (> 45 days)

**Setup:** Ensure a `relationship_edge` exists between self and an org member, with `last_interaction_at` older than 45 days.

Invoke backfill (same as above).

```sql
SELECT kind, subject_organization_id, subject_person_id, score, state
FROM recommendations
WHERE owner_context_id = '63f046f1-9638-4ddb-8109-ef8396c21af3'
  AND kind = 'reach_out';
```

**Assert:**
- [ ] `reach_out` row exists for the stale connection
- [ ] `via_person_id` is NULL (reach out directly)
- [ ] At most 2 `reach_out` recs per org
- [ ] No `reach_out` rec generated for a fresh direct path (≤ 45 days)
- [ ] `dedup_key` format: `reach_out|{org_id}|{target_person_id}`

---

## Test 7 — No duplicates on re-run; dismissed recs not regenerated

Run the backfill twice, then dismiss one rec:

```sql
UPDATE recommendations
SET state = 'dismissed'
WHERE id = '<rec-uuid>';
```

Run backfill a third time.

**Assert:**
- [ ] Second backfill: `created = 0`, `updated > 0` (scores refreshed, not duplicated)
- [ ] Third backfill: dismissed rec is NOT re-created
- [ ] `UNIQUE (owner_context_id, dedup_key)` constraint holds — no 23505 errors in response
- [ ] Stale recs (paths that no longer exist) have `state = 'expired'` after re-run

---

## Test 8 — State transition: org note leaves active stage → recs expire

Move the org note to a terminal stage:

```sql
UPDATE context_entity_notes
SET pipeline_stage = 'passed'
WHERE organization_id = '<org-uuid>'
  AND owner_context_id = '63f046f1-9638-4ddb-8109-ef8396c21af3';
```

Run backfill.

**Assert:**
- [ ] Recs for that org are now `state = 'expired'` (not regenerated since note is no longer active)
- [ ] Recs for other active orgs are unaffected
