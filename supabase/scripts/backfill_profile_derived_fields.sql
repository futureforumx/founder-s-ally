-- Batched backfills for public.profiles derived columns:
--   last_active_at, actions_last_30d, engagement_score, intros_made_count, playbooks_used_count
--
-- After backfill, consumer reads: app → src/lib/profileRead.ts + public.profiles;
--   server/SQL → public.profiles_app_read (see migration 20260331210000_profiles_app_read_view.sql).
--
-- Run with a role that bypasses RLS (e.g. service_role) or as a SECURITY DEFINER function.
-- Tune batch size and sleep between batches to avoid long locks; prefer many small commits.

-- ── Expected sources (wire when tables/columns exist) ─────────────────────────
-- last_active_at      → max(timestamp) from activity stream per user/profile
-- actions_last_30d    → count of discrete actions in last 30d (define "action" in product)
-- engagement_score    → computed score 0–100 from rules or ML (nullable until computed)
-- intros_made_count   → count from introductions / warm-intro ledger (per founder profile)
-- playbooks_used_count → count from playbook_runs or equivalent

-- ── Pattern: keyset batch by profiles.id (repeat until 0 rows updated) ──────
-- Example — last_active_at from public.user_activity (exists today; maps user_id → profile):
/*
WITH batch AS (
  SELECT p.id AS profile_id, ua.last_active_at AS src_ts
  FROM public.profiles p
  INNER JOIN public.user_activity ua ON ua.user_id = p.user_id
  WHERE p.id > '00000000-0000-0000-0000-000000000000'::uuid
    AND (p.last_active_at IS DISTINCT FROM ua.last_active_at)
  ORDER BY p.id
  LIMIT 500
)
UPDATE public.profiles p
SET last_active_at = b.src_ts
FROM batch b
WHERE p.id = b.profile_id;
*/

-- ── Placeholder: actions_last_30d (replace event table/column names) ──────────
/*
WITH batch AS (
  SELECT p.id AS profile_id, COUNT(*)::integer AS c
  FROM public.profiles p
  -- JOIN public.profile_activity_events e ON e.profile_id = p.id
  -- WHERE e.occurred_at >= now() - interval '30 days'
  WHERE false
  GROUP BY p.id
  ORDER BY p.id
  LIMIT 500
)
UPDATE public.profiles p
SET actions_last_30d = b.c
FROM batch b
WHERE p.id = b.profile_id;
*/

-- ── Placeholder: intros_made_count ───────────────────────────────────────────
/*
WITH batch AS (
  SELECT p.id AS profile_id, COUNT(*)::integer AS c
  FROM public.profiles p
  -- JOIN public.introductions i ON i.initiator_profile_id = p.id
  WHERE false
  GROUP BY p.id
  ORDER BY p.id
  LIMIT 500
)
UPDATE public.profiles p
SET intros_made_count = b.c
FROM batch b
WHERE p.id = b.profile_id;
*/

-- ── Placeholder: playbooks_used_count ───────────────────────────────────────
/*
WITH batch AS (
  SELECT p.id AS profile_id, COUNT(*)::integer AS c
  FROM public.profiles p
  -- JOIN public.playbook_runs r ON r.profile_id = p.id
  WHERE false
  GROUP BY p.id
  ORDER BY p.id
  LIMIT 500
)
UPDATE public.profiles p
SET playbooks_used_count = b.c
FROM batch b
WHERE p.id = b.profile_id;
*/

-- ── engagement_score: usually computed in app/edge; SQL stub ────────────────
/*
UPDATE public.profiles p
SET engagement_score = LEAST(100, GREATEST(0, sub.score))
FROM (
  SELECT id, 0::numeric AS score
  FROM public.profiles
  WHERE id > $1::uuid
    AND engagement_score IS NULL
  ORDER BY id
  LIMIT 500
) sub
WHERE p.id = sub.id;
*/

-- After each batch in an external runner: SELECT pg_sleep(0.05);
