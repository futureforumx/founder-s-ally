-- ============================================================
-- STEP 4 of 7: INVESTOR → PORTFOLIO EDGES
-- Creates ~27k edges linking each VC firm to its portfolio companies.
-- Takes ~30 seconds.
-- ============================================================

SET statement_timeout = '180s';

INSERT INTO public.graph_org_relationship_edges (
  from_org_id, to_org_id, relationship_type,
  strength_score, trust_score, is_warm, shared_count, evidence
)
SELECT
  go_firm.id,
  go_pc.id,
  'investor_portfolio',
  0.90, 0.85, true, 1,
  jsonb_build_object('source', 'investormatch_vc_firms.portfolio')
FROM public.investormatch_vc_firms f
  CROSS JOIN LATERAL jsonb_array_elements(f.portfolio) AS pe
  JOIN public.graph_organizations go_firm
    ON go_firm.source_table = 'investormatch_vc_firms' AND go_firm.source_id = f.id::text
  JOIN public.graph_organizations go_pc
    ON go_pc.source_table = 'investormatch_vc_firms_portfolio'
    AND go_pc.source_id   = md5(lower(trim(pe->>'name')))
WHERE f.portfolio IS NOT NULL
  AND length(trim(coalesce(pe->>'name',''))) > 2
  AND coalesce(pe->>'name','') !~ '^\d'
  AND coalesce(pe->>'name','') !~ '^(http|www)'
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_org_relationship_edges e
    WHERE e.from_org_id = go_firm.id
      AND e.to_org_id   = go_pc.id
      AND e.relationship_type = 'investor_portfolio'
  );

INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT '04_inv_port', 'Investor→portfolio edges created',
  COUNT(*) FROM public.graph_org_relationship_edges WHERE relationship_type = 'investor_portfolio';

SELECT COUNT(*) AS investor_portfolio_edges
FROM public.graph_org_relationship_edges WHERE relationship_type = 'investor_portfolio';
