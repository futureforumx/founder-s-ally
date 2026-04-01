-- Profiles: prior-exit consistency, nullable derived counters, profile_field_provenance.
-- Additive / backward-compatible; no column renames or drops.

-- ── Align inconsistent rows before new CHECK (existing data only) ─────────────
UPDATE public.profiles
SET has_prior_exit = true
WHERE COALESCE(prior_exits_count, 0) > 0
  AND has_prior_exit IS DISTINCT FROM true;

-- ── prior_exits_count may be NULL when has_prior_exit is false (unknown) ────
ALTER TABLE public.profiles
  ALTER COLUMN prior_exits_count DROP NOT NULL;

-- ── Derived counters: allow NULL = "not yet computed" vs 0 ──────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_actions_last_30d_check,
  DROP CONSTRAINT IF EXISTS profiles_intros_made_count_check,
  DROP CONSTRAINT IF EXISTS profiles_playbooks_used_count_check;

ALTER TABLE public.profiles
  ALTER COLUMN actions_last_30d DROP NOT NULL,
  ALTER COLUMN intros_made_count DROP NOT NULL,
  ALTER COLUMN playbooks_used_count DROP NOT NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_actions_last_30d_check CHECK (
    actions_last_30d IS NULL OR actions_last_30d >= 0
  ),
  ADD CONSTRAINT profiles_intros_made_count_check CHECK (
    intros_made_count IS NULL OR intros_made_count >= 0
  ),
  ADD CONSTRAINT profiles_playbooks_used_count_check CHECK (
    playbooks_used_count IS NULL OR playbooks_used_count >= 0
  );

-- ── Prior exits vs has_prior_exit ───────────────────────────────────────────
-- If prior_exits_count > 0 then has_prior_exit must be true.
-- If has_prior_exit is false then prior_exits_count is NULL or 0.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_prior_exit_consistency_check CHECK (
    (prior_exits_count IS NULL OR prior_exits_count <= 0 OR has_prior_exit IS TRUE)
    AND (
      has_prior_exit IS DISTINCT FROM false
      OR prior_exits_count IS NULL
      OR prior_exits_count = 0
    )
  );

COMMENT ON CONSTRAINT profiles_prior_exit_consistency_check ON public.profiles IS
  'Enforces: count>0 => has_prior_exit true; has_prior_exit false => count null or 0.';

-- ── Provenance (one row per profile_id + field_name via UNIQUE) ─────────────
CREATE TYPE public.profile_field_source_type AS ENUM (
  'user_entered',
  'imported',
  'inferred',
  'computed',
  'admin_set'
);

CREATE TABLE public.profile_field_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  field_name text NOT NULL,
  source_type public.profile_field_source_type NOT NULL,
  source_detail jsonb,
  confidence numeric(6, 5) CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  ),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_field_provenance_field_name_check CHECK (
    length(trim(field_name)) > 0
    AND length(field_name) <= 128
  ),
  UNIQUE (profile_id, field_name)
);

CREATE INDEX idx_profile_field_provenance_profile_id
  ON public.profile_field_provenance (profile_id);

COMMENT ON TABLE public.profile_field_provenance IS
  'Latest provenance per profile field. Suggested field_name values: capital_raised_lifetime, primary_expertise, domains_of_expertise, fundraising_experience_level, community_tags, working_style, leadership_style, risk_tolerance, gtm_experience, management_experience_level, hiring_experience_level, preferred_help_areas, intro_preferences.';

COMMENT ON COLUMN public.profile_field_provenance.source_detail IS
  'Optional JSON: importer version, model id, rule name, admin note, etc.';

DROP TRIGGER IF EXISTS trg_profile_field_provenance_updated_at ON public.profile_field_provenance;
CREATE TRIGGER trg_profile_field_provenance_updated_at
  BEFORE UPDATE ON public.profile_field_provenance
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profile_field_provenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile provenance"
  ON public.profile_field_provenance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = profile_field_provenance.profile_id
        AND p.user_id = (auth.jwt() ->> 'sub')
    )
  );

CREATE POLICY "Users can insert own profile provenance"
  ON public.profile_field_provenance
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = profile_field_provenance.profile_id
        AND p.user_id = (auth.jwt() ->> 'sub')
    )
  );

CREATE POLICY "Users can update own profile provenance"
  ON public.profile_field_provenance
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = profile_field_provenance.profile_id
        AND p.user_id = (auth.jwt() ->> 'sub')
    )
  );
