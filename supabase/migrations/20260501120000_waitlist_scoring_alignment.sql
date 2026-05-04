-- Align waitlist scoring with the current /access form payloads.
--
-- The previous stage scoring only matched a small set of single-value strings.
-- The /access form now sends newer founder stages, investor multi-select stages,
-- and operator/advisor focus values, so those need to score intentionally.

CREATE INDEX IF NOT EXISTS idx_waitlist_users_rank_inputs
  ON public.waitlist_users (total_score DESC, referral_count DESC, created_at ASC)
  WHERE status NOT IN ('rejected', 'active');

CREATE OR REPLACE FUNCTION public.calc_waitlist_referral_score(p_referral_count integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  referral_count integer := GREATEST(COALESCE(p_referral_count, 0), 0);
BEGIN
  IF referral_count <= 10 THEN
    RETURN referral_count * 10;
  END IF;

  RETURN 100 + (referral_count - 10) * 5;
END;
$$;

CREATE OR REPLACE FUNCTION public.calc_waitlist_qualification_score(
  p_role text,
  p_urgency text,
  p_stage text,
  p_intent text[]
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  score integer := 0;
  role_value text := lower(trim(COALESCE(p_role, '')));
  urgency_value text := regexp_replace(lower(trim(COALESCE(p_urgency, ''))), '[[:space:]-]+', '_', 'g');
  stage_raw text := lower(trim(COALESCE(p_stage, '')));
  stage_tokens text[] := '{}';
  stage_token text;
  stage_score integer := 0;
  best_stage_score integer := 0;
  intent_value text;
  high_value_intents text[] := ARRAY[
    'find_investors',
    'get_warm_intros',
    'source_deals',
    'find_founders',
    'find_opportunities',
    'raise_capital',
    'find_cofounders',
    'due_diligence'
  ];
BEGIN
  score := score + CASE role_value
    WHEN 'investor' THEN 25
    WHEN 'founder' THEN 20
    WHEN 'advisor' THEN 15
    WHEN 'operator' THEN 10
    WHEN 'other' THEN 5
    ELSE 5
  END;

  score := score + CASE urgency_value
    WHEN 'actively_raising' THEN 30
    WHEN 'actively_deploying' THEN 30
    WHEN 'raising_6_months' THEN 25
    WHEN 'exploring' THEN 10
    WHEN 'not_yet' THEN 5
    ELSE 0
  END;

  IF stage_raw <> '' THEN
    stage_tokens := regexp_split_to_array(stage_raw, '[[:space:]]*,[[:space:]]*');

    FOREACH stage_token IN ARRAY stage_tokens LOOP
      stage_token := lower(trim(stage_token));
      stage_token := replace(stage_token, '+', '-plus');
      stage_token := regexp_replace(stage_token, '[[:space:]]+', '-', 'g');

      stage_score := CASE stage_token
        WHEN 'seed' THEN 20
        WHEN 'multi-stage' THEN 20
        WHEN 'multi_stage' THEN 20
        WHEN 'pre-seed' THEN 15
        WHEN 'pre_seed' THEN 15
        WHEN 'series-a' THEN 15
        WHEN 'series_a' THEN 15
        WHEN 'series-a-plus' THEN 15
        WHEN 'series_a_plus' THEN 15
        WHEN 'angel' THEN 10
        WHEN 'series-b' THEN 10
        WHEN 'series_b' THEN 10
        WHEN 'series-b-plus' THEN 10
        WHEN 'series_b_plus' THEN 10
        WHEN 'series-c-plus' THEN 10
        WHEN 'series_c_plus' THEN 10
        WHEN 'idea' THEN 5
        WHEN 'startup_operator' THEN 5
        WHEN 'startup-operator' THEN 5
        WHEN 'functional_leader' THEN 5
        WHEN 'functional-leader' THEN 5
        WHEN 'advisor_consultant' THEN 5
        WHEN 'advisor-consultant' THEN 5
        WHEN 'fractional_operator' THEN 5
        WHEN 'fractional-operator' THEN 5
        WHEN 'scout_platform' THEN 5
        WHEN 'scout-platform' THEN 5
        WHEN 'other' THEN 5
        ELSE 5
      END;

      best_stage_score := GREATEST(best_stage_score, stage_score);
    END LOOP;

    score := score + best_stage_score;
  END IF;

  IF p_intent IS NOT NULL THEN
    FOREACH intent_value IN ARRAY p_intent LOOP
      intent_value := regexp_replace(lower(trim(COALESCE(intent_value, ''))), '[[:space:]-]+', '_', 'g');

      IF intent_value = ANY(high_value_intents) THEN
        score := score + 8;
      ELSIF intent_value <> '' THEN
        score := score + 3;
      END IF;
    END LOOP;
  END IF;

  RETURN score;
END;
$$;

CREATE OR REPLACE FUNCTION public.waitlist_get_status(
  p_email text DEFAULT NULL,
  p_referral_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_total bigint;
  v_milestones jsonb;
  v_pos integer;
  v_ref integer;
  v_top10_ref integer;
  v_next_pos integer;
  v_next_ref integer;
  v_t25_max integer;
  v_t50_max integer;
  v_current_tier text;
  v_next_tier text;
  v_refs_gap_top10 integer;
  v_spots_top10 integer;
  v_path_context jsonb;
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

  SELECT referral_count INTO v_top10_ref
  FROM public.waitlist_users
  WHERE status NOT IN ('rejected', 'active')
    AND waitlist_position = 10
  LIMIT 1;

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

WITH scored AS (
  SELECT
    id,
    public.calc_waitlist_referral_score(referral_count) AS next_referral_score,
    public.calc_waitlist_qualification_score(role, urgency, stage, intent) AS next_qualification_score,
    priority_access
  FROM public.waitlist_users
)
UPDATE public.waitlist_users AS wu
SET
  referral_score = scored.next_referral_score,
  qualification_score = scored.next_qualification_score,
  total_score = public.calc_waitlist_total_score(
    scored.next_referral_score,
    scored.next_qualification_score,
    scored.priority_access
  )
FROM scored
WHERE wu.id = scored.id;

SELECT public.recalculate_waitlist_positions();

DO $$
BEGIN
  IF public.calc_waitlist_referral_score(NULL) <> 0 THEN
    RAISE EXCEPTION 'waitlist scoring assertion failed: null referrals';
  END IF;

  IF public.calc_waitlist_referral_score(12) <> 110 THEN
    RAISE EXCEPTION 'waitlist scoring assertion failed: referral taper';
  END IF;

  IF public.calc_waitlist_qualification_score(
    'founder',
    NULL,
    'seed',
    ARRAY['find_investors', 'get_warm_intros']::text[]
  ) <> 56 THEN
    RAISE EXCEPTION 'waitlist scoring assertion failed: founder seed high-intent';
  END IF;

  IF public.calc_waitlist_qualification_score(
    'founder',
    NULL,
    'series-b',
    ARRAY[]::text[]
  ) <> 30 THEN
    RAISE EXCEPTION 'waitlist scoring assertion failed: founder series-b';
  END IF;

  IF public.calc_waitlist_qualification_score(
    'investor',
    NULL,
    'angel, seed, multi-stage',
    ARRAY['source_deals']::text[]
  ) <> 53 THEN
    RAISE EXCEPTION 'waitlist scoring assertion failed: investor multi-stage';
  END IF;

  IF public.calc_waitlist_qualification_score(
    'operator',
    NULL,
    'startup_operator',
    ARRAY['find_opportunities', 'track_companies']::text[]
  ) <> 26 THEN
    RAISE EXCEPTION 'waitlist scoring assertion failed: operator focus';
  END IF;

  IF public.calc_waitlist_total_score(100, 50, true) <> 650 THEN
    RAISE EXCEPTION 'waitlist scoring assertion failed: priority total';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.waitlist_get_status(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.calc_waitlist_referral_score(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calc_waitlist_qualification_score(text, text, text, text[]) FROM PUBLIC, anon, authenticated;
