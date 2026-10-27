-- Native Vekta share links and viewer analytics. Existing deck_shares and
-- deck_share_views rows are retained; plaintext legacy tokens are migrated to
-- hashes before being cleared so their existing URLs continue to resolve.

SET search_path TO public, extensions;

ALTER TABLE public.deck_shares
  ALTER COLUMN token DROP NOT NULL,
  ALTER COLUMN token DROP DEFAULT,
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS intended_investor_id uuid REFERENCES public.firm_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS create_request_id text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS require_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_download boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deck_version_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS file_url_snapshot text,
  ADD COLUMN IF NOT EXISTS company_name_snapshot text,
  ADD COLUMN IF NOT EXISTS company_logo_url_snapshot text;

UPDATE public.deck_shares
SET token_hash = encode(digest(token, 'sha256'), 'hex'),
    name = COALESCE(NULLIF(name, ''), NULLIF(recipient_name, ''), 'Shared deck'),
    file_url_snapshot = d.file_url,
    deck_version_uploaded_at = d.uploaded_at
FROM public.company_pitch_decks d
WHERE d.id = deck_shares.deck_id
  AND (deck_shares.token_hash IS NULL OR deck_shares.file_url_snapshot IS NULL);

UPDATE public.deck_shares SET token = NULL WHERE token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_shares_token_hash
  ON public.deck_shares(token_hash) WHERE token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_shares_create_request
  ON public.deck_shares(user_id, create_request_id) WHERE create_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deck_shares_investor
  ON public.deck_shares(intended_investor_id) WHERE intended_investor_id IS NOT NULL;

-- A session is created only after the visitor passes link/password checks.
-- started_at stays NULL until PDF.js renders its first visible slide, so a
-- background file request alone never counts as a view.
CREATE TABLE IF NOT EXISTS public.deck_share_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL REFERENCES public.deck_shares(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL UNIQUE,
  visitor_hash text NOT NULL,
  started_at timestamptz,
  last_activity_at timestamptz,
  viewer_user_id text,
  viewer_email text,
  identity_status text NOT NULL DEFAULT 'anonymous'
    CHECK (identity_status IN ('anonymous', 'submitted_email', 'verified_account')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deck_share_sessions_share_started
  ON public.deck_share_sessions(share_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_deck_share_sessions_visitor
  ON public.deck_share_sessions(share_id, visitor_hash, started_at DESC);

-- Client event_id is stable across retries. Duration entries are bounded and
-- inserted once; the dashboard labels their sum as an estimate.
CREATE TABLE IF NOT EXISTS public.deck_share_events (
  event_id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.deck_share_sessions(id) ON DELETE CASCADE,
  share_id uuid NOT NULL REFERENCES public.deck_shares(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('session_start', 'slide_view', 'slide_time', 'session_end')),
  slide_number integer,
  active_seconds integer NOT NULL DEFAULT 0 CHECK (active_seconds BETWEEN 0 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (slide_number IS NULL OR slide_number BETWEEN 1 AND 500)
);
CREATE INDEX IF NOT EXISTS idx_deck_share_events_share_created
  ON public.deck_share_events(share_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deck_share_events_session_slide
  ON public.deck_share_events(session_id, slide_number, event_type);

-- Keep session summaries in the same transaction as a newly accepted event.
-- ON CONFLICT DO NOTHING retries do not fire this trigger a second time.
CREATE OR REPLACE FUNCTION public.update_deck_share_session_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.event_type = 'session_start' THEN
    UPDATE public.deck_share_sessions
    SET started_at = COALESCE(started_at, NEW.created_at),
        last_activity_at = GREATEST(COALESCE(last_activity_at, NEW.created_at), NEW.created_at)
    WHERE id = NEW.session_id;
  ELSIF NEW.event_type IN ('slide_view', 'slide_time') THEN
    UPDATE public.deck_share_sessions
    SET last_activity_at = GREATEST(COALESCE(last_activity_at, NEW.created_at), NEW.created_at)
    WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS deck_share_event_updates_session ON public.deck_share_events;
CREATE TRIGGER deck_share_event_updates_session
  AFTER INSERT ON public.deck_share_events
  FOR EACH ROW EXECUTE FUNCTION public.update_deck_share_session_activity();

-- Persistent atomic windows work across concurrent Vercel function instances.
CREATE TABLE IF NOT EXISTS public.deck_share_rate_limits (
  key_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits >= 0)
);
CREATE INDEX IF NOT EXISTS idx_deck_share_rate_limits_window
  ON public.deck_share_rate_limits(window_started_at);

CREATE OR REPLACE FUNCTION public.consume_deck_share_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_hits integer;
BEGIN
  IF p_key_hash IS NULL OR p_limit < 1 OR p_window_seconds < 1 THEN
    RETURN false;
  END IF;
  IF random() < 0.01 THEN
    DELETE FROM public.deck_share_rate_limits WHERE window_started_at < now() - interval '1 day';
  END IF;
  INSERT INTO public.deck_share_rate_limits(key_hash, window_started_at, hits)
  VALUES (p_key_hash, now(), 1)
  ON CONFLICT (key_hash) DO UPDATE SET
    hits = CASE
      WHEN public.deck_share_rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds) THEN 1
      ELSE public.deck_share_rate_limits.hits + 1
    END,
    window_started_at = CASE
      WHEN public.deck_share_rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds) THEN now()
      ELSE public.deck_share_rate_limits.window_started_at
    END
  RETURNING hits INTO current_hits;
  RETURN current_hits <= p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_deck_share_analytics(p_owner_id text, p_deck_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
WITH selected_deck AS (
  SELECT d.id, d.user_id, d.file_name, d.uploaded_at, d.slide_count
  FROM public.company_pitch_decks d
  WHERE d.id = p_deck_id AND d.user_id = p_owner_id
), link_stats AS (
  SELECT
    s.id, s.name, s.recipient_name, s.recipient_firm, s.recipient_email,
    s.intended_investor_id, s.created_at, s.expires_at, s.revoked_at,
    s.show_download, d.file_name, d.uploaded_at AS deck_version_uploaded_at, d.slide_count,
    (SELECT count(*) FROM public.deck_share_sessions vs WHERE vs.share_id = s.id AND vs.started_at IS NOT NULL) AS total_visits,
    (SELECT count(DISTINCT vs.visitor_hash) FROM public.deck_share_sessions vs WHERE vs.share_id = s.id AND vs.started_at IS NOT NULL) AS unique_viewers,
    COALESCE((SELECT sum(ev.active_seconds) FROM public.deck_share_events ev JOIN public.deck_share_sessions vs ON vs.id = ev.session_id WHERE ev.share_id = s.id AND ev.event_type = 'slide_time' AND vs.started_at IS NOT NULL), 0) AS viewing_seconds_estimate,
    (SELECT max(vs.last_activity_at) FROM public.deck_share_sessions vs WHERE vs.share_id = s.id AND vs.started_at IS NOT NULL) AS last_activity_at,
    (SELECT count(DISTINCT vs.visitor_hash) FROM public.deck_share_sessions vs WHERE vs.share_id = s.id AND vs.started_at IS NOT NULL AND vs.identity_status = 'anonymous') AS anonymous_viewers,
    (SELECT count(DISTINCT vs.visitor_hash) FROM public.deck_share_sessions vs WHERE vs.share_id = s.id AND vs.started_at IS NOT NULL AND vs.identity_status = 'submitted_email') AS submitted_viewers,
    (SELECT count(DISTINCT vs.visitor_hash) FROM public.deck_share_sessions vs WHERE vs.share_id = s.id AND vs.started_at IS NOT NULL AND vs.identity_status = 'verified_account') AS verified_viewers,
    COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('email', vs.viewer_email, 'status', 'submitted, unverified')) FROM public.deck_share_sessions vs WHERE vs.share_id = s.id AND vs.started_at IS NOT NULL AND vs.identity_status = 'submitted_email' AND vs.viewer_email IS NOT NULL), '[]'::jsonb) AS submitted_identities,
    COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('email', vs.viewer_email, 'status', 'verified account')) FROM public.deck_share_sessions vs WHERE vs.share_id = s.id AND vs.started_at IS NOT NULL AND vs.identity_status = 'verified_account' AND vs.viewer_email IS NOT NULL), '[]'::jsonb) AS verified_identities,
    CASE WHEN d.slide_count > 0 THEN (
      SELECT round(100.0 * count(*) FILTER (WHERE seen.slide_count >= d.slide_count) / NULLIF(count(*), 0), 1)
      FROM (
        SELECT vs.id, count(DISTINCT ev.slide_number) AS slide_count
        FROM public.deck_share_sessions vs
        LEFT JOIN public.deck_share_events ev ON ev.session_id = vs.id AND ev.event_type = 'slide_view'
    WHERE vs.share_id = s.id AND vs.started_at IS NOT NULL
        GROUP BY vs.id
      ) seen
    ) ELSE NULL END AS completion_rate,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('slideNumber', page.slide_number, 'viewers', page.viewer_count, 'activeSecondsEstimate', page.active_seconds))
      FROM (
        SELECT ev.slide_number, count(DISTINCT ev.session_id) AS viewer_count, sum(ev.active_seconds) AS active_seconds
        FROM public.deck_share_events ev
        JOIN public.deck_share_sessions vs ON vs.id = ev.session_id
        WHERE ev.share_id = s.id AND ev.event_type = 'slide_time' AND vs.started_at IS NOT NULL AND ev.slide_number IS NOT NULL
        GROUP BY ev.slide_number ORDER BY ev.slide_number
      ) page
    ), '[]'::jsonb) AS slide_engagement,
    COALESCE((
      SELECT sum(visitor.session_count - 1)
      FROM (SELECT count(*) AS session_count FROM public.deck_share_sessions vs WHERE vs.share_id = s.id AND vs.started_at IS NOT NULL GROUP BY vs.visitor_hash HAVING count(*) > 1) visitor
    ), 0) AS returning_visits
  FROM public.deck_shares s
  JOIN selected_deck d ON d.id = s.deck_id AND d.user_id = s.user_id
  WHERE s.user_id = p_owner_id
), totals AS (
  SELECT
    COALESCE(sum(ls.total_visits), 0) AS total_visits,
    (SELECT count(DISTINCT vs.visitor_hash)
      FROM public.deck_share_sessions vs JOIN public.deck_shares s ON s.id = vs.share_id JOIN selected_deck d ON d.id = s.deck_id
      WHERE s.user_id = p_owner_id AND vs.started_at IS NOT NULL) AS unique_viewers,
    COALESCE(sum(ls.viewing_seconds_estimate), 0) AS viewing_seconds_estimate,
    max(ls.last_activity_at) AS last_activity_at,
    CASE WHEN max(d.slide_count) > 0 THEN round(
      sum(ls.total_visits * ls.completion_rate) / NULLIF(sum(ls.total_visits), 0), 1
    ) ELSE NULL END AS completion_rate
  FROM selected_deck d LEFT JOIN link_stats ls ON true
)
SELECT CASE WHEN EXISTS (SELECT 1 FROM selected_deck) THEN jsonb_build_object(
  'deck', (SELECT jsonb_build_object('id', d.id, 'fileName', d.file_name, 'uploadedAt', d.uploaded_at, 'slideCount', d.slide_count) FROM selected_deck d),
  'totals', (SELECT jsonb_build_object('totalVisits', t.total_visits, 'uniqueViewers', t.unique_viewers, 'viewingSecondsEstimate', t.viewing_seconds_estimate, 'completionRate', t.completion_rate, 'lastActivityAt', t.last_activity_at) FROM totals t),
  'links', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ls.id, 'name', ls.name, 'intendedInvestorName', ls.recipient_name, 'intendedInvestorFirm', ls.recipient_firm, 'intendedInvestorEmail', ls.recipient_email, 'intendedInvestorId', ls.intended_investor_id, 'createdAt', ls.created_at, 'expiresAt', ls.expires_at, 'revokedAt', ls.revoked_at, 'showDownload', ls.show_download, 'versionUploadedAt', ls.deck_version_uploaded_at, 'totalVisits', ls.total_visits, 'uniqueViewers', ls.unique_viewers, 'viewingSecondsEstimate', ls.viewing_seconds_estimate, 'completionRate', ls.completion_rate, 'returningVisits', ls.returning_visits, 'lastActivityAt', ls.last_activity_at, 'anonymousViewers', ls.anonymous_viewers, 'submittedViewers', ls.submitted_viewers, 'verifiedViewers', ls.verified_viewers, 'submittedIdentities', ls.submitted_identities, 'verifiedIdentities', ls.verified_identities, 'slideEngagement', ls.slide_engagement) ORDER BY ls.created_at DESC) FROM link_stats ls), '[]'::jsonb),
  'lastSyncedAt', now(),
  'definitions', jsonb_build_object('totalVisits', 'Viewer sessions whose first rendered slide was recorded; file fetches are excluded.', 'uniqueViewers', 'Distinct first-party visitor IDs per selected deck version.', 'viewingSecondsEstimate', 'Seconds accumulated only while the viewer tab was visible and recently active; an estimate.', 'completionRate', 'Percent of started sessions that recorded a view of every slide in this PDF.', 'returningVisits', 'Sessions after the first session for the same visitor ID and share link.')
) ELSE NULL END;
$$;

ALTER TABLE public.deck_share_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_share_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_share_rate_limits ENABLE ROW LEVEL SECURITY;

-- All sharing/session/event access goes through Vercel handlers with the
-- server-only Supabase service key. Do not expose bearer tokens or analytics
-- tables through the browser Data API.
DROP POLICY IF EXISTS "Users can view own deck shares" ON public.deck_shares;
DROP POLICY IF EXISTS "Users can insert own deck shares" ON public.deck_shares;
DROP POLICY IF EXISTS "Users can update own deck shares" ON public.deck_shares;
DROP POLICY IF EXISTS "Users can delete own deck shares" ON public.deck_shares;
DROP POLICY IF EXISTS "Users can view own share views" ON public.deck_share_views;
REVOKE ALL ON TABLE public.deck_shares, public.deck_share_views,
  public.deck_share_sessions, public.deck_share_events, public.deck_share_rate_limits
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deck_shares, public.deck_share_views,
  public.deck_share_sessions, public.deck_share_events, public.deck_share_rate_limits
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.consume_deck_share_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_deck_share_rate_limit(text, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_deck_share_analytics(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_deck_share_analytics(text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.update_deck_share_session_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_deck_share_session_activity() TO service_role;
