-- QA pass: fix street addresses in hq_city, normalize country data, clean edge cases.
-- Also includes Credo Ventures (Prague) and Samaipata (Madrid, Spain) fixes.

-- Credo Ventures: street address in hq_city, postal code in hq_country
UPDATE public.firm_records
SET hq_city = 'Prague', hq_state = NULL, hq_country = 'Czech Republic', updated_at = now()
WHERE lower(trim(firm_name)) = 'credo ventures' AND deleted_at IS NULL;

-- Dragoneer: arts-center building in hq_city, state/country reversed
UPDATE public.firm_records
SET hq_city = 'San Francisco', hq_state = 'California', hq_country = 'US', updated_at = now()
WHERE id = 'b0cb5e44-e46e-42b0-a44d-e07438f10b40';

-- FIRSTPICK: street in hq_city, street number in hq_state, city in hq_country
UPDATE public.firm_records
SET hq_city = 'Vilnius', hq_state = NULL, hq_country = 'Lithuania', updated_at = now()
WHERE id = '22304510-bba8-4a56-a32f-f21f11a8d29a';

-- Future Energy Ventures: German street address in hq_city, wrong hq_state
UPDATE public.firm_records
SET hq_city = 'Essen', hq_state = NULL, hq_country = 'Germany', updated_at = now()
WHERE id = '265d0122-661b-4818-bc0b-e81b18ffe1f3';

-- Keen Venture Partners: Dutch street address in hq_city, city in hq_state
UPDATE public.firm_records
SET hq_city = 'Amsterdam', hq_state = NULL, updated_at = now()
WHERE id = '60197811-0886-4681-b5fa-bccd463736f4';

-- Lulu Cheng Meservey: "Washington DC" in hq_city causes "Washington Dc, DC"
UPDATE public.firm_records
SET hq_city = 'Washington', updated_at = now()
WHERE id = 'dcb3185a-e071-44cc-8460-cd243d7d8bf6';

-- Oyster Bay Venture Capital: street address in hq_city, postal code in hq_state, city in hq_country
UPDATE public.firm_records
SET hq_city = 'Hamburg', hq_state = NULL, hq_country = 'Germany', updated_at = now()
WHERE id = '98fcb59d-4293-4189-a712-7552a08a0d6c';

-- Vendep Capital: street address in hq_city, correct city already in hq_state
UPDATE public.firm_records
SET hq_city = 'Espoo', hq_state = NULL, updated_at = now()
WHERE id = 'ff96f38d-8f3b-43fd-9fd5-ac4712b5302a';

-- Air Street Capital: hq_state has garbage "UK (U.S. presence)"
UPDATE public.firm_records
SET hq_state = NULL, updated_at = now()
WHERE id = '8043e1a4-9b5e-4d64-b96a-5beb98ea5f9c';

-- Antler: hq_country = 'Singapore' causes "Singapore, Singapore" — use ISO code
UPDATE public.firm_records
SET hq_country = 'SG', updated_at = now()
WHERE id = 'b5e52ada-c3ce-4eb2-9e29-0daf8792bdbf';
