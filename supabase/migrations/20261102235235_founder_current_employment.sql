-- Keep optional current-employment details directly on founder/operator profiles.
-- Employer names are labels only and intentionally have no company-record FK.
ALTER TABLE public.startup_founders
  ADD COLUMN IF NOT EXISTS is_currently_at_startup boolean,
  ADD COLUMN IF NOT EXISTS current_employer_name text,
  ADD COLUMN IF NOT EXISTS current_employer_type text,
  ADD COLUMN IF NOT EXISTS current_employer_title text;

ALTER TABLE public.operator_profiles
  ADD COLUMN IF NOT EXISTS is_currently_at_startup boolean,
  ADD COLUMN IF NOT EXISTS current_employer_name text,
  ADD COLUMN IF NOT EXISTS current_employer_type text,
  ADD COLUMN IF NOT EXISTS current_employer_title text;

COMMENT ON COLUMN public.startup_founders.current_employer_name IS
  'Current employer label for founders not currently employed at their associated startup; does not create a company record.';
COMMENT ON COLUMN public.operator_profiles.current_employer_name IS
  'Current employer label for founder/operator profiles; does not create a company record.';
