-- =============================================================================
-- Migration: Enable pg_net + pg_cron for portfolio enrichment scheduling
-- =============================================================================
-- This migration only enables the extensions.  The actual cron job is created
-- by the deploy-portfolio-enrichment GitHub Actions workflow (which injects the
-- correct project URL at deploy time).  Running the workflow once is sufficient;
-- pg_cron then fires the edge function automatically every minute.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant cron usage to postgres role (required by Supabase-hosted pg_cron)
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL  ON ALL TABLES IN SCHEMA cron TO postgres;
