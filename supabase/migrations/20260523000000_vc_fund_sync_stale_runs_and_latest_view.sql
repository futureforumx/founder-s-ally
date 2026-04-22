-- =============================================================================
-- Migration: vc_fund_sync_runs stale-run cleanup + v_latest_vc_fund_sync view
-- DATE:      2026-05-23
-- PURPOSE:
--   1. Retroactively close out the 8 rows that are stuck in status='running'
--      (process crashes / interrupted CI jobs from 2026-04-19 and 2026-04-20).
--   2. Add a forward-looking safety net: a DO block that closes any remaining
--      stale rows (> 60 minutes) in case this migration runs after more accrue.
--   3. Create public.v_latest_vc_fund_sync — a lightweight view the frontend
--      can query to get the last successful daily sync timestamp and stats.
-- =============================================================================

-- ── PART 1: close out all existing stale runs ────────────────────────────────

UPDATE public.vc_fund_sync_runs
SET
  status        = 'failed',
  error_message = 'Marked failed retroactively: run exceeded 60-minute stale threshold. Process likely crashed or CI job was cancelled.',
  completed_at  = now()
WHERE status    = 'running'
  AND started_at < now() - interval '60 minutes';

-- ── PART 2: v_latest_vc_fund_sync — frontend "last updated" source ────────────
-- Returns one row: the most recently completed daily sync.
-- Fields: completed_at (timestamp) and stats (jsonb with inserted/updated/skipped counts).

CREATE OR REPLACE VIEW public.v_latest_vc_fund_sync AS
SELECT
  id,
  completed_at,
  stats,
  started_at
FROM public.vc_fund_sync_runs
WHERE phase     = 'daily'
  AND status    = 'completed'
ORDER BY completed_at DESC
LIMIT 1;

-- RLS: authenticated users may read (consistent with vc_fund_sync_runs policy).
-- Views inherit the underlying table's RLS when accessed by non-superusers,
-- so no separate policy is needed — the existing vc_fund_sync_runs policies apply.

COMMENT ON VIEW public.v_latest_vc_fund_sync IS
  'Latest successfully completed daily VC fund sync. '
  'Intended for frontend "last updated" display. '
  'Returns at most one row: completed_at, stats, id, started_at.';
