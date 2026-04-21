UPDATE public.firm_records
SET
  hq_city    = 'New York',
  hq_state   = 'NY',
  hq_country = 'United States',
  updated_at = NOW()
WHERE deleted_at IS NULL
  AND LOWER(firm_name) LIKE '%lux capital%';
