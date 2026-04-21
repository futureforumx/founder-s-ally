-- Fix firms showing city-only (hq_country null) or garbage location data.

-- Samaipata: street address in hq_city, wrong country (France → Spain)
UPDATE public.firm_records
SET hq_city    = 'Madrid',
    hq_state   = 'Madrid',
    hq_country = 'Spain',
    updated_at = now()
WHERE id = '6fbb872d-f25e-427c-a83a-746b5ff4c571';

-- Staircase Ventures: Toronto, Ontario — missing hq_country
UPDATE public.firm_records
SET hq_country = 'Canada',
    updated_at = now()
WHERE id = '5f4e837a-8e74-4d37-abed-2f02d800d539';

-- Pitango: herzliya, null state, null country → Israel
UPDATE public.firm_records
SET hq_city    = 'Herzliya',
    hq_country = 'Israel',
    updated_at = now()
WHERE lower(trim(firm_name)) = 'pitango'
  AND deleted_at IS NULL;

-- Kindred Ventures: san francisco, null state, null country
UPDATE public.firm_records
SET hq_state   = 'California',
    hq_country = 'US',
    updated_at = now()
WHERE lower(trim(firm_name)) = 'kindred ventures'
  AND deleted_at IS NULL;

-- Voyager Ventures: seattle, null state, null country
UPDATE public.firm_records
SET hq_state   = 'Washington',
    hq_country = 'US',
    updated_at = now()
WHERE lower(trim(firm_name)) = 'voyager ventures'
  AND deleted_at IS NULL;

-- Scout Ventures: new york, null state, null country
UPDATE public.firm_records
SET hq_state   = 'New York',
    hq_country = 'US',
    updated_at = now()
WHERE lower(trim(firm_name)) = 'scout ventures'
  AND deleted_at IS NULL;

-- nvp capital: "NYC" city, null state, null country → normalize to New York
UPDATE public.firm_records
SET hq_city    = 'New York',
    hq_state   = 'New York',
    hq_country = 'US',
    updated_at = now()
WHERE lower(trim(firm_name)) = 'nvp capital'
  AND deleted_at IS NULL;

-- Lulu Cheng Meservey: "Washington DC", null state, null country
UPDATE public.firm_records
SET hq_state   = 'DC',
    hq_country = 'US',
    updated_at = now()
WHERE lower(trim(firm_name)) = 'lulu cheng meservey'
  AND deleted_at IS NULL;

-- Flybridge: hq_state = 'Massachusetts}}' (has wiki-markup junk)
UPDATE public.firm_records
SET hq_state   = 'Massachusetts',
    updated_at = now()
WHERE lower(trim(firm_name)) = 'flybridge'
  AND deleted_at IS NULL;

-- e2vc: hq_state = 'USA' (not a state)
UPDATE public.firm_records
SET hq_state   = 'California',
    updated_at = now()
WHERE lower(trim(firm_name)) = 'e2vc'
  AND deleted_at IS NULL;

-- SNAK Venture Partners: city typo "Chicaog" + null country
UPDATE public.firm_records
SET hq_city    = 'Chicago',
    hq_country = 'US',
    updated_at = now()
WHERE lower(trim(firm_name)) = 'snak venture partners'
  AND deleted_at IS NULL;

-- US firms with valid hq_state but null hq_country
UPDATE public.firm_records
SET hq_country = 'US',
    updated_at = now()
WHERE lower(trim(firm_name)) IN (
  'coefficient capital',
  'dba',
  'factorial',
  'j2 ventures',
  'root ventures',
  'santé ventures',
  'sonder capital',
  'thrive capital'
)
AND deleted_at IS NULL
AND hq_country IS NULL;
