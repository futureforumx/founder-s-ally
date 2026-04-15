-- Manual enrichment: 2020 Ventures — primary inbox, Crunchbase, founder / representative person row.
-- Idempotent: safe to re-apply.

-- ── firm_records (live investor profile + directory) ───────────────────────
UPDATE public.firm_records fr
SET
  email = 'dw@2020.co',
  email_source = COALESCE(NULLIF(TRIM(fr.email_source), ''), 'manual_migration'),
  crunchbase_url = 'https://www.crunchbase.com/organization/2020-ventures',
  website_url = COALESCE(NULLIF(TRIM(fr.website_url), ''), 'https://2020.co'),
  lead_partner = COALESCE(NULLIF(TRIM(fr.lead_partner), ''), 'David Williams'),
  partner_names = (
    SELECT COALESCE(ARRAY_AGG(DISTINCT t.n), ARRAY[]::text[])
    FROM unnest(COALESCE(fr.partner_names, ARRAY[]::text[]) || ARRAY['David Williams'::text]) AS t(n)
  ),
  updated_at = NOW()
WHERE fr.deleted_at IS NULL
  AND lower(btrim(fr.firm_name)) = '2020 ventures';

-- Primary firm_investors row (oldest active) — align with founder / main contact
UPDATE public.firm_investors fi
SET
  full_name = 'David Williams',
  first_name = 'David',
  last_name = 'Williams',
  email = 'dw@2020.co',
  title = COALESCE(NULLIF(TRIM(fi.title), ''), 'Founder'),
  updated_at = NOW()
FROM (
  SELECT fi2.id
  FROM public.firm_investors fi2
  INNER JOIN public.firm_records fr ON fr.id = fi2.firm_id AND fr.deleted_at IS NULL
  WHERE fi2.deleted_at IS NULL
    AND lower(btrim(fr.firm_name)) = '2020 ventures'
  ORDER BY fi2.created_at ASC NULLS LAST
  LIMIT 1
) pick
WHERE fi.id = pick.id;

-- ── vc_firms / vc_people (Prisma VC directory, omnibox, /firm/:id) ───────────
UPDATE public.vc_firms vf
SET
  email = 'dw@2020.co',
  crunchbase_url = 'https://www.crunchbase.com/organization/2020-ventures',
  website_url = COALESCE(NULLIF(TRIM(vf.website_url), ''), 'https://2020.co'),
  partner_names = (
    SELECT COALESCE(ARRAY_AGG(DISTINCT t.n), ARRAY[]::text[])
    FROM unnest(COALESCE(vf.partner_names, ARRAY[]::text[]) || ARRAY['David Williams'::text]) AS t(n)
  ),
  updated_at = NOW()
WHERE vf.deleted_at IS NULL
  AND lower(btrim(vf.firm_name)) = '2020 ventures';

UPDATE public.vc_people vp
SET
  first_name = 'David',
  last_name = 'Williams',
  email = 'dw@2020.co',
  title = COALESCE(NULLIF(TRIM(vp.title), ''), 'Founder'),
  updated_at = NOW()
FROM (
  SELECT vp2.id
  FROM public.vc_people vp2
  INNER JOIN public.vc_firms vf ON vf.id = vp2.firm_id AND vf.deleted_at IS NULL
  WHERE vp2.deleted_at IS NULL
    AND lower(btrim(vf.firm_name)) = '2020 ventures'
  ORDER BY vp2.created_at ASC NULLS LAST
  LIMIT 1
) pick
WHERE vp.id = pick.id;
