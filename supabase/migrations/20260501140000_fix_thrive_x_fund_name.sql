-- Fix Thrive Capital fund named "X" → "Thrive X" in vc_funds.
-- The fund was imported with a truncated name; correct it to the canonical "Thrive X".

UPDATE public.vc_funds
SET
  fund_name  = 'Thrive X',
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(trim(fund_name))  = lower(trim('X'))
  AND lower(trim(firm_name))  = lower(trim('Thrive Capital'));
