-- Store every accepted referral code in one admin-managed allowlist. Codes
-- generated for waitlist members are included automatically and stay usable.
CREATE TABLE public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'member')),
  waitlist_user_id uuid REFERENCES public.waitlist_users(id) ON DELETE SET NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_codes_code_normalized CHECK (
    code = upper(trim(code)) AND code ~ '^[A-Z0-9_-]{3,64}$'
  )
);

CREATE UNIQUE INDEX referral_codes_waitlist_user_id_unique
  ON public.referral_codes(waitlist_user_id)
  WHERE waitlist_user_id IS NOT NULL;

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.referral_codes TO service_role;

-- Backfill existing member-generated codes so referral links already in
-- circulation remain valid under the new allowlist.
INSERT INTO public.referral_codes (code, source, waitlist_user_id, created_at)
SELECT upper(trim(referral_code)), 'member', id, created_at
FROM public.waitlist_users
WHERE NULLIF(trim(referral_code), '') IS NOT NULL
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.waitlist_users
  ADD COLUMN IF NOT EXISTS referral_code_used text;

CREATE OR REPLACE FUNCTION public.register_waitlist_member_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.referral_codes (code, source, waitlist_user_id, created_at)
  VALUES (upper(trim(NEW.referral_code)), 'member', NEW.id, COALESCE(NEW.created_at, now()))
  ON CONFLICT (code) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.register_waitlist_member_referral_code()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_register_waitlist_member_referral_code ON public.waitlist_users;
CREATE TRIGGER trg_register_waitlist_member_referral_code
  AFTER INSERT ON public.waitlist_users
  FOR EACH ROW
  EXECUTE FUNCTION public.register_waitlist_member_referral_code();

-- Enforce the allowlist at the database boundary as well as in the signup
-- Edge Function, and preserve accepted codes even when they have no member
-- owner to credit.
CREATE OR REPLACE FUNCTION public.waitlist_signup(
  p_email text,
  p_name text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_stage text DEFAULT NULL,
  p_urgency text DEFAULT NULL,
  p_intent text[] DEFAULT '{}',
  p_biggest_pain text DEFAULT NULL,
  p_company_name text DEFAULT NULL,
  p_linkedin_url text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_campaign text DEFAULT NULL,
  p_referral_code text DEFAULT NULL,
  p_sector text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_sector text;
  v_existing record;
  v_new_user record;
  v_referrer record;
  v_new_code text;
  v_referral_code text := NULLIF(upper(trim(p_referral_code)), '');
  v_ref_score integer;
  v_qual_score integer;
  v_total integer;
  v_insert_attempts integer := 0;
  v_constraint text;
  v_referral_insert_id uuid;
BEGIN
  v_email := lower(trim(p_email));
  IF v_email IS NULL OR v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('error', 'Valid email is required');
  END IF;

  IF v_referral_code IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.referral_codes
    WHERE code = v_referral_code AND is_active = true
  ) THEN
    RETURN jsonb_build_object('error', 'invalid code');
  END IF;

  v_sector := NULLIF(trim(COALESCE(p_sector, '')), '');
  SELECT * INTO v_existing FROM public.waitlist_users WHERE email = v_email;

  IF FOUND THEN
    IF v_referral_code IS NOT NULL THEN
      UPDATE public.waitlist_users
      SET referral_code_used = COALESCE(referral_code_used, v_referral_code)
      WHERE id = v_existing.id AND referral_code_used IS NULL;
    END IF;

    IF v_referral_code IS NOT NULL
       AND v_existing.referred_by_user_id IS NULL
       AND v_existing.referral_code_used IS NULL
    THEN
      SELECT * INTO v_referrer FROM public.waitlist_users
      WHERE referral_code = v_referral_code AND id != v_existing.id LIMIT 1;

      IF FOUND THEN
        UPDATE public.waitlist_users SET referred_by_user_id = v_referrer.id
        WHERE id = v_existing.id AND referred_by_user_id IS NULL;
        INSERT INTO public.waitlist_referrals (referrer_user_id, referred_user_id, referral_code)
        VALUES (v_referrer.id, v_existing.id, v_referrer.referral_code)
        ON CONFLICT (referred_user_id) DO NOTHING
        RETURNING id INTO v_referral_insert_id;

        IF v_referral_insert_id IS NOT NULL THEN
          UPDATE public.waitlist_users SET referral_count = referral_count + 1
          WHERE id = v_referrer.id;
          PERFORM public.recalculate_waitlist_user_scores(v_referrer.id);
          INSERT INTO public.waitlist_events (user_id, event_type, payload)
          VALUES (v_referrer.id, 'referral_credited', jsonb_build_object('referred_user_id', v_existing.id));
        END IF;
      END IF;
    END IF;

    PERFORM public.recalculate_waitlist_positions();
    SELECT * INTO v_existing FROM public.waitlist_users WHERE email = v_email;
    RETURN jsonb_build_object(
      'status', 'existing', 'id', v_existing.id, 'email', v_existing.email,
      'referral_code', v_existing.referral_code, 'referral_count', v_existing.referral_count,
      'total_score', v_existing.total_score, 'waitlist_position', v_existing.waitlist_position
    );
  END IF;

  v_qual_score := public.calc_waitlist_qualification_score(p_role, p_urgency, p_stage, p_intent);
  v_ref_score := 0;
  v_total := public.calc_waitlist_total_score(v_ref_score, v_qual_score, false);

  <<assign_code_and_insert>>
  LOOP
    v_insert_attempts := v_insert_attempts + 1;
    IF v_insert_attempts > 100 THEN
      RAISE EXCEPTION 'waitlist_signup: could not allocate unique referral_code';
    END IF;

    v_new_code := public.generate_waitlist_referral_code();
    BEGIN
      INSERT INTO public.waitlist_users (
        email, name, role, stage, sector, urgency, intent, biggest_pain,
        company_name, linkedin_url, source, campaign, referral_code,
        referral_code_used, referral_score, qualification_score, total_score, metadata
      ) VALUES (
        v_email, trim(p_name), p_role, p_stage, v_sector, p_urgency,
        COALESCE(p_intent, '{}'::text[]), p_biggest_pain, trim(p_company_name),
        trim(p_linkedin_url), p_source, p_campaign, v_new_code, v_referral_code,
        v_ref_score, v_qual_score, v_total, COALESCE(p_metadata, '{}'::jsonb)
      ) RETURNING * INTO v_new_user;
      EXIT assign_code_and_insert;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint IS DISTINCT FROM 'waitlist_users_referral_code_unique' THEN RAISE; END IF;
    END;
  END LOOP;

  IF v_referral_code IS NOT NULL THEN
    SELECT * INTO v_referrer FROM public.waitlist_users
    WHERE referral_code = v_referral_code AND id != v_new_user.id LIMIT 1;
    IF FOUND THEN
      UPDATE public.waitlist_users SET referred_by_user_id = v_referrer.id
      WHERE id = v_new_user.id AND referred_by_user_id IS NULL;
      INSERT INTO public.waitlist_referrals (referrer_user_id, referred_user_id, referral_code)
      VALUES (v_referrer.id, v_new_user.id, v_referrer.referral_code)
      ON CONFLICT (referred_user_id) DO NOTHING
      RETURNING id INTO v_referral_insert_id;
      IF v_referral_insert_id IS NOT NULL THEN
        UPDATE public.waitlist_users SET referral_count = referral_count + 1 WHERE id = v_referrer.id;
        PERFORM public.recalculate_waitlist_user_scores(v_referrer.id);
        INSERT INTO public.waitlist_events (user_id, event_type, payload)
        VALUES (v_referrer.id, 'referral_credited', jsonb_build_object('referred_user_id', v_new_user.id));
      END IF;
    END IF;
  END IF;

  INSERT INTO public.waitlist_events (user_id, event_type, payload)
  VALUES (v_new_user.id, 'signup', jsonb_build_object(
    'source', p_source, 'campaign', p_campaign, 'referral_code', v_referral_code
  ));

  PERFORM public.recalculate_waitlist_positions();
  SELECT * INTO v_new_user FROM public.waitlist_users WHERE id = v_new_user.id;
  RETURN jsonb_build_object(
    'status', 'created', 'id', v_new_user.id, 'email', v_new_user.email,
    'referral_code', v_new_user.referral_code, 'referral_count', v_new_user.referral_count,
    'total_score', v_new_user.total_score, 'waitlist_position', v_new_user.waitlist_position
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.waitlist_signup(
  text, text, text, text, text, text[], text, text, text, text, text, text, text, jsonb
) TO anon, authenticated, service_role;

-- Use the actual signup code, including admin-issued codes without a member
-- referrer, when copying the attribution to platform users after approval.
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
  IF NEW.referral_code_used IS NOT NULL OR NULLIF(trim(NEW.email), '') IS NULL THEN RETURN NEW; END IF;
  IF v_jwt->>'role' = 'authenticated' AND (
    v_jwt->>'sub' IS DISTINCT FROM NEW.id OR
    lower(v_jwt->>'email') IS DISTINCT FROM lower(trim(NEW.email))
  ) THEN RETURN NEW; END IF;

  SELECT COALESCE(applicant.referral_code_used, referral.referral_code)
  INTO v_referral_code
  FROM public.waitlist_users AS applicant
  LEFT JOIN public.waitlist_referrals AS referral ON referral.referred_user_id = applicant.id
  WHERE lower(trim(applicant.email)) = lower(trim(NEW.email))
    AND applicant.status = 'approved'
  LIMIT 1;
  IF v_referral_code IS NOT NULL THEN NEW.referral_code_used := v_referral_code; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_approved_waitlist_referral_to_user()
  FROM PUBLIC, anon, authenticated;

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
  IF NULLIF(trim(p_reviewed_by), '') IS NULL THEN RAISE EXCEPTION 'A reviewer identity is required'; END IF;
  SELECT status INTO v_previous_status FROM public.waitlist_users
    WHERE id = p_waitlist_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Waitlist applicant not found'; END IF;

  UPDATE public.waitlist_users SET
    status = p_status,
    reviewed_at = now(),
    reviewed_by = trim(p_reviewed_by),
    reviewed_by_email = NULLIF(lower(trim(p_reviewed_by_email)), '')
  WHERE id = p_waitlist_user_id RETURNING * INTO v_updated;

  IF p_status = 'approved' THEN
    UPDATE public.users AS app_user
    SET referral_code_used = COALESCE(applicant.referral_code_used, referral.referral_code)
    FROM public.waitlist_users AS applicant
    LEFT JOIN public.waitlist_referrals AS referral ON referral.referred_user_id = applicant.id
    WHERE applicant.id = v_updated.id
      AND lower(trim(app_user.email)) = lower(trim(v_updated.email))
      AND app_user.referral_code_used IS NULL
      AND COALESCE(applicant.referral_code_used, referral.referral_code) IS NOT NULL;
  END IF;

  INSERT INTO public.waitlist_events (user_id, event_type, payload)
  VALUES (p_waitlist_user_id, 'admin_status_changed', jsonb_build_object(
    'previous_status', v_previous_status, 'status', p_status,
    'reviewed_by', trim(p_reviewed_by),
    'reviewed_by_email', NULLIF(lower(trim(p_reviewed_by_email)), '')
  ));
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_waitlist_status(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_waitlist_status(uuid, text, text, text)
  TO service_role;
