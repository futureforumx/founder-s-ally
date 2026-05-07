-- Canonical HQ: Hummingbird Ventures — London, U.K.
-- - firm_records: Fresh Capital (`get_new_vc_funds` firm_location) + Connect profiles (`useInvestorProfile`)
-- - vc_firms: `/firm/:id` directory profile (`FirmProfile`)
--
-- Tolerates environments where canonical HQ governance columns are not migrated yet.

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
        AND lower(trim(firm_name)) = lower(trim('Hummingbird Ventures'))
        AND COALESCE(canonical_hq_locked, false) = true
    $sql$;
  END IF;

  EXECUTE $sql$
    UPDATE public.firm_records
    SET
      hq_city = 'London',
      hq_state = NULL,
      hq_country = 'U.K.',
      location = 'London, U.K.',
      updated_at = now()
    WHERE deleted_at IS NULL
      AND lower(trim(firm_name)) = lower(trim('Hummingbird Ventures'))
  $sql$;

  IF has_canonical_hq_locked THEN
    EXECUTE $sql$
      UPDATE public.firm_records
      SET canonical_hq_locked = true
      WHERE deleted_at IS NULL
        AND lower(trim(firm_name)) = lower(trim('Hummingbird Ventures'))
    $sql$;
  END IF;

  IF has_canonical_hq_source THEN
    EXECUTE $sql$
      UPDATE public.firm_records
      SET canonical_hq_source = 'manual_admin'
      WHERE deleted_at IS NULL
        AND lower(trim(firm_name)) = lower(trim('Hummingbird Ventures'))
    $sql$;
  END IF;

  IF has_canonical_hq_set_at THEN
    EXECUTE $sql$
      UPDATE public.firm_records
      SET canonical_hq_set_at = now()
      WHERE deleted_at IS NULL
        AND lower(trim(firm_name)) = lower(trim('Hummingbird Ventures'))
    $sql$;
  END IF;
END $$;

DO $$
DECLARE
  has_hq_city boolean;
  has_hq_state boolean;
  has_hq_country boolean;
  has_deleted_at boolean;
  has_updated_at boolean;
  name_col text;
  set_parts text[];
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_firms'
      AND column_name = 'hq_city'
  ) INTO has_hq_city;

  IF NOT has_hq_city THEN
    RAISE NOTICE 'vc_firms has no hq_city; skipping Hummingbird vc_firms HQ update.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_firms'
      AND column_name = 'hq_state'
  ) INTO has_hq_state;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_firms'
      AND column_name = 'hq_country'
  ) INTO has_hq_country;

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

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_firms'
      AND column_name = 'name'
  ) THEN
    name_col := 'name';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_firms'
      AND column_name = 'firm_name'
  ) THEN
    name_col := 'firm_name';
  ELSE
    RAISE NOTICE 'vc_firms has no name/firm_name column; skipping Hummingbird vc_firms HQ update.';
    RETURN;
  END IF;

  set_parts := ARRAY['hq_city = ' || quote_literal('London')];
  IF has_hq_state THEN
    set_parts := array_append(set_parts, 'hq_state = NULL');
  END IF;
  IF has_hq_country THEN
    set_parts := array_append(set_parts, 'hq_country = ' || quote_literal('U.K.'));
  END IF;
  IF has_updated_at THEN
    set_parts := array_append(set_parts, 'updated_at = now()');
  END IF;

  EXECUTE format(
    'UPDATE public.vc_firms SET %s WHERE lower(trim(%I)) = lower(trim(%L))%s',
    array_to_string(set_parts, ', '),
    name_col,
    'Hummingbird Ventures',
    CASE WHEN has_deleted_at THEN ' AND deleted_at IS NULL' ELSE '' END
  );
END $$;
