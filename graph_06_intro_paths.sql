-- ============================================================
-- STEP 6 of 7: INTRO PATH CANDIDATES (1-hop, 2-hop, 3-hop)
-- Seed set: all founders in graph_people.
-- Takes ~20 seconds.
-- ============================================================

SET statement_timeout = '180s';

-- ── 1-HOP: startup name appears in a VC's portfolio ───────────────────────
INSERT INTO public.graph_intro_path_candidates (
  source_person_id, source_org_id, target_org_id,
  hop_count, path_score, explanation
)
SELECT DISTINCT
  gp.id, go_startup.id, go_firm.id,
  1,
  ROUND(0.90 * ore.strength_score, 3),
  jsonb_build_object(
    'summary', gp.full_name || ' → ' || go_firm.name || ' (direct portfolio)',
    'reasons', jsonb_build_array(
      go_firm.name || ' has ' || go_startup.name || ' in their portfolio',
      'Direct portfolio relationship — strongest intro signal',
      'VC already knows the founder''s work'
    ),
    'hop_count', 1,
    'via', jsonb_build_array(go_startup.name)
  )
FROM public.graph_person_org_edges poe
JOIN public.graph_people          gp         ON gp.id = poe.person_id
JOIN public.graph_organizations   go_startup ON go_startup.id = poe.org_id AND go_startup.org_type = 'startup'
JOIN public.graph_organizations   go_pc      ON lower(go_pc.name) = lower(go_startup.name)
                                             AND go_pc.org_type = 'portfolio_company'
JOIN public.graph_org_relationship_edges ore ON ore.to_org_id = go_pc.id
                                             AND ore.relationship_type = 'investor_portfolio'
JOIN public.graph_organizations   go_firm    ON go_firm.id = ore.from_org_id AND go_firm.org_type = 'vc_firm'
WHERE NOT EXISTS (
  SELECT 1 FROM public.graph_intro_path_candidates x
  WHERE x.source_person_id = gp.id AND x.target_org_id = go_firm.id AND x.hop_count = 1
);

-- ── 2-HOP: founder → known VC → co-invested VC ────────────────────────────
INSERT INTO public.graph_intro_path_candidates (
  source_person_id, source_org_id, target_org_id,
  hop_count, path_score, explanation
)
SELECT DISTINCT ON (gp.id, co.to_org_id)
  gp.id, go_startup.id, co.to_org_id,
  2,
  ROUND(LEAST(ore.strength_score, co.strength_score) * 0.88, 3),
  jsonb_build_object(
    'summary', gp.full_name || ' → ' || go_firm.name || ' → ' || go_target.name,
    'reasons', jsonb_build_array(
      go_firm.name || ' co-invested with ' || go_target.name,
      go_target.name || ' shares ' || co.shared_count || ' portfolio co(s) with ' || go_firm.name,
      CASE WHEN co.is_warm THEN 'Warm path: strong co-investment bond'
           ELSE 'Pathway via shared portfolio signal' END
    ),
    'hop_count', 2,
    'via', jsonb_build_array(go_startup.name, go_firm.name)
  )
FROM public.graph_person_org_edges poe
JOIN public.graph_people          gp         ON gp.id = poe.person_id
JOIN public.graph_organizations   go_startup ON go_startup.id = poe.org_id AND go_startup.org_type = 'startup'
JOIN public.graph_organizations   go_pc      ON lower(go_pc.name) = lower(go_startup.name)
                                             AND go_pc.org_type = 'portfolio_company'
JOIN public.graph_org_relationship_edges ore ON ore.to_org_id = go_pc.id
                                             AND ore.relationship_type = 'investor_portfolio'
JOIN public.graph_organizations   go_firm    ON go_firm.id = ore.from_org_id AND go_firm.org_type = 'vc_firm'
JOIN public.graph_org_relationship_edges co  ON co.from_org_id = go_firm.id
                                             AND co.relationship_type = 'co_investor'
JOIN public.graph_organizations   go_target  ON go_target.id = co.to_org_id AND go_target.org_type = 'vc_firm'
WHERE NOT EXISTS (
  SELECT 1 FROM public.graph_intro_path_candidates x
  WHERE x.source_person_id = gp.id AND x.target_org_id = co.to_org_id AND x.hop_count <= 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.graph_intro_path_candidates x
  WHERE x.source_person_id = gp.id AND x.target_org_id = co.to_org_id AND x.hop_count = 2
)
ORDER BY gp.id, co.to_org_id, ROUND(LEAST(ore.strength_score, co.strength_score) * 0.88, 3) DESC;

-- ── 3-HOP: extend strongest 2-hop paths one more step ─────────────────────
INSERT INTO public.graph_intro_path_candidates (
  source_person_id, source_org_id, target_org_id,
  hop_count, path_score, explanation
)
SELECT DISTINCT ON (ipc2.source_person_id, co3.to_org_id)
  ipc2.source_person_id, ipc2.source_org_id, co3.to_org_id,
  3,
  ROUND(ipc2.path_score * co3.strength_score * 0.75, 3),
  jsonb_build_object(
    'summary', coalesce(ipc2.explanation->>'summary','') || ' → ' || go_t3.name,
    'reasons', jsonb_build_array(
      '3-hop path via co-investment chain',
      go_t3.name || ' shares portfolio companies with your 2-hop connection',
      'Longer path — prefer shorter routes when available'
    ),
    'hop_count', 3,
    'via', (ipc2.explanation->'via') || jsonb_build_array(go_mid.name)
  )
FROM public.graph_intro_path_candidates ipc2
JOIN public.graph_org_relationship_edges co3 ON co3.from_org_id = ipc2.target_org_id
                                             AND co3.relationship_type = 'co_investor'
                                             AND co3.strength_score >= 0.40
JOIN public.graph_organizations go_t3  ON go_t3.id = co3.to_org_id AND go_t3.org_type = 'vc_firm'
JOIN public.graph_organizations go_mid ON go_mid.id = ipc2.target_org_id
WHERE ipc2.hop_count = 2
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_intro_path_candidates x
    WHERE x.source_person_id = ipc2.source_person_id
      AND x.target_org_id = co3.to_org_id AND x.hop_count <= 2
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_intro_path_candidates x
    WHERE x.source_person_id = ipc2.source_person_id
      AND x.target_org_id = co3.to_org_id AND x.hop_count = 3
  )
ORDER BY ipc2.source_person_id, co3.to_org_id, path_score DESC;

-- Rank paths per target
UPDATE public.graph_intro_path_candidates ipc
SET rank_in_target = ranked.rn
FROM (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY target_org_id
      ORDER BY hop_count ASC, path_score DESC NULLS LAST
    ) AS rn
  FROM public.graph_intro_path_candidates
  WHERE target_org_id IS NOT NULL
) ranked
WHERE ipc.id = ranked.id;

INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT '06_paths', 'Intro paths generated + ranked',
  COUNT(*) FROM public.graph_intro_path_candidates;

SELECT
  hop_count,
  COUNT(*) AS paths
FROM public.graph_intro_path_candidates
GROUP BY hop_count
ORDER BY hop_count;
