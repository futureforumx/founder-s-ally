-- Hummingbird Ventures — public website + firm-level AUM for Fresh Capital (`firm_records`)
-- and VC directory (`vc_firms`).

UPDATE public.firm_records
SET
  website_url = 'https://hummingbird.vc',
  domain = 'hummingbird.vc',
  aum = 1000000000::numeric,
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('Hummingbird Ventures'));

UPDATE public.vc_firms vf
SET
  website_url = 'https://hummingbird.vc',
  updated_at = now()
WHERE vf.deleted_at IS NULL
  AND lower(trim(vf.firm_name)) = lower(trim('Hummingbird Ventures'));
