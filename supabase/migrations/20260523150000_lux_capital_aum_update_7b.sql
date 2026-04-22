-- Raise Lux Capital firm AUM to $7B (supersedes 20260523140000 if already applied at $1.5B).

UPDATE public.firm_records
SET
  aum = 7000000000::numeric,
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('Lux Capital'));

UPDATE public.vc_firms vf
SET
  aum_band = 'MEGA_FUND'::"AumBand",
  updated_at = now()
WHERE vf.deleted_at IS NULL
  AND lower(trim(vf.firm_name)) = lower(trim('Lux Capital'));
