-- Canonical metadata correction: Heartland Ventures
-- - HQ: Columbus, Ohio
-- - AUM: $140M
--
-- This migration is written to tolerate schema drift between environments:
-- - firm_records always gets the Fresh Capital-facing HQ + AUM fields
-- - canonical HQ lock/source fields are updated only when present
-- - vc_firms only receives fields that exist in that environment

DO $$
DECLARE
  has_canonical_hq_locked boolean;
  has_canonical_hq_source boolean;
  has_canonical_hq_set_at boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'firm_records'
      AND column_name = 'canonical_hq_locked'
  ) INTO has_canonical_hq_locked;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'firm_records'
      AND column_name = 'canonical_hq_source'
  ) INTO has_canonical_hq_source;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'firm_records'
      AND column_name = 'canonical_hq_set_at'
  ) INTO has_canonical_hq_set_at;

  IF has_canonical_hq_locked THEN
    EXECUTE $sql$
      UPDATE public.firm_records
      SET canonical_hq_locked = false
      WHERE deleted_at IS NULL
        AND lower(trim(firm_name)) = lower(trim('Heartland Ventures'))
        AND COALESCE(canonical_hq_locked, false) = true
    $sql$;
  END IF;

  EXECUTE $sql$
    UPDATE public.firm_records
    SET
      hq_city = 'Columbus',
      hq_state = 'Ohio',
      hq_country = 'United States',
      location = 'Columbus, Ohio',
      aum = '$140M',
      aum_usd = 140000000,
      updated_at = now()
    WHERE deleted_at IS NULL
      AND lower(trim(firm_name)) = lower(trim('Heartland Ventures'))
  $sql$;

  IF has_canonical_hq_locked THEN
    EXECUTE $sql$
      UPDATE public.firm_records
      SET canonical_hq_locked = true
      WHERE deleted_at IS NULL
        AND lower(trim(firm_name)) = lower(trim('Heartland Ventures'))
    $sql$;
  END IF;

  IF has_canonical_hq_source THEN
    EXECUTE $sql$
      UPDATE public.firm_records
      SET canonical_hq_source = 'manual_admin'
      WHERE deleted_at IS NULL
        AND lower(trim(firm_name)) = lower(trim('Heartland Ventures'))
    $sql$;
  END IF;

  IF has_canonical_hq_set_at THEN
    EXECUTE $sql$
      UPDATE public.firm_records
      SET canonical_hq_set_at = now()
      WHERE deleted_at IS NULL
        AND lower(trim(firm_name)) = lower(trim('Heartland Ventures'))
    $sql$;
  END IF;
END $$;

DO $$
DECLARE
  has_deleted_at boolean;
  has_updated_at boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_firms'
      AND column_name = 'deleted_at'
  ) INTO has_deleted_at;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_firms'
      AND column_name = 'updated_at'
  ) INTO has_updated_at;

  EXECUTE format(
    'UPDATE public.vc_firms
      SET aum_band = %L::"AumBand"%s
      WHERE lower(trim(firm_name)) = lower(trim(%L))%s',
    'SMALL',
    CASE WHEN has_updated_at THEN ', updated_at = now()' ELSE '' END,
    'Heartland Ventures',
    CASE WHEN has_deleted_at THEN ' AND deleted_at IS NULL' ELSE '' END
  );
END $$;
