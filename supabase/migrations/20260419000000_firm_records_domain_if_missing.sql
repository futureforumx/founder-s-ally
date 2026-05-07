-- Prerequisite for 20260420114500_get_new_vc_funds_firm_meta.sql (uses fr.domain).
-- Normally added in 20260418150000_firm_records_intel_classification_behavior.sql;
-- remote DBs that skipped that migration still need the column.

ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS domain text;
