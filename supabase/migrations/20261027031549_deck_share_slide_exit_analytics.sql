ALTER TABLE public.deck_share_events
  ADD COLUMN IF NOT EXISTS duration_seconds numeric(12,3),
  ADD COLUMN IF NOT EXISTS exit_action text;

ALTER TABLE public.deck_share_events
  DROP CONSTRAINT IF EXISTS deck_share_events_event_type_check,
  ADD CONSTRAINT deck_share_events_event_type_check
    CHECK (event_type IN ('session_start', 'slide_view', 'slide_time', 'slide_exit', 'session_end')),
  ADD CONSTRAINT deck_share_events_exit_action_check
    CHECK (exit_action IS NULL OR exit_action IN ('next_arrow', 'prev_arrow', 'keyboard', 'top_stepper', 'unload')),
  ADD CONSTRAINT deck_share_events_duration_seconds_check
    CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400),
  ADD CONSTRAINT deck_share_events_slide_exit_payload_check
    CHECK (
      (event_type = 'slide_exit' AND slide_number IS NOT NULL AND exit_action IS NOT NULL AND duration_seconds IS NOT NULL)
      OR event_type <> 'slide_exit'
    );

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
  ELSIF NEW.event_type IN ('slide_view', 'slide_time', 'slide_exit') THEN
    UPDATE public.deck_share_sessions
    SET last_activity_at = GREATEST(COALESCE(last_activity_at, NEW.created_at), NEW.created_at)
    WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$;
