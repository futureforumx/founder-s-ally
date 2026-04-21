-- Canonical HQ: Hummingbird Ventures — London, U.K.
-- - firm_records: Fresh Capital (`get_new_vc_funds` firm_location) + Connect profiles (`useInvestorProfile`)
-- - vc_firms: `/firm/:id` directory profile (`FirmProfile`)

-- If HQ is locked, unlock in a separate statement so the canonical guard trigger allows edits.
UPDATE public.firm_records
SET canonical_hq_locked = false
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('Hummingbird Ventures'))
  AND COALESCE(canonical_hq_locked, false) = true;

UPDATE public.firm_records
SET
  hq_city = 'London',
  hq_state = NULL,
  hq_country = 'U.K.',
  location = 'London, U.K.',
  canonical_hq_locked = true,
  canonical_hq_source = 'manual_admin',
  canonical_hq_set_at = now(),
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('Hummingbird Ventures'));

UPDATE public.vc_firms vf
SET
  hq_city = 'London',
  hq_state = NULL,
  hq_country = 'U.K.',
  updated_at = now()
WHERE vf.deleted_at IS NULL
  AND lower(trim(vf.firm_name)) = lower(trim('Hummingbird Ventures'));
