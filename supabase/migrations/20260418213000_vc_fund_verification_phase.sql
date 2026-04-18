-- =============================================================================
-- Migration: verification-aware candidate status expansion
-- DATE:      2026-04-18
-- PURPOSE:   Add verification lifecycle states for fresh-capital candidates.
-- =============================================================================

ALTER TABLE public.candidate_capital_events
  DROP CONSTRAINT IF EXISTS candidate_capital_events_status_chk;

ALTER TABLE public.candidate_capital_events
  ADD CONSTRAINT candidate_capital_events_status_chk CHECK (
    status IN ('pending', 'ignored', 'escalated', 'verifying', 'verified', 'review', 'rejected', 'promoted')
  );

ALTER TABLE public.candidate_capital_events
  ADD COLUMN IF NOT EXISTS verification_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_candidate_capital_events_verification_status
  ON public.candidate_capital_events (status, confidence_score DESC, latest_seen_at DESC)
  WHERE status IN ('escalated', 'verifying', 'verified', 'review');
