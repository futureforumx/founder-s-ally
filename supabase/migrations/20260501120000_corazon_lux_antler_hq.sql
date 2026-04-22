-- Canonical HQ for Corazon Capital, Lux Capital, and Antler.
-- Idempotent. Locks HQ so batch jobs do not overwrite (see canonical_hq_guard).

-- ── Corazon Capital — Chicago, IL ───────────────────────────────────────────
UPDATE public.firm_records
SET
  hq_city              = 'Chicago',
  hq_state             = 'IL',
  hq_country           = NULL,
  location             = 'Chicago, IL',
  canonical_hq_locked  = true,
  canonical_hq_source  = 'manual_admin',
  canonical_hq_set_at  = now(),
  updated_at           = now()
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('Corazon Capital'));

UPDATE public.vc_firms
SET
  hq_city    = 'Chicago',
  hq_state   = 'IL',
  hq_country = NULL,
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('Corazon Capital'));

-- ── Lux Capital — New York, NY ───────────────────────────────────────────────
UPDATE public.firm_records
SET
  hq_city              = 'New York',
  hq_state             = 'NY',
  hq_country           = NULL,
  location             = 'New York, NY',
  canonical_hq_locked  = true,
  canonical_hq_source  = 'manual_admin',
  canonical_hq_set_at  = now(),
  updated_at           = now()
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('Lux Capital'));

UPDATE public.vc_firms
SET
  hq_city    = 'New York',
  hq_state   = 'NY',
  hq_country = NULL,
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('Lux Capital'));

-- ── Antler — New York, NY ────────────────────────────────────────────────────
UPDATE public.firm_records
SET
  hq_city              = 'New York',
  hq_state             = 'NY',
  hq_country           = NULL,
  location             = 'New York, NY',
  canonical_hq_locked  = true,
  canonical_hq_source  = 'manual_admin',
  canonical_hq_set_at  = now(),
  updated_at           = now()
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('Antler'));

UPDATE public.vc_firms
SET
  hq_city    = 'New York',
  hq_state   = 'NY',
  hq_country = NULL,
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('Antler'));
