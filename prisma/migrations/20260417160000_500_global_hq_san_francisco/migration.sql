-- Canonical HQ for 500 Global (vc_* only; firm_records lives in supabase migration when used).

UPDATE "vc_firms" vf
SET
  "hq_city" = 'San Francisco',
  "hq_state" = 'CA',
  "hq_country" = NULL,
  "updated_at" = NOW()
WHERE vf."deleted_at" IS NULL
  AND lower(trim(vf."firm_name")) = lower(trim('500 Global'));
