-- Phase 2: Live path/tier context for waitlist dashboard (extends waitlist_get_status JSON).
--
-- Tier rules (rank = waitlist_position, eligible users only, same set as position recalculation):
--   top10   : rank <= 10
--   top25   : rank > 10 AND rank <= ceil(N * 0.25)   [N = eligible count; min band size handled below]
--   top50   : rank > ceil(N * 0.25) AND rank <= ceil(N * 0.50)
--   general : rank > ceil(N * 0.50)
-- Rounding: ceil() for percentile cutoffs so "top 25%" means the best ceil(N*0.25) ranks (inclusive).
-- If ceil(N*0.25) <= 10, the top25 band is empty (everyone in top10 is also in top quartile by label we use top10).

CREATE OR REPLACE FUNCTION public.waitlist_get_status(
  p_email         text DEFAULT NULL,
  p_referral_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user                record;
  v_total               bigint;
  v_milestones          jsonb;
  v_pos                 integer;
  v_ref                 integer;
  v_top10_ref           integer;
  v_next_pos            integer;
  v_next_ref            integer;
  v_t25_max             integer;
  v_t50_max             integer;
  v_current_tier        text;
  v_next_tier           text;
  v_refs_gap_top10      integer;
  v_spots_top10         integer;
  v_path_context        jsonb;
BEGIN
  IF p_email IS NOT NULL THEN
    SELECT * INTO v_user FROM public.waitlist_users WHERE email = lower(trim(p_email));
  ELSIF p_referral_code IS NOT NULL THEN
    SELECT * INTO v_user FROM public.waitlist_users WHERE referral_code = upper(trim(p_referral_code));
  ELSE
    RETURN jsonb_build_object('error', 'Provide email or referral_code');
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  SELECT count(*) INTO v_total
  FROM public.waitlist_users
  WHERE status NOT IN ('rejected', 'active');

  SELECT jsonb_agg(jsonb_build_object(
    'reward_key', reward_key,
    'reward_label', reward_label,
    'referral_threshold', referral_threshold,
    'description', description,
    'reached', v_user.referral_count >= referral_threshold
  ) ORDER BY referral_threshold ASC)
  INTO v_milestones
  FROM public.waitlist_milestones
  WHERE is_active = true;

  v_pos := v_user.waitlist_position;
  v_ref := v_user.referral_count;

  -- Percentile cutoffs (best ranks = lowest numbers)
  v_t25_max := GREATEST(1, CEIL(v_total::numeric * 0.25)::integer);
  v_t50_max := GREATEST(v_t25_max, CEIL(v_total::numeric * 0.50)::integer);

  IF v_pos IS NULL THEN
    v_current_tier := NULL;
    v_next_tier := NULL;
  ELSIF v_pos <= 10 THEN
    v_current_tier := 'top10';
    v_next_tier := NULL;
  ELSIF v_pos <= v_t25_max THEN
    v_current_tier := 'top25';
    v_next_tier := 'top10';
  ELSIF v_pos <= v_t50_max THEN
    v_current_tier := 'top50';
    v_next_tier := 'top25';
  ELSE
    v_current_tier := 'general';
    v_next_tier := 'top50';
  END IF;

  -- #10 cutoff (live)
  SELECT referral_count INTO v_top10_ref
  FROM public.waitlist_users
  WHERE status NOT IN ('rejected', 'active')
    AND waitlist_position = 10
  LIMIT 1;

  -- Next rung above (rank pos - 1), when pos > 1
  IF v_pos IS NOT NULL AND v_pos > 1 THEN
    SELECT waitlist_position, referral_count INTO v_next_pos, v_next_ref
    FROM public.waitlist_users
    WHERE status NOT IN ('rejected', 'active')
      AND waitlist_position = v_pos - 1
    LIMIT 1;
  END IF;

  IF v_pos IS NOT NULL AND v_pos > 10 THEN
    v_spots_top10 := v_pos - 10;
  ELSE
    v_spots_top10 := NULL;
  END IF;

  -- Referral count gap vs #10 holder (not a guaranteed "how many referrals to rank up" — qualification differs).
  IF v_top10_ref IS NOT NULL AND v_pos IS NOT NULL AND v_pos > 10 THEN
    v_refs_gap_top10 := GREATEST(0, v_top10_ref - v_ref);
  ELSE
    v_refs_gap_top10 := NULL;
  END IF;

  v_path_context := jsonb_build_object(
    'current_position', v_pos,
    'current_referral_count', v_ref,
    'current_tier', v_current_tier,
    'next_tier', v_next_tier,
    'tier_top25_max_rank', v_t25_max,
    'tier_top50_max_rank', v_t50_max,
    'top10_cutoff_position', 10,
    'top10_cutoff_referral_count', v_top10_ref,
    'next_comparison_position', v_next_pos,
    'next_comparison_referral_count', v_next_ref,
    -- Positive gap vs #10's referral_count only; 0 or negative => null (not a reliable "needed" estimate).
    'referrals_needed_for_top10', CASE
      WHEN v_refs_gap_top10 IS NULL THEN NULL
      WHEN v_refs_gap_top10 <= 0 THEN NULL
      ELSE v_refs_gap_top10
    END,
    'spots_to_top10', v_spots_top10,
    'total_waitlist_size', v_total
  );

  RETURN jsonb_build_object(
    'name', v_user.name,
    'email', v_user.email,
    'referral_code', v_user.referral_code,
    'referral_count', v_user.referral_count,
    'referral_score', v_user.referral_score,
    'total_score', v_user.total_score,
    'waitlist_position', v_user.waitlist_position,
    'total_waitlist_size', v_total,
    'status', v_user.status,
    'milestones', COALESCE(v_milestones, '[]'::jsonb),
    'path_context', v_path_context
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.waitlist_get_status(text, text) TO anon, authenticated;
