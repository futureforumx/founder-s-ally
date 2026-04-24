-- Ensure the Latest Funding (fi_*) pipeline is scheduled by infrastructure,
-- not left as a manual dashboard-only step.
--
-- This migration is safe to re-run:
-- - it enables pg_cron / pg_net if needed
-- - it removes any existing funding-ingest jobs by name
-- - it recreates the incremental + backfill jobs only when the required
--   database settings are present
--
-- Required database settings:
--   ALTER DATABASE postgres SET "app.supabase_url" = 'https://<ref>.supabase.co';
--   ALTER DATABASE postgres SET "app.funding_ingest_cron_secret" = '<secret>';

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  v_url text := current_setting('app.supabase_url', true);
  v_secret text := current_setting('app.funding_ingest_cron_secret', true);
  v_incremental_cmd text;
  v_backfill_cmd text;
  v_job record;
BEGIN
  IF v_url IS NULL OR btrim(v_url) = '' OR v_secret IS NULL OR btrim(v_secret) = '' THEN
    RAISE NOTICE
      'Skipping funding-ingest cron provisioning because app.supabase_url or app.funding_ingest_cron_secret is not set.';
    RETURN;
  END IF;

  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN ('funding-ingest-incremental', 'funding-ingest-backfill')
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  v_incremental_cmd := format(
    $cmd$
      SELECT net.http_post(
        url => %L,
        headers => jsonb_build_object(
          'Content-Type', 'application/json',
          'x-fi-cron-secret', %L
        ),
        body => %L::jsonb
      );
    $cmd$,
    v_url || '/functions/v1/funding-ingest',
    v_secret,
    '{"action":"run","limit":30}'
  );

  v_backfill_cmd := format(
    $cmd$
      SELECT net.http_post(
        url => %L,
        headers => jsonb_build_object(
          'Content-Type', 'application/json',
          'x-fi-cron-secret', %L
        ),
        body => %L::jsonb
      );
    $cmd$,
    v_url || '/functions/v1/funding-ingest',
    v_secret,
    '{"action":"backfill","limit":80}'
  );

  PERFORM cron.schedule(
    'funding-ingest-incremental',
    '*/30 * * * *',
    v_incremental_cmd
  );

  PERFORM cron.schedule(
    'funding-ingest-backfill',
    '0 2 * * 0',
    v_backfill_cmd
  );
END
$$;
