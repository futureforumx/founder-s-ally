-- Preserve the referral code used by an approved waitlist applicant on the
-- corresponding platform user row. The waitlist tables remain the source of
-- truth for referral attribution; this column makes it available on users.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_code_used text;

-- Backfill already-approved applicants who already have a platform user row.
UPDATE public.users AS app_user
SET referral_code_used = referral.referral_code
FROM public.waitlist_users AS applicant
JOIN public.waitlist_referrals AS referral
  ON referral.referred_user_id = applicant.id
WHERE lower(trim(app_user.email)) = lower(trim(applicant.email))
  AND applicant.status = 'approved'
  AND app_user.referral_code_used IS NULL;

-- If the public.users row is created after approval, attach the same verified
-- referral attribution at insert time. Keep this function narrowly scoped to
-- copying an approved applicant's validated referral code onto their own row.
CREATE OR REPLACE FUNCTION public.sync_approved_waitlist_referral_to_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referral_code text;
  v_jwt jsonb := auth.jwt();
BEGIN
  IF NEW.referral_code_used IS NOT NULL OR NULLIF(trim(NEW.email), '') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Authenticated callers can only resolve the code for their own identity.
  -- Service-role and database-trigger contexts have no authenticated user claim.
  IF v_jwt->>'role' = 'authenticated'
     AND (
       v_jwt->>'sub' IS DISTINCT FROM NEW.id
       OR lower(v_jwt->>'email') IS DISTINCT FROM lower(trim(NEW.email))
     )
  THEN
    RETURN NEW;
  END IF;

  SELECT referral.referral_code
    INTO v_referral_code
  FROM public.waitlist_users AS applicant
  JOIN public.waitlist_referrals AS referral
    ON referral.referred_user_id = applicant.id
  WHERE lower(trim(applicant.email)) = lower(trim(NEW.email))
    AND applicant.status = 'approved'
  LIMIT 1;

  IF v_referral_code IS NOT NULL THEN
    NEW.referral_code_used := v_referral_code;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_approved_waitlist_referral_to_user()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_users_sync_approved_waitlist_referral ON public.users;
CREATE TRIGGER trg_users_sync_approved_waitlist_referral
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_approved_waitlist_referral_to_user();

-- Approval is the point at which referral attribution becomes available on an
-- existing platform user row. If that row does not exist yet, the insert
-- trigger above performs the copy later.
CREATE OR REPLACE FUNCTION public.admin_update_waitlist_status(
  p_waitlist_user_id uuid,
  p_status text,
  p_reviewed_by text,
  p_reviewed_by_email text DEFAULT NULL
)
RETURNS public.waitlist_users
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_previous_status text;
  v_updated public.waitlist_users;
BEGIN
  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported waitlist review status: %', p_status;
  END IF;

  IF NULLIF(trim(p_reviewed_by), '') IS NULL THEN
    RAISE EXCEPTION 'A reviewer identity is required';
  END IF;

  SELECT status
    INTO v_previous_status
    FROM public.waitlist_users
    WHERE id = p_waitlist_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Waitlist applicant not found';
  END IF;

  UPDATE public.waitlist_users
  SET
    status = p_status,
    reviewed_at = now(),
    reviewed_by = trim(p_reviewed_by),
    reviewed_by_email = NULLIF(lower(trim(p_reviewed_by_email)), '')
  WHERE id = p_waitlist_user_id
  RETURNING * INTO v_updated;

  IF p_status = 'approved' THEN
    UPDATE public.users AS app_user
    SET referral_code_used = referral.referral_code
    FROM public.waitlist_referrals AS referral
    WHERE referral.referred_user_id = v_updated.id
      AND lower(trim(app_user.email)) = lower(trim(v_updated.email))
      AND app_user.referral_code_used IS NULL;
  END IF;

  INSERT INTO public.waitlist_events (user_id, event_type, payload)
  VALUES (
    p_waitlist_user_id,
    'admin_status_changed',
    jsonb_build_object(
      'previous_status', v_previous_status,
      'status', p_status,
      'reviewed_by', trim(p_reviewed_by),
      'reviewed_by_email', NULLIF(lower(trim(p_reviewed_by_email)), '')
    )
  );

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_waitlist_status(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_waitlist_status(uuid, text, text, text)
  TO service_role;
