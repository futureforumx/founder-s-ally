-- Align waitlist_signup RPC with waitlist_get_status: rename p_referral_code_used → p_referral_code
-- (Incoming ref from URL; table column waitlist_users.referral_code remains the user's own code.)

DROP FUNCTION IF EXISTS public.waitlist_signup(
  text, text, text, text, text, text[], text, text, text, text, text, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.waitlist_signup(
  p_email           text,
  p_name              text DEFAULT NULL,
  p_role              text DEFAULT NULL,
  p_stage             text DEFAULT NULL,
  p_urgency           text DEFAULT NULL,
  p_intent            text[] DEFAULT '{}',
  p_biggest_pain      text DEFAULT NULL,
  p_company_name      text DEFAULT NULL,
  p_linkedin_url      text DEFAULT NULL,
  p_source            text DEFAULT NULL,
  p_campaign          text DEFAULT NULL,
  p_referral_code     text DEFAULT NULL,
  p_sector            text DEFAULT NULL,
  p_metadata          jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email           text;
  v_sector          text;
  v_existing        record;
  v_new_user        record;
  v_referrer        record;
  v_new_code        text;
  v_ref_score       integer;
  v_qual_score      integer;
  v_total           integer;
BEGIN
  v_email := lower(trim(p_email));

  IF v_email IS NULL OR v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('error', 'Valid email is required');
  END IF;

  v_sector := nullif(trim(COALESCE(p_sector, '')), '');

  SELECT * INTO v_existing FROM public.waitlist_users WHERE email = v_email;

  IF FOUND THEN
    IF p_referral_code IS NOT NULL
       AND v_existing.referred_by_user_id IS NULL
    THEN
      SELECT * INTO v_referrer
      FROM public.waitlist_users
      WHERE referral_code = upper(trim(p_referral_code))
        AND id != v_existing.id;

      IF FOUND THEN
        UPDATE public.waitlist_users
        SET referred_by_user_id = v_referrer.id
        WHERE id = v_existing.id;

        INSERT INTO public.waitlist_referrals (referrer_user_id, referred_user_id, referral_code)
        VALUES (v_referrer.id, v_existing.id, v_referrer.referral_code)
        ON CONFLICT (referred_user_id) DO NOTHING;

        UPDATE public.waitlist_users
        SET referral_count = referral_count + 1
        WHERE id = v_referrer.id;

        PERFORM public.recalculate_waitlist_user_scores(v_referrer.id);

        INSERT INTO public.waitlist_events (user_id, event_type, payload)
        VALUES (v_referrer.id, 'referral_credited', jsonb_build_object(
          'referred_user_id', v_existing.id,
          'referred_email', v_email
        ));
      END IF;
    END IF;

    PERFORM public.recalculate_waitlist_positions();

    SELECT * INTO v_existing FROM public.waitlist_users WHERE email = v_email;

    RETURN jsonb_build_object(
      'status', 'existing',
      'id', v_existing.id,
      'email', v_existing.email,
      'referral_code', v_existing.referral_code,
      'referral_count', v_existing.referral_count,
      'total_score', v_existing.total_score,
      'waitlist_position', v_existing.waitlist_position
    );
  END IF;

  v_new_code := public.generate_waitlist_referral_code();

  v_qual_score := public.calc_waitlist_qualification_score(p_role, p_urgency, p_stage, p_intent);
  v_ref_score  := 0;
  v_total      := public.calc_waitlist_total_score(v_ref_score, v_qual_score, false);

  INSERT INTO public.waitlist_users (
    email, name, role, stage, sector, urgency, intent, biggest_pain,
    company_name, linkedin_url, source, campaign,
    referral_code, referral_score, qualification_score, total_score,
    metadata
  ) VALUES (
    v_email, trim(p_name), p_role, p_stage, v_sector, p_urgency, COALESCE(p_intent, '{}'), p_biggest_pain,
    trim(p_company_name), trim(p_linkedin_url), p_source, p_campaign,
    v_new_code, v_ref_score, v_qual_score, v_total,
    COALESCE(p_metadata, '{}')
  )
  RETURNING * INTO v_new_user;

  IF p_referral_code IS NOT NULL THEN
    SELECT * INTO v_referrer
    FROM public.waitlist_users
    WHERE referral_code = upper(trim(p_referral_code))
      AND id != v_new_user.id;

    IF FOUND THEN
      UPDATE public.waitlist_users
      SET referred_by_user_id = v_referrer.id
      WHERE id = v_new_user.id;

      INSERT INTO public.waitlist_referrals (referrer_user_id, referred_user_id, referral_code)
      VALUES (v_referrer.id, v_new_user.id, v_referrer.referral_code);

      UPDATE public.waitlist_users
      SET referral_count = referral_count + 1
      WHERE id = v_referrer.id;

      PERFORM public.recalculate_waitlist_user_scores(v_referrer.id);

      INSERT INTO public.waitlist_events (user_id, event_type, payload)
      VALUES (v_referrer.id, 'referral_credited', jsonb_build_object(
        'referred_user_id', v_new_user.id,
        'referred_email', v_email
      ));
    END IF;
  END IF;

  INSERT INTO public.waitlist_events (user_id, event_type, payload)
  VALUES (v_new_user.id, 'signup', jsonb_build_object(
    'source', p_source,
    'campaign', p_campaign,
    'referral_code', p_referral_code
  ));

  PERFORM public.recalculate_waitlist_positions();

  SELECT * INTO v_new_user FROM public.waitlist_users WHERE id = v_new_user.id;

  RETURN jsonb_build_object(
    'status', 'created',
    'id', v_new_user.id,
    'email', v_new_user.email,
    'referral_code', v_new_user.referral_code,
    'referral_count', v_new_user.referral_count,
    'total_score', v_new_user.total_score,
    'waitlist_position', v_new_user.waitlist_position
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.waitlist_signup(
  text, text, text, text, text, text[], text, text, text, text, text, text, text, jsonb
) TO anon, authenticated;
