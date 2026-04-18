-- =============================================================================
-- MIGRATION: 0005_connector_source_records_webhook_trigger
-- PURPOSE:   Creates a pg_net-backed HTTP trigger that fires the
--            source-record-created Edge Function whenever a new row is
--            inserted into public.connector_source_records.
--
-- NOTE:      This migration was first applied to the remote DB on 2026-03-18
--            via the Supabase MCP (execute_sql).  This file preserves the
--            exact SQL so the local migration history matches the remote state.
--
-- DEPENDS ON: 0002_phase2_connectors_ingestion_staging.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_source_record_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://zmnlsdohtwztneamvwaq.supabase.co/functions/v1/source-record-created',
    body    := jsonb_build_object(
      'type',       'INSERT',
      'table',      'connector_source_records',
      'schema',     'public',
      'record',     row_to_json(NEW)::jsonb,
      'old_record', NULL
    ),
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-webhook-secret', '629b3b659979ea658c556c10581f7fbc2c998218528495a6c604fb8667101665'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS source_record_created_webhook
  ON public.connector_source_records;

CREATE TRIGGER source_record_created_webhook
  AFTER INSERT ON public.connector_source_records
  FOR EACH ROW EXECUTE FUNCTION public.notify_source_record_created();
