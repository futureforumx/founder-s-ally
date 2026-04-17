-- ============================================================
-- STEP 3 of 7: LOAD PORTFOLIO COMPANIES FROM JSONB
-- ~21k unique companies extracted from investormatch_vc_firms.portfolio
-- Takes ~15 seconds.
-- ============================================================

SET statement_timeout = '120s';

INSERT INTO public.graph_organizations (
  name, org_type, website_url, hq_city, hq_country,
  description, sector_tags, source_table, source_id
)
SELECT DISTINCT ON (lower(trim(pc_name)))
  trim(pc_name),
  'portfolio_company',
  nullif(trim(coalesce(pc_website,'')), ''),
  nullif(trim(coalesce(pc_city,'')), ''),
  nullif(trim(coalesce(pc_country,'')), ''),
  nullif(trim(coalesce(pc_desc,'')), ''),
  CASE WHEN pc_sector IS NOT NULL AND trim(pc_sector) != ''
    THEN ARRAY[trim(pc_sector)] ELSE ARRAY[]::text[] END,
  'investormatch_vc_firms_portfolio',
  md5(lower(trim(pc_name)))
FROM (
  SELECT
    pe->>'name'        AS pc_name,
    pe->>'website'     AS pc_website,
    pe->>'hq_city'     AS pc_city,
    pe->>'hq_country'  AS pc_country,
    pe->>'description' AS pc_desc,
    pe->>'sector'      AS pc_sector
  FROM public.investormatch_vc_firms,
       jsonb_array_elements(portfolio) AS pe
  WHERE portfolio IS NOT NULL
    AND jsonb_array_length(portfolio) > 0
) sub
WHERE pc_name IS NOT NULL
  AND length(trim(pc_name)) > 2
  AND trim(pc_name) !~ '^\d'
  AND trim(pc_name) !~ '^(http|www)'
  AND md5(lower(trim(pc_name))) NOT IN (
    SELECT source_id FROM public.graph_organizations
    WHERE source_table = 'investormatch_vc_firms_portfolio' AND source_id IS NOT NULL
  )
ORDER BY lower(trim(pc_name));

INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT '03_portfolio', 'Portfolio companies loaded',
  COUNT(*) FROM public.graph_organizations WHERE org_type = 'portfolio_company';

SELECT COUNT(*) AS portfolio_companies_loaded
FROM public.graph_organizations WHERE org_type = 'portfolio_company';
