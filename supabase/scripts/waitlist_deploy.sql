-- =============================================================================
-- VEKTA WAITLIST SYSTEM — Paste into Supabase SQL Editor and run.
-- Self-contained. No external migration dependencies. Safe to re-run.
-- =============================================================================

-- 0. ENSURE PREREQUISITE FUNCTIONS EXIST (idempotent)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'is_admin_or_above'
      AND pg_get_function_identity_arguments(p.oid) = '_user_id text'
  ) THEN
    CREATE FUNCTION public.is_admin_or_above(_user_id text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $fn$
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND permission IN ('admin', 'god')
      );
    $fn$;
  END IF;
END $$;

-- 1. TABLES

CREATE TABLE IF NOT EXISTS public.waitlist_users (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  email                text        NOT NULL,
  name                 text,
  role                 text,
  stage                text,
  urgency              text,
  intent               text[]      NOT NULL DEFAULT '{}',
  biggest_pain         text,
  company_name         text,
  linkedin_url         text,
  source               text,
  campaign             text,
  referral_code        text        NOT NULL,
  referred_by_user_id  uuid        REFERENCES public.waitlist_users(id) ON DELETE SET NULL,
  referral_count       integer     NOT NULL DEFAULT 0,
  referral_score       integer     NOT NULL DEFAULT 0,
  qualification_score  integer     NOT NULL DEFAULT 0,
  total_score          integer     NOT NULL DEFAULT 0,
  waitlist_position    integer,
  status               text        NOT NULL DEFAULT 'pending',
  priority_access      boolean     NOT NULL DEFAULT false,
  metadata             jsonb       NOT NULL DEFAULT '{}',
  CONSTRAINT waitlist_users_email_unique UNIQUE (email),
  CONSTRAINT waitlist_users_referral_code_unique UNIQUE (referral_code),
  CONSTRAINT waitlist_users_status_check CHECK (status IN ('pending','approved','invited','active','rejected'))
);

CREATE TABLE IF NOT EXISTS public.waitlist_referrals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  referrer_user_id  uuid        NOT NULL REFERENCES public.waitlist_users(id) ON DELETE CASCADE,
  referred_user_id  uuid        NOT NULL REFERENCES public.waitlist_users(id) ON DELETE CASCADE,
  referral_code     text        NOT NULL,
  CONSTRAINT waitlist_referrals_referred_unique UNIQUE (referred_user_id)
);

CREATE TABLE IF NOT EXISTS public.waitlist_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid        REFERENCES public.waitlist_users(id) ON DELETE SET NULL,
  event_type  text        NOT NULL,
  payload     jsonb       NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.waitlist_milestones (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  referral_threshold integer     NOT NULL,
  reward_key         text        NOT NULL UNIQUE,
  reward_label       text        NOT NULL,
  description        text,
  is_active          boolean     NOT NULL DEFAULT true
);

-- 2. INDEXES

CREATE INDEX IF NOT EXISTS idx_waitlist_users_total_score  ON public.waitlist_users (total_score DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_users_position     ON public.waitlist_users (waitlist_position ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_waitlist_users_created_at   ON public.waitlist_users (created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_users_status       ON public.waitlist_users (status);
CREATE INDEX IF NOT EXISTS idx_waitlist_users_role         ON public.waitlist_users (role);
CREATE INDEX IF NOT EXISTS idx_waitlist_users_urgency      ON public.waitlist_users (urgency);
CREATE INDEX IF NOT EXISTS idx_waitlist_users_referred_by  ON public.waitlist_users (referred_by_user_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_referrals_referrer ON public.waitlist_referrals (referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_events_user_id     ON public.waitlist_events (user_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_events_type        ON public.waitlist_events (event_type);

-- 3. UPDATED_AT TRIGGER

DROP TRIGGER IF EXISTS trg_waitlist_users_updated_at ON public.waitlist_users;
CREATE TRIGGER trg_waitlist_users_updated_at
  BEFORE UPDATE ON public.waitlist_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. REFERRAL CODE GENERATION

CREATE OR REPLACE FUNCTION public.generate_waitlist_referral_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  chars    text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code     text;
  i        integer;
  attempts integer := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.waitlist_users WHERE referral_code = code);
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'Failed to generate unique referral code after 20 attempts';
    END IF;
  END LOOP;
  RETURN code;
END;
$$;

-- 5. SCORING FUNCTIONS

CREATE OR REPLACE FUNCTION public.calc_waitlist_referral_score(p_referral_count integer)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_referral_count <= 0 THEN RETURN 0; END IF;
  IF p_referral_count <= 10 THEN RETURN p_referral_count * 10; END IF;
  RETURN 100 + (p_referral_count - 10) * 5;
END;
$$;

CREATE OR REPLACE FUNCTION public.calc_waitlist_qualification_score(
  p_role text, p_urgency text, p_stage text, p_intent text[]
)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  score integer := 0;
  high_value_intents text[] := ARRAY[
    'find_investors','get_warm_intros','source_deals',
    'raise_capital','find_cofounders','due_diligence'
  ];
  i text;
BEGIN
  score := score + CASE p_role
    WHEN 'founder' THEN 20 WHEN 'investor' THEN 25
    WHEN 'operator' THEN 10 WHEN 'advisor' THEN 15 ELSE 5 END;
  score := score + CASE p_urgency
    WHEN 'actively_raising' THEN 30 WHEN 'raising_6_months' THEN 25
    WHEN 'actively_deploying' THEN 30 WHEN 'exploring' THEN 10
    WHEN 'not_yet' THEN 5 ELSE 0 END;
  score := score + CASE p_stage
    WHEN 'pre-seed' THEN 15 WHEN 'seed' THEN 20
    WHEN 'series-a' THEN 15 WHEN 'series-b+' THEN 10 ELSE 5 END;
  IF p_intent IS NOT NULL THEN
    FOREACH i IN ARRAY p_intent LOOP
      IF i = ANY(high_value_intents) THEN score := score + 8;
      ELSE score := score + 3; END IF;
    END LOOP;
  END IF;
  RETURN score;
END;
$$;

CREATE OR REPLACE FUNCTION public.calc_waitlist_total_score(
  p_referral_score integer, p_qualification_score integer, p_priority_access boolean
)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN p_referral_score + p_qualification_score
       + CASE WHEN p_priority_access THEN 500 ELSE 0 END;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_waitlist_user_scores(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.waitlist_users WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.waitlist_users SET
    referral_score      = public.calc_waitlist_referral_score(r.referral_count),
    qualification_score = public.calc_waitlist_qualification_score(r.role, r.urgency, r.stage, r.intent),
    total_score         = public.calc_waitlist_total_score(
                            public.calc_waitlist_referral_score(r.referral_count),
                            public.calc_waitlist_qualification_score(r.role, r.urgency, r.stage, r.intent),
                            r.priority_access)
  WHERE id = p_user_id;
END;
$$;

-- 6. POSITION CALCULATION

CREATE OR REPLACE FUNCTION public.recalculate_waitlist_positions()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
      ORDER BY total_score DESC, referral_count DESC, created_at ASC
    ) AS pos
    FROM public.waitlist_users
    WHERE status NOT IN ('rejected','active')
  )
  UPDATE public.waitlist_users u SET waitlist_position = r.pos
  FROM ranked r WHERE u.id = r.id;

  UPDATE public.waitlist_users SET waitlist_position = NULL
  WHERE status IN ('rejected','active');
END;
$$;

-- 7. SIGNUP RPC

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
  p_referral_code_used text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email    text;
  v_existing record;
  v_new_user record;
  v_referrer record;
  v_new_code text;
  v_ref_score integer;
  v_qual_score integer;
  v_total    integer;
BEGIN
  v_email := lower(trim(p_email));
  IF v_email IS NULL OR v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('error', 'Valid email is required');
  END IF;

  SELECT * INTO v_existing FROM public.waitlist_users WHERE email = v_email;

  IF FOUND THEN
    IF p_referral_code_used IS NOT NULL AND v_existing.referred_by_user_id IS NULL THEN
      SELECT * INTO v_referrer FROM public.waitlist_users
      WHERE referral_code = upper(trim(p_referral_code_used)) AND id != v_existing.id;
      IF FOUND THEN
        UPDATE public.waitlist_users SET referred_by_user_id = v_referrer.id WHERE id = v_existing.id;
        INSERT INTO public.waitlist_referrals (referrer_user_id, referred_user_id, referral_code)
        VALUES (v_referrer.id, v_existing.id, v_referrer.referral_code) ON CONFLICT (referred_user_id) DO NOTHING;
        UPDATE public.waitlist_users SET referral_count = referral_count + 1 WHERE id = v_referrer.id;
        PERFORM public.recalculate_waitlist_user_scores(v_referrer.id);
        INSERT INTO public.waitlist_events (user_id, event_type, payload)
        VALUES (v_referrer.id, 'referral_credited', jsonb_build_object('referred_user_id', v_existing.id, 'referred_email', v_email));
      END IF;
    END IF;

    PERFORM public.recalculate_waitlist_positions();
    SELECT * INTO v_existing FROM public.waitlist_users WHERE email = v_email;

    RETURN jsonb_build_object(
      'status','existing', 'id',v_existing.id, 'email',v_existing.email,
      'referral_code',v_existing.referral_code, 'referral_count',v_existing.referral_count,
      'total_score',v_existing.total_score, 'waitlist_position',v_existing.waitlist_position);
  END IF;

  v_new_code   := public.generate_waitlist_referral_code();
  v_qual_score := public.calc_waitlist_qualification_score(p_role, p_urgency, p_stage, p_intent);
  v_ref_score  := 0;
  v_total      := public.calc_waitlist_total_score(v_ref_score, v_qual_score, false);

  INSERT INTO public.waitlist_users (
    email, name, role, stage, urgency, intent, biggest_pain,
    company_name, linkedin_url, source, campaign,
    referral_code, referral_score, qualification_score, total_score, metadata
  ) VALUES (
    v_email, trim(p_name), p_role, p_stage, p_urgency, COALESCE(p_intent,'{}'), p_biggest_pain,
    trim(p_company_name), trim(p_linkedin_url), p_source, p_campaign,
    v_new_code, v_ref_score, v_qual_score, v_total, COALESCE(p_metadata,'{}')
  ) RETURNING * INTO v_new_user;

  IF p_referral_code_used IS NOT NULL THEN
    SELECT * INTO v_referrer FROM public.waitlist_users
    WHERE referral_code = upper(trim(p_referral_code_used)) AND id != v_new_user.id;
    IF FOUND THEN
      UPDATE public.waitlist_users SET referred_by_user_id = v_referrer.id WHERE id = v_new_user.id;
      INSERT INTO public.waitlist_referrals (referrer_user_id, referred_user_id, referral_code)
      VALUES (v_referrer.id, v_new_user.id, v_referrer.referral_code);
      UPDATE public.waitlist_users SET referral_count = referral_count + 1 WHERE id = v_referrer.id;
      PERFORM public.recalculate_waitlist_user_scores(v_referrer.id);
      INSERT INTO public.waitlist_events (user_id, event_type, payload)
      VALUES (v_referrer.id, 'referral_credited', jsonb_build_object('referred_user_id', v_new_user.id, 'referred_email', v_email));
    END IF;
  END IF;

  INSERT INTO public.waitlist_events (user_id, event_type, payload)
  VALUES (v_new_user.id, 'signup', jsonb_build_object('source',p_source,'campaign',p_campaign,'referral_code_used',p_referral_code_used));

  PERFORM public.recalculate_waitlist_positions();
  SELECT * INTO v_new_user FROM public.waitlist_users WHERE id = v_new_user.id;

  RETURN jsonb_build_object(
    'status','created', 'id',v_new_user.id, 'email',v_new_user.email,
    'referral_code',v_new_user.referral_code, 'referral_count',v_new_user.referral_count,
    'total_score',v_new_user.total_score, 'waitlist_position',v_new_user.waitlist_position);
END;
$$;

-- 8. STATUS RPC

CREATE OR REPLACE FUNCTION public.waitlist_get_status(
  p_email text DEFAULT NULL, p_referral_code text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user record; v_total bigint; v_milestones jsonb;
BEGIN
  IF p_email IS NOT NULL THEN
    SELECT * INTO v_user FROM public.waitlist_users WHERE email = lower(trim(p_email));
  ELSIF p_referral_code IS NOT NULL THEN
    SELECT * INTO v_user FROM public.waitlist_users WHERE referral_code = upper(trim(p_referral_code));
  ELSE
    RETURN jsonb_build_object('error','Provide email or referral_code');
  END IF;

  IF NOT FOUND THEN RETURN jsonb_build_object('error','User not found'); END IF;

  SELECT count(*) INTO v_total FROM public.waitlist_users WHERE status NOT IN ('rejected','active');

  SELECT jsonb_agg(jsonb_build_object(
    'reward_key',reward_key,'reward_label',reward_label,
    'referral_threshold',referral_threshold,'description',description,
    'reached',v_user.referral_count >= referral_threshold
  ) ORDER BY referral_threshold ASC) INTO v_milestones
  FROM public.waitlist_milestones WHERE is_active = true;

  RETURN jsonb_build_object(
    'name',v_user.name, 'email',v_user.email,
    'referral_code',v_user.referral_code, 'referral_count',v_user.referral_count,
    'total_score',v_user.total_score, 'waitlist_position',v_user.waitlist_position,
    'total_waitlist_size',v_total, 'status',v_user.status,
    'milestones',COALESCE(v_milestones,'[]'::jsonb));
END;
$$;

-- 9. SEED MILESTONES

INSERT INTO public.waitlist_milestones (referral_threshold, reward_key, reward_label, description)
VALUES
  (3,  'early_access',        'Early Access',        'Get early access to the platform before public launch'),
  (10, 'priority_onboarding', 'Priority Onboarding', 'Skip the queue with a dedicated onboarding session'),
  (25, 'premium_perks',       'Premium Perks',       'Unlock premium features free for 3 months')
ON CONFLICT (reward_key) DO NOTHING;

-- 10. RLS + POLICIES

ALTER TABLE public.waitlist_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read waitlist_users" ON public.waitlist_users;
CREATE POLICY "Admin read waitlist_users" ON public.waitlist_users
  FOR SELECT TO authenticated USING (public.is_admin_or_above((auth.jwt()->>'sub')));

DROP POLICY IF EXISTS "Admin update waitlist_users" ON public.waitlist_users;
CREATE POLICY "Admin update waitlist_users" ON public.waitlist_users
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_above((auth.jwt()->>'sub')))
  WITH CHECK (public.is_admin_or_above((auth.jwt()->>'sub')));

DROP POLICY IF EXISTS "Admin read waitlist_referrals" ON public.waitlist_referrals;
CREATE POLICY "Admin read waitlist_referrals" ON public.waitlist_referrals
  FOR SELECT TO authenticated USING (public.is_admin_or_above((auth.jwt()->>'sub')));

DROP POLICY IF EXISTS "Admin read waitlist_events" ON public.waitlist_events;
CREATE POLICY "Admin read waitlist_events" ON public.waitlist_events
  FOR SELECT TO authenticated USING (public.is_admin_or_above((auth.jwt()->>'sub')));

DROP POLICY IF EXISTS "Public read waitlist_milestones" ON public.waitlist_milestones;
CREATE POLICY "Public read waitlist_milestones" ON public.waitlist_milestones
  FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "Admin manage waitlist_milestones" ON public.waitlist_milestones;
CREATE POLICY "Admin manage waitlist_milestones" ON public.waitlist_milestones
  FOR ALL TO authenticated
  USING (public.is_admin_or_above((auth.jwt()->>'sub')))
  WITH CHECK (public.is_admin_or_above((auth.jwt()->>'sub')));

-- 11. ADMIN VIEW

CREATE OR REPLACE VIEW public.v_waitlist_admin AS
SELECT wu.id, wu.created_at, wu.email, wu.name, wu.role, wu.stage, wu.urgency,
  wu.company_name, wu.source, wu.campaign, wu.status, wu.priority_access,
  wu.referral_code, wu.referral_count, wu.referral_score, wu.qualification_score,
  wu.total_score, wu.waitlist_position, wu.intent, wu.biggest_pain, wu.linkedin_url,
  wu.metadata, ref.email AS referred_by_email,
  (SELECT count(*) FROM public.waitlist_referrals wr WHERE wr.referrer_user_id = wu.id) AS actual_referral_count
FROM public.waitlist_users wu
LEFT JOIN public.waitlist_users ref ON wu.referred_by_user_id = ref.id
ORDER BY wu.waitlist_position ASC NULLS LAST, wu.created_at ASC;

-- 12. GRANTS

GRANT EXECUTE ON FUNCTION public.waitlist_signup TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_get_status TO anon, authenticated;

REVOKE ALL ON FUNCTION public.generate_waitlist_referral_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calc_waitlist_referral_score(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calc_waitlist_qualification_score(text, text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calc_waitlist_total_score(integer, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_waitlist_user_scores(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_waitlist_positions() FROM PUBLIC, anon, authenticated;
