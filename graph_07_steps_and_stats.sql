-- ============================================================
-- STEP 7 of 7: PATH STEPS + FINAL STATS
-- Materialises step records and prints full summary.
-- Takes ~5 seconds.
-- ============================================================

SET statement_timeout = '60s';

-- 1-hop steps
INSERT INTO public.graph_intro_path_steps (
  path_id, step_order, from_org_id, to_org_id, edge_type, edge_strength
)
SELECT ipc.id, 1, ipc.source_org_id, ipc.target_org_id,
       'investor_portfolio_match', ipc.path_score
FROM public.graph_intro_path_candidates ipc
WHERE ipc.hop_count = 1
  AND ipc.source_org_id IS NOT NULL
  AND ipc.target_org_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_intro_path_steps s WHERE s.path_id = ipc.id AND s.step_order = 1
  );

-- 2-hop step 1: startup → bridging VC
INSERT INTO public.graph_intro_path_steps (
  path_id, step_order, from_org_id, to_org_id, via_org_id, edge_type, edge_strength
)
SELECT ipc.id, 1, ipc.source_org_id, bridge.id, ipc.source_org_id,
       'investor_portfolio_match', ipc.path_score
FROM public.graph_intro_path_candidates ipc
JOIN public.graph_organizations bridge
  ON lower(bridge.name) = lower(ipc.explanation->'via'->>1)
  AND bridge.org_type   = 'vc_firm'
WHERE ipc.hop_count = 2
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_intro_path_steps s WHERE s.path_id = ipc.id AND s.step_order = 1
  );

-- 2-hop step 2: bridging VC → target VC
INSERT INTO public.graph_intro_path_steps (
  path_id, step_order, from_org_id, to_org_id, edge_type, edge_strength
)
SELECT s1.path_id, 2, s1.to_org_id, ipc.target_org_id,
       'co_investor', ore.strength_score
FROM public.graph_intro_path_steps s1
JOIN public.graph_intro_path_candidates ipc ON ipc.id = s1.path_id AND ipc.hop_count = 2
JOIN public.graph_org_relationship_edges ore
  ON ore.from_org_id = s1.to_org_id
  AND ore.to_org_id  = ipc.target_org_id
  AND ore.relationship_type = 'co_investor'
WHERE s1.step_order = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_intro_path_steps s WHERE s.path_id = s1.path_id AND s.step_order = 2
  );

INSERT INTO public.graph_bootstrap_log(phase, message) VALUES ('07_complete', 'Bootstrap complete ✓');

-- ── FINAL SUMMARY ──────────────────────────────────────────
SELECT entity, count FROM (
  SELECT 'vc_firms'               AS entity, COUNT(*) AS count FROM public.graph_organizations WHERE org_type = 'vc_firm'
  UNION ALL
  SELECT 'startups',                          COUNT(*) FROM public.graph_organizations WHERE org_type = 'startup'
  UNION ALL
  SELECT 'portfolio_companies',               COUNT(*) FROM public.graph_organizations WHERE org_type = 'portfolio_company'
  UNION ALL
  SELECT 'founders',                          COUNT(*) FROM public.graph_people WHERE person_type = 'founder'
  UNION ALL
  SELECT 'person_org_edges',                  COUNT(*) FROM public.graph_person_org_edges
  UNION ALL
  SELECT 'cofounder_edges',                   COUNT(*) FROM public.graph_person_relationship_edges
  UNION ALL
  SELECT 'investor_portfolio_edges',          COUNT(*) FROM public.graph_org_relationship_edges WHERE relationship_type = 'investor_portfolio'
  UNION ALL
  SELECT 'co_investor_edges',                 COUNT(*) FROM public.graph_org_relationship_edges WHERE relationship_type = 'co_investor'
  UNION ALL
  SELECT 'intro_paths_1hop',                  COUNT(*) FROM public.graph_intro_path_candidates WHERE hop_count = 1
  UNION ALL
  SELECT 'intro_paths_2hop',                  COUNT(*) FROM public.graph_intro_path_candidates WHERE hop_count = 2
  UNION ALL
  SELECT 'intro_paths_3hop',                  COUNT(*) FROM public.graph_intro_path_candidates WHERE hop_count = 3
  UNION ALL
  SELECT 'intro_path_steps',                  COUNT(*) FROM public.graph_intro_path_steps
) t
ORDER BY entity;
