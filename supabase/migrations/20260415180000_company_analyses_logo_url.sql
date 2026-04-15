-- Logo URL for company workspace (favicon / Brandfetch / manual); used by onboarding + ensureCompanyWorkspace.
ALTER TABLE public.company_analyses
  ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN public.company_analyses.logo_url IS
  'Company logo image URL (e.g. Google favicon service); optional.';
