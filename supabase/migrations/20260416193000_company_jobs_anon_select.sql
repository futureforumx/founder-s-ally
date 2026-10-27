-- Public read of ingested job rows for Network directory UIs (anon publishable key).
-- company_jobs is created by Prisma, not by this migration history. Skip when absent.

DO $$
BEGIN
  IF to_regclass('public.company_jobs') IS NOT NULL THEN
    ALTER TABLE public.company_jobs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Anon read company_jobs" ON public.company_jobs;
    DROP POLICY IF EXISTS "Authenticated read company_jobs" ON public.company_jobs;
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
  END IF;

  IF to_regclass('public.company_job_ingestion_runs') IS NOT NULL THEN
    ALTER TABLE public.company_job_ingestion_runs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Anon read company_job_ingestion_runs" ON public.company_job_ingestion_runs;
    DROP POLICY IF EXISTS "Authenticated read company_job_ingestion_runs" ON public.company_job_ingestion_runs;
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
  END IF;
END $$;
