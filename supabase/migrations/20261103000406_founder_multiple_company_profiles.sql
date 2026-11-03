ALTER TABLE public.startup_founders
  ADD COLUMN IF NOT EXISTS company_profile_ids text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.operator_profiles
  ADD COLUMN IF NOT EXISTS company_profile_ids text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE public.startup_founders
SET company_profile_ids = ARRAY[startup_id]
WHERE startup_id IS NOT NULL AND cardinality(company_profile_ids) = 0;

UPDATE public.operator_profiles
SET company_profile_ids = ARRAY[startup_id]
WHERE startup_id IS NOT NULL AND cardinality(company_profile_ids) = 0;

COMMENT ON COLUMN public.startup_founders.company_profile_ids IS
  'Company profile IDs linked to this founder; startup_id remains the primary link for compatibility.';
COMMENT ON COLUMN public.operator_profiles.company_profile_ids IS
  'Company profile IDs linked to this operator/founder; startup_id remains the primary link for compatibility.';
