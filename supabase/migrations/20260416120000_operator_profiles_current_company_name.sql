-- Current employer display name for Network operator cards / enrichment (roles graph).
ALTER TABLE public.operator_profiles
  ADD COLUMN IF NOT EXISTS current_company_name text;

COMMENT ON COLUMN public.operator_profiles.current_company_name IS
  'Current organization display name (typically from roles → organizations when people_id is set).';
