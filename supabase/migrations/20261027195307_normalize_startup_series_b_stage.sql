-- Replace the legacy uppercase stage stored by the company catalog import.
UPDATE public.startups
SET stage = 'series_b'::public."OperatorCompanyStage"
WHERE stage::text = 'SERIES_B';

-- Future company-analysis syncs should write the same lower-case canonical
-- value as the AdminMarketIntelligence stage selector.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.upsert_startup_from_company_analysis(public.company_analyses)'::regprocedure
  );

  IF position('WHEN ''series b'' THEN ''SERIES_B''' in v_definition) = 0
     OR position('WHEN ''series b+'' THEN ''SERIES_B''' in v_definition) = 0
     OR position('WHEN ''series b +'' THEN ''SERIES_B''' in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected existing company stage normalization mappings were not found';
  END IF;

  v_definition := replace(v_definition,
    'WHEN ''series b'' THEN ''SERIES_B''',
    'WHEN ''series b'' THEN ''series_b''');
  v_definition := replace(v_definition,
    'WHEN ''series b+'' THEN ''SERIES_B''',
    'WHEN ''series b+'' THEN ''series_b''');
  v_definition := replace(v_definition,
    'WHEN ''series b +'' THEN ''SERIES_B''',
    'WHEN ''series b +'' THEN ''series_b''');

  EXECUTE v_definition;
END;
$migration$;
