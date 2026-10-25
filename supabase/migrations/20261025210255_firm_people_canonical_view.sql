-- Canonical app-facing name for people linked to investment firms.
-- Keep firm_investors as the storage relation for existing foreign keys and integrations.
CREATE OR REPLACE VIEW public.firm_people
WITH (security_invoker = true)
AS
SELECT *
FROM public.firm_investors;

COMMENT ON VIEW public.firm_people IS
  'Canonical app-facing view of person records linked to investment firms. Backed by firm_investors for compatibility.';

GRANT SELECT ON public.firm_people TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
