-- Ananda Impact Ventures: correct firm-level HQ and AUM metadata.
--
-- User-provided corrections:
-- - HQ: Munich, Germany
-- - AUM: EUR 270 million
--
-- Fresh Capital renders firm-level AUM from firm_records.aum_usd; we store the
-- original EUR amount in `aum` and a rounded USD equivalent in `aum_usd`.

UPDATE public.firm_records
SET
  location = 'Munich, Germany',
  hq_city = 'Munich',
  hq_state = NULL,
  hq_country = 'Germany',
  aum = '€270M',
  aum_usd = 316656000,
  updated_at = now()
WHERE deleted_at IS NULL
  AND firm_name = 'Ananda Impact Ventures';
