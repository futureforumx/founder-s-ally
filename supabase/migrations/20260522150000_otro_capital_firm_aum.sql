-- Otro Capital — firm-level AUM reflects inaugural fund close (~$1.2B committed per BusinessWire Feb 2026).
-- firm_records: Connect / `get_new_vc_funds` firm_aum_usd
-- vc_firms: directory badge uses `aum_band` (derived bands; ≥$1B → MEGA_FUND)

UPDATE public.firm_records
SET
  aum = 1200000000::numeric,
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('Otro Capital'));

UPDATE public.vc_firms vf
SET
  aum_band = 'MEGA_FUND'::"AumBand",
  updated_at = now()
WHERE vf.deleted_at IS NULL
  AND lower(trim(vf.firm_name)) = lower(trim('Otro Capital'));
