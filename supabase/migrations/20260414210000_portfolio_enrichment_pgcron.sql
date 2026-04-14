-- =============================================================================
-- Migration: Enable pg_net + pg_cron and schedule portfolio enrichment
-- =============================================================================
-- Fires enrich-portfolio-websites every minute with batch_size=15.
-- The edge function is deployed with --no-verify-jwt, so no auth header needed.
-- =============================================================================

-- Extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant cron schema access to postgres role (required on Supabase-hosted pg_cron)
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL  ON ALL TABLES IN SCHEMA cron TO postgres;

-- Remove any stale job before (re)creating
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enrich-portfolio-overnight') THEN
    PERFORM cron.unschedule('enrich-portfolio-overnight');
  END IF;
END $$;

-- Schedule: every minute, batch 15 firms per tick
SELECT cron.schedule(
  'enrich-portfolio-overnight',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://zmnlsdohtwztneamvwaq.supabase.co/functions/v1/enrich-portfolio-websites',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{"batch_size":15}'::jsonb
  );
  $$
);
