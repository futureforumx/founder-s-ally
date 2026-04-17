-- ============================================================
-- STEP 2 of 7: LOAD VC FIRMS + STARTUPS + FOUNDERS
-- Run after step 1. Takes ~5 seconds.
-- ============================================================

-- VC firms → organizations
INSERT INTO public.graph_organizations (
  name, slug, org_type, website_url, linkedin_url,
  hq_city, hq_country, sector_tags, stage_tags,
  logo_url, description, source_table, source_id
)
SELECT
  trim(name),
  slug,
  'vc_firm',
  nullif(trim(coalesce(website_url,'')), ''),
  nullif(trim(coalesce(linkedin_url,'')), ''),
  nullif(trim(split_part(coalesce(hq_geo,''), ', ', 1)), ''),
  nullif(trim(split_part(coalesce(hq_geo,''), ', ', 2)), ''),
  coalesce(sector_tags::text[], ARRAY[]::text[]),
  coalesce(stage_focus::text[], ARRAY[]::text[]),
  nullif(trim(coalesce(logo_url,'')), ''),
  nullif(trim(coalesce(thesis_summary,'')), ''),
  'investormatch_vc_firms',
  id::text
FROM public.investormatch_vc_firms
WHERE trim(coalesce(name,'')) != ''
  AND id::text NOT IN (
    SELECT source_id FROM public.graph_organizations
    WHERE source_table = 'investormatch_vc_firms' AND source_id IS NOT NULL
  );

-- Startups → organizations
INSERT INTO public.graph_organizations (
  name, org_type, website_url, hq_city, hq_state, hq_country,
  description, logo_url, source_table, source_id
)
SELECT
  company_name, 'startup', company_url,
  hq_city, hq_state, hq_country,
  coalesce(description_short, description_long), logo_url,
  'startups', id::text
FROM public.startups
WHERE company_name IS NOT NULL
  AND id::text NOT IN (
    SELECT source_id FROM public.graph_organizations WHERE source_table = 'startups'
  );

-- Founders → people
INSERT INTO public.graph_people (
  full_name, slug, person_type, linkedin_url, location, source_table, source_id
)
SELECT
  full_name,
  lower(regexp_replace(trim(full_name), '\s+', '-', 'g')),
  'founder',
  nullif(trim(coalesce(linkedin_url,'')), ''),
  nullif(trim(coalesce(location,'')), ''),
  'startup_founders', id
FROM public.startup_founders
WHERE trim(coalesce(full_name,'')) != ''
  AND id NOT IN (
    SELECT source_id FROM public.graph_people WHERE source_table = 'startup_founders'
  );

-- LinkedIn external identities
INSERT INTO public.graph_person_external_identities (person_id, platform, external_id, profile_url)
SELECT
  gp.id, 'linkedin',
  regexp_replace(sf.linkedin_url, '^.*linkedin\.com/in/', ''),
  sf.linkedin_url
FROM public.startup_founders sf
JOIN public.graph_people gp ON gp.source_table = 'startup_founders' AND gp.source_id = sf.id
WHERE sf.linkedin_url IS NOT NULL AND sf.linkedin_url != ''
ON CONFLICT (person_id, platform) DO NOTHING;

-- Person → org edges (founder ↔ startup)
INSERT INTO public.graph_person_org_edges (person_id, org_id, role, is_current)
SELECT DISTINCT gp.id, go.id, sf.role, true
FROM public.startup_founders sf
JOIN public.graph_people gp       ON gp.source_table = 'startup_founders' AND gp.source_id = sf.id
JOIN public.startups s             ON s.id::text = sf.startup_id
JOIN public.graph_organizations go ON go.source_table = 'startups' AND go.source_id = s.id::text
WHERE NOT EXISTS (
  SELECT 1 FROM public.graph_person_org_edges e
  WHERE e.person_id = gp.id AND e.org_id = go.id AND coalesce(e.role,'') = coalesce(sf.role,'')
);

-- Co-founder edges
INSERT INTO public.graph_person_relationship_edges (
  person_a_id, person_b_id, relationship_type,
  strength_score, trust_score, recency_score,
  interaction_count, is_warm, evidence
)
SELECT DISTINCT
  gp_a.id, gp_b.id, 'co_founder',
  0.95, 0.90, 0.80, 100, true,
  jsonb_build_object('shared_startup_id', sf_a.startup_id)
FROM public.startup_founders sf_a
JOIN public.startup_founders sf_b ON sf_b.startup_id = sf_a.startup_id AND sf_b.id > sf_a.id
JOIN public.graph_people gp_a ON gp_a.source_table = 'startup_founders' AND gp_a.source_id = sf_a.id
JOIN public.graph_people gp_b ON gp_b.source_table = 'startup_founders' AND gp_b.source_id = sf_b.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.graph_person_relationship_edges e
  WHERE LEAST(e.person_a_id::text, e.person_b_id::text) = LEAST(gp_a.id::text, gp_b.id::text)
    AND GREATEST(e.person_a_id::text, e.person_b_id::text) = GREATEST(gp_a.id::text, gp_b.id::text)
    AND e.relationship_type = 'co_founder'
);

INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT '02_orgs_people', 'VC firms + startups + founders loaded',
  (SELECT COUNT(*) FROM public.graph_organizations) +
  (SELECT COUNT(*) FROM public.graph_people);

SELECT
  (SELECT COUNT(*) FROM public.graph_organizations WHERE org_type = 'vc_firm')    AS vc_firms,
  (SELECT COUNT(*) FROM public.graph_organizations WHERE org_type = 'startup')    AS startups,
  (SELECT COUNT(*) FROM public.graph_people)                                      AS founders,
  (SELECT COUNT(*) FROM public.graph_person_org_edges)                            AS person_org_edges,
  (SELECT COUNT(*) FROM public.graph_person_relationship_edges)                   AS cofounder_edges;
