-- Hummingbird Ventures — public website + firm-level AUM for Fresh Capital (`firm_records`)
-- and VC directory (`vc_firms`).
--
-- vc_firms shape differs by environment (e.g. website vs website_url, optional updated_at).

UPDATE public.firm_records
SET
  website_url = 'https://hummingbird.vc',
  domain = 'hummingbird.vc',
  aum = 1000000000::numeric,
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(trim(firm_name)) = lower(trim('Hummingbird Ventures'));

DO $$
DECLARE
  set_parts text[];
  name_col text;
  has_website boolean;
  has_website_url boolean;
  has_updated_at boolean;
  has_deleted_at boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_firms'
      AND column_name = 'website'
  ) INTO has_website;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_firms'
      AND column_name = 'website_url'
  ) INTO has_website_url;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_firms'
      AND column_name = 'updated_at'
  ) INTO has_updated_at;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vc_firms'
      AND column_name = 'deleted_at'
  ) INTO has_deleted_at;

  IF NOT has_website AND NOT has_website_url THEN
    RAISE NOTICE 'vc_firms has no website/website_url; skipping Hummingbird website update.';
    RETURN;
  END IF;

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
    RAISE NOTICE 'vc_firms has no name/firm_name column; skipping Hummingbird website update.';
    RETURN;
  END IF;

  set_parts := ARRAY[]::text[];
  IF has_website THEN
    set_parts := array_append(set_parts, 'website = ' || quote_literal('https://hummingbird.vc'));
  ELSE
    set_parts := array_append(set_parts, 'website_url = ' || quote_literal('https://hummingbird.vc'));
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
