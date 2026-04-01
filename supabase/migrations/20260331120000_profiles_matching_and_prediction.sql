-- Profiles: additive columns for founder/employee prediction, matching, and personalization.
-- Backward-compatible: no drops/renames; existing app columns unchanged.

-- ── Role clarity ───────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_role text
    CONSTRAINT profiles_company_role_check CHECK (
      company_role IS NULL
      OR company_role IN (
        'founder',
        'cofounder',
        'employee',
        'contractor',
        'advisor',
        'operator',
        'investor_liaison',
        'board',
        'intern',
        'other'
      )
    ),
  ADD COLUMN IF NOT EXISTS founder_role text,
  ADD COLUMN IF NOT EXISTS current_role_title text;

COMMENT ON COLUMN public.profiles.company_role IS 'Relationship to company: founder, employee, advisor, etc.';
COMMENT ON COLUMN public.profiles.founder_role IS 'If founder: functional role e.g. CEO, CTO (free text).';
COMMENT ON COLUMN public.profiles.current_role_title IS 'Canonical job title for matching; legacy title column unchanged for UI.';

-- ── Experience ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_experience smallint
    CONSTRAINT profiles_years_experience_check CHECK (
      years_experience IS NULL OR (years_experience >= 0 AND years_experience <= 80)
    ),
  ADD COLUMN IF NOT EXISTS primary_expertise text,
  ADD COLUMN IF NOT EXISTS domains_of_expertise text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS prior_startups_count smallint NOT NULL DEFAULT 0
    CONSTRAINT profiles_prior_startups_count_check CHECK (prior_startups_count >= 0),
  ADD COLUMN IF NOT EXISTS prior_exits_count smallint NOT NULL DEFAULT 0
    CONSTRAINT profiles_prior_exits_count_check CHECK (prior_exits_count >= 0),
  ADD COLUMN IF NOT EXISTS has_prior_exit boolean,
  ADD COLUMN IF NOT EXISTS founder_seniority text
    CONSTRAINT profiles_founder_seniority_check CHECK (
      founder_seniority IS NULL
      OR founder_seniority IN (
        'first_time',
        'repeat_founder',
        'serial_founder',
        'operator_founder',
        'unknown'
      )
    );

COMMENT ON COLUMN public.profiles.domains_of_expertise IS 'Taxonomy tags for expertise areas (product, sales, eng, etc.).';

-- ── Fundraising & operating readiness ──────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fundraising_experience_level text
    CONSTRAINT profiles_fundraising_experience_level_check CHECK (
      fundraising_experience_level IS NULL
      OR fundraising_experience_level IN (
        'none',
        'pre_seed',
        'seed',
        'series_a',
        'series_b_plus',
        'growth',
        'public',
        'unknown'
      )
    ),
  ADD COLUMN IF NOT EXISTS capital_raised_lifetime numeric(18, 2)
    CONSTRAINT profiles_capital_raised_lifetime_check CHECK (
      capital_raised_lifetime IS NULL OR capital_raised_lifetime >= 0
    ),
  ADD COLUMN IF NOT EXISTS gtm_experience text
    CONSTRAINT profiles_gtm_experience_check CHECK (
      gtm_experience IS NULL
      OR gtm_experience IN (
        'none',
        'early',
        'scaling',
        'enterprise',
        'plg',
        'sales_led',
        'mixed',
        'unknown'
      )
    ),
  ADD COLUMN IF NOT EXISTS management_experience_level text
    CONSTRAINT profiles_management_experience_level_check CHECK (
      management_experience_level IS NULL
      OR management_experience_level IN (
        'ic',
        'lead',
        'manager',
        'director',
        'vp',
        'cxo',
        'unknown'
      )
    ),
  ADD COLUMN IF NOT EXISTS hiring_experience_level text
    CONSTRAINT profiles_hiring_experience_level_check CHECK (
      hiring_experience_level IS NULL
      OR hiring_experience_level IN (
        'none',
        'light',
        'moderate',
        'heavy',
        'executive_recruiting',
        'unknown'
      )
    );

COMMENT ON COLUMN public.profiles.capital_raised_lifetime IS 'Lifetime capital raised across roles (currency context in product; store as major units e.g. USD).';

-- ── Matching signals ───────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS working_style text
    CONSTRAINT profiles_working_style_check CHECK (
      working_style IS NULL
      OR working_style IN (
        'async_first',
        'sync_heavy',
        'hybrid',
        'deep_work',
        'high_collaboration',
        'unknown'
      )
    ),
  ADD COLUMN IF NOT EXISTS leadership_style text
    CONSTRAINT profiles_leadership_style_check CHECK (
      leadership_style IS NULL
      OR leadership_style IN (
        'visionary',
        'operator',
        'player_coach',
        'delegator',
        'hands_on',
        'unknown'
      )
    ),
  ADD COLUMN IF NOT EXISTS risk_tolerance text
    CONSTRAINT profiles_risk_tolerance_check CHECK (
      risk_tolerance IS NULL
      OR risk_tolerance IN ('low', 'moderate', 'high', 'very_high', 'unknown')
    ),
  ADD COLUMN IF NOT EXISTS preferred_help_areas text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS community_tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS willing_to_advise boolean,
  ADD COLUMN IF NOT EXISTS intro_preferences text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.profiles.intro_preferences IS 'Structured intro norms e.g. warm_only, async_ok, sector_match_required.';

-- ── Company relationship timing ────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_joined_at date,
  ADD COLUMN IF NOT EXISTS company_departed_at date,
  ADD CONSTRAINT profiles_company_dates_check CHECK (
    company_joined_at IS NULL
    OR company_departed_at IS NULL
    OR company_departed_at >= company_joined_at
  );

-- ── Derived engagement (defaults only; populated by jobs / analytics) ──────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz,
  ADD COLUMN IF NOT EXISTS engagement_score numeric(5, 2)
    CONSTRAINT profiles_engagement_score_check CHECK (
      engagement_score IS NULL OR (engagement_score >= 0 AND engagement_score <= 100)
    ),
  ADD COLUMN IF NOT EXISTS actions_last_30d integer NOT NULL DEFAULT 0
    CONSTRAINT profiles_actions_last_30d_check CHECK (actions_last_30d >= 0),
  ADD COLUMN IF NOT EXISTS intros_made_count integer NOT NULL DEFAULT 0
    CONSTRAINT profiles_intros_made_count_check CHECK (intros_made_count >= 0),
  ADD COLUMN IF NOT EXISTS playbooks_used_count integer NOT NULL DEFAULT 0
    CONSTRAINT profiles_playbooks_used_count_check CHECK (playbooks_used_count >= 0);

COMMENT ON COLUMN public.profiles.engagement_score IS 'Derived 0–100; updated by backend/cron, not required for inserts.';

-- ── Structured location (legacy location text retained) ────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS timezone text;

COMMENT ON COLUMN public.profiles.timezone IS 'IANA timezone name e.g. America/New_York.';

-- ── Indexes for matching / filters ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON public.profiles (user_type);

CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles (company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles (country)
  WHERE country IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at ON public.profiles (last_active_at DESC NULLS LAST)
  WHERE last_active_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_founder_seniority ON public.profiles (founder_seniority)
  WHERE founder_seniority IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_fundraising_experience_level ON public.profiles (fundraising_experience_level)
  WHERE fundraising_experience_level IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_domains_of_expertise_gin ON public.profiles USING GIN (domains_of_expertise);

CREATE INDEX IF NOT EXISTS idx_profiles_community_tags_gin ON public.profiles USING GIN (community_tags);

CREATE INDEX IF NOT EXISTS idx_profiles_preferred_help_areas_gin ON public.profiles USING GIN (preferred_help_areas);

CREATE INDEX IF NOT EXISTS idx_profiles_intro_preferences_gin ON public.profiles USING GIN (intro_preferences);
