-- Public read of ingested job rows for Network directory UIs (anon publishable key).

ALTER TABLE public.company_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_job_ingestion_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read company_jobs" ON public.company_jobs;
DROP POLICY IF EXISTS "Authenticated read company_jobs" ON public.company_jobs;
DROP POLICY IF EXISTS "Anon read company_job_ingestion_runs" ON public.company_job_ingestion_runs;
DROP POLICY IF EXISTS "Authenticated read company_job_ingestion_runs" ON public.company_job_ingestion_runs;

CREATE POLICY "Anon read company_jobs"
  ON public.company_jobs
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated read company_jobs"
  ON public.company_jobs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon read company_job_ingestion_runs"
  ON public.company_job_ingestion_runs
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated read company_job_ingestion_runs"
  ON public.company_job_ingestion_runs
  FOR SELECT
  TO authenticated
  USING (true);
