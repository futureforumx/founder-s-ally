-- Fix Thrive Capital fund named "X" → "Thrive X" in vc_funds.
-- vc_funds.name is the fund name; firm is joined via firm_record_id → firm_records.

UPDATE public.vc_funds
SET
  name       = 'Thrive X',
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(trim(name)) = 'x'
  AND firm_record_id IN (
    SELECT id FROM public.firm_records
    WHERE deleted_at IS NULL
      AND lower(trim(firm_name)) = 'thrive capital'
  );
