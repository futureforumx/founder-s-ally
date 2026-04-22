-- Kleiner Perkins: ensure public site is https://kleinerperkins.com (source of truth; common bad values: legacy kpcb / wrong host from older scrapes).
UPDATE public.firm_records
SET website_url = 'https://kleinerperkins.com'
WHERE deleted_at IS NULL
  AND (
    LOWER(TRIM(firm_name)) = 'kleiner perkins'
    OR LOWER(TRIM(firm_name)) LIKE 'kleiner perkins caufield%'
  );

DO $$
BEGIN
  IF to_regclass('public.vc_firms') IS NOT NULL THEN
    UPDATE public.vc_firms
    SET website = 'https://kleinerperkins.com'
    WHERE deleted_at IS NULL
      AND LOWER(TRIM(id)) = 'kleinerperkins.com';
  END IF;
END $$;
