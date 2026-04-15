-- Canonical HQ for 500 Global (structured fields + legacy location line).
-- Idempotent. Locks HQ so batch jobs do not overwrite (see canonical_hq_guard).

UPDATE public.firm_records
SET
  hq_city = 'San Francisco',
  hq_state = 'CA',
  hq_country = NULL,
  location = 'San Francisco, CA',
  canonical_hq_locked = true,
  canonical_hq_source = 'manual_admin',
  canonical_hq_set_at = now(),
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('500 Global'));

UPDATE public.vc_firms vf
SET
  hq_city = 'San Francisco',
  hq_state = 'CA',
  hq_country = NULL,
  updated_at = NOW()
WHERE vf.deleted_at IS NULL
  AND lower(trim(vf.firm_name)) = lower(trim('500 Global'));
