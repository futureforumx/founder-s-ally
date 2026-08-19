-- NinjaPear enrichment persistence and billing guardrails.
-- Raw vendor payloads stay server-side. The browser-facing records only expose
-- fields already permitted by their existing RLS policies.

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS ninjapear_profile jsonb,
  ADD COLUMN IF NOT EXISTS ninjapear_profile_id text,
  ADD COLUMN IF NOT EXISTS ninjapear_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS ninjapear_work_email text,
  ADD COLUMN IF NOT EXISTS ninjapear_work_email_checked_at timestamptz;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ninjapear_company_profile jsonb,
  ADD COLUMN IF NOT EXISTS ninjapear_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS ninjapear_headcount integer,
  ADD COLUMN IF NOT EXISTS ninjapear_headcount_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ninjapear_headcount_growth jsonb;

ALTER TABLE public.firm_investors
  ADD COLUMN IF NOT EXISTS ninjapear_profile jsonb,
  ADD COLUMN IF NOT EXISTS ninjapear_profile_id text,
  ADD COLUMN IF NOT EXISTS ninjapear_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS ninjapear_work_email text,
  ADD COLUMN IF NOT EXISTS ninjapear_work_email_checked_at timestamptz;

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS ninjapear_company_profile jsonb,
  ADD COLUMN IF NOT EXISTS ninjapear_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS ninjapear_headcount integer,
  ADD COLUMN IF NOT EXISTS ninjapear_headcount_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ninjapear_headcount_growth jsonb;

CREATE TABLE IF NOT EXISTS public.ninjapear_enrichment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  operation text NOT NULL CHECK (operation IN (
    'enrich_person', 'enrich_company', 'find_person_url',
    'find_role_url', 'find_work_email'
  )),
  status text NOT NULL CHECK (status IN ('ok', 'not_found')),
  person_id uuid REFERENCES public.people(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  firm_investor_id uuid REFERENCES public.firm_investors(id) ON DELETE CASCADE,
  firm_id uuid REFERENCES public.firm_records(id) ON DELETE CASCADE,
  payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  fresh_until timestamptz NOT NULL DEFAULT (now() + interval '1 day'),
  credit_cost numeric,
  vendor_cache_age_days integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ninjapear_cache_fresh
  ON public.ninjapear_enrichment_cache (cache_key, fresh_until DESC);
CREATE INDEX IF NOT EXISTS idx_ninjapear_cache_person
  ON public.ninjapear_enrichment_cache (person_id, fetched_at DESC)
  WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ninjapear_cache_organization
  ON public.ninjapear_enrichment_cache (organization_id, fetched_at DESC)
  WHERE organization_id IS NOT NULL;

DROP TRIGGER IF EXISTS ninjapear_cache_touch_updated_at
  ON public.ninjapear_enrichment_cache;
CREATE TRIGGER ninjapear_cache_touch_updated_at
  BEFORE UPDATE ON public.ninjapear_enrichment_cache
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.ninjapear_enrichment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL,
  operation text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('ok', 'not_found', 'api_error')),
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  endpoint text,
  http_status integer,
  error_code text,
  error_message text,
  credit_cost numeric,
  vendor_cache_age_days integer,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ninjapear_attempts_key_time
  ON public.ninjapear_enrichment_attempts (cache_key, attempted_at DESC);

CREATE TABLE IF NOT EXISTS public.ninjapear_headcount_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  firm_id uuid REFERENCES public.firm_records(id) ON DELETE CASCADE,
  employee_count integer NOT NULL CHECK (employee_count >= 0),
  observed_at timestamptz NOT NULL DEFAULT now(),
  vendor_cache_age_days integer,
  CONSTRAINT ninjapear_headcount_owner_check CHECK (
    organization_id IS NOT NULL OR firm_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_ninjapear_headcount_org_time
  ON public.ninjapear_headcount_snapshots (organization_id, observed_at DESC)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ninjapear_headcount_firm_time
  ON public.ninjapear_headcount_snapshots (firm_id, observed_at DESC)
  WHERE firm_id IS NOT NULL;

ALTER TABLE public.ninjapear_enrichment_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ninjapear_enrichment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ninjapear_headcount_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ninjapear_enrichment_cache FROM anon, authenticated;
REVOKE ALL ON public.ninjapear_enrichment_attempts FROM anon, authenticated;
REVOKE ALL ON public.ninjapear_headcount_snapshots FROM anon, authenticated;

GRANT ALL ON public.ninjapear_enrichment_cache TO service_role;
GRANT ALL ON public.ninjapear_enrichment_attempts TO service_role;
GRANT ALL ON public.ninjapear_headcount_snapshots TO service_role;

CREATE POLICY "ninjapear_cache_service_role"
  ON public.ninjapear_enrichment_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "ninjapear_attempts_service_role"
  ON public.ninjapear_enrichment_attempts FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "ninjapear_headcount_service_role"
  ON public.ninjapear_headcount_snapshots FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ninjapear_enrichment_cache IS
  'One-day application cache for credit-bearing NinjaPear calls; includes negative lookups.';
COMMENT ON TABLE public.ninjapear_enrichment_attempts IS
  'Operational log distinguishing successful calls, no-result responses, and API failures.';
COMMENT ON COLUMN public.organizations.ninjapear_headcount_growth IS
  'Growth derived from Vekta-stored NinjaPear headcount observations; NinjaPear does not return a growth field.';
