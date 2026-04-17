-- Aligns local migration filenames with remote `schema_migrations` for version 20260415200000.
-- Remote already applied this version (enrichment and/or operator DDL). Current repo splits that work across:
--   - 20260415180500_operator_profiles_upsert_uniques.sql
--   - 20260418151700_enrichment_provenance_and_checkpoints.sql
SELECT 1;
