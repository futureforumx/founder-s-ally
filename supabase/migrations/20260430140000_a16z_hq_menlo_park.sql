UPDATE public.firm_records
SET
  hq_city              = 'Menlo Park',
  hq_state             = 'CA',
  hq_country           = 'United States',
  canonical_hq_locked  = true,
  canonical_hq_source  = 'manual',
  canonical_hq_set_at  = NOW(),
  updated_at           = NOW()
WHERE deleted_at IS NULL
  AND (LOWER(firm_name) LIKE '%andreessen%' OR LOWER(firm_name) LIKE '%a16z%');
