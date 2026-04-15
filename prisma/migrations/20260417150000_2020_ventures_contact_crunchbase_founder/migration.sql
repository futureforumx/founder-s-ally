-- Manual enrichment: 2020 Ventures — Prisma VC directory (subset of supabase migration when firm_records is not in scope).
-- Idempotent. See supabase/migrations/20260417150000_2020_ventures_contact_crunchbase_founder.sql for firm_records + firm_investors.

UPDATE "vc_firms" vf
SET
  "email" = 'dw@2020.co',
  "crunchbase_url" = 'https://www.crunchbase.com/organization/2020-ventures',
  "website_url" = COALESCE(NULLIF(TRIM(vf."website_url"), ''), 'https://2020.co'),
  "partner_names" = (
    SELECT COALESCE(ARRAY_AGG(DISTINCT t.n), ARRAY[]::text[])
    FROM unnest(COALESCE(vf."partner_names", ARRAY[]::text[]) || ARRAY['David Williams'::text]) AS t(n)
  ),
  "updated_at" = NOW()
WHERE vf."deleted_at" IS NULL
  AND lower(btrim(vf."firm_name")) = '2020 ventures';

UPDATE "vc_people" vp
SET
  "first_name" = 'David',
  "last_name" = 'Williams',
  "email" = 'dw@2020.co',
  "title" = COALESCE(NULLIF(TRIM(vp."title"), ''), 'Founder'),
  "updated_at" = NOW()
FROM (
  SELECT vp2."id"
  FROM "vc_people" vp2
  INNER JOIN "vc_firms" vf ON vf."id" = vp2."firm_id" AND vf."deleted_at" IS NULL
  WHERE vp2."deleted_at" IS NULL
    AND lower(btrim(vf."firm_name")) = '2020 ventures'
  ORDER BY vp2."created_at" ASC NULLS LAST
  LIMIT 1
) pick
WHERE vp."id" = pick."id";
