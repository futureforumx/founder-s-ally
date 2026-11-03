UPDATE public.firm_records
SET firm_name = 'Thoma Bravo',
    firm_type = 'pe',
    entity_type = 'Institutional',
    updated_at = now()
WHERE firm_name = 'Thoma Bravo (Individual)'
  AND lower(trim(coalesce(firm_type, ''))) = 'individual'
  AND entity_type = 'Angel'
  AND deleted_at IS NULL;
