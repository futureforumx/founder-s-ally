-- =============================================================================
-- MIGRATION: 20260422181000_drop_connector_source_records_insert_webhook
-- PURPOSE:   Remove the AFTER INSERT pg_net webhook on connector_source_records
--            so staging runs only on explicit POST to the source-record-created
--            Edge Function (predictable path used by the API Google resync worker).
--
-- Downstream: stageEmail / stageCalendar / promote* unchanged — same edge entrypoint.
-- =============================================================================

DROP TRIGGER IF EXISTS source_record_created_webhook ON public.connector_source_records;

DROP FUNCTION IF EXISTS public.notify_source_record_created();
