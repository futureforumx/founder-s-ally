-- ============================================================
-- STEP 5 of 7: CO-INVESTOR EDGES
-- Firms sharing portfolio companies → bidirectional co-investor edges.
-- Strength scales with number of shared companies.
-- Takes ~60 seconds (heavy join — most expensive step).
-- ============================================================

SET statement_timeout = '300s';

-- Build pairs (canonical order: firm_a < firm_b)
WITH co_pairs AS (
  SELECT
    a.from_org_id                          AS firm_a,
    b.from_org_id                          AS firm_b,
    COUNT(*)::integer                      AS shared_cos,
    LEAST(0.92, 0.30 + COUNT(*) * 0.12)   AS strength,
    LEAST(0.88, 0.28 + COUNT(*) * 0.10)   AS trust,
    COUNT(*) >= 2                          AS warm
  FROM public.graph_org_relationship_edges a
  JOIN public.graph_org_relationship_edges b
    ON  b.to_org_id         = a.to_org_id
    AND b.from_org_id      != a.from_org_id
    AND b.relationship_type = 'investor_portfolio'
  WHERE a.relationship_type = 'investor_portfolio'
    AND a.from_org_id < b.from_org_id
  GROUP BY a.from_org_id, b.from_org_id
),
-- Insert A→B
ins_ab AS (
  INSERT INTO public.graph_org_relationship_edges
    (from_org_id, to_org_id, relationship_type, strength_score, trust_score, is_warm, shared_count, evidence)
  SELECT
    firm_a, firm_b, 'co_investor',
    strength, trust, warm, shared_cos,
    jsonb_build_object('shared_portfolio_companies', shared_cos)
  FROM co_pairs
  ON CONFLICT (from_org_id, to_org_id, relationship_type)
  DO UPDATE SET
    shared_count   = EXCLUDED.shared_count,
    strength_score = EXCLUDED.strength_score,
    is_warm        = EXCLUDED.is_warm
  RETURNING 1
),
-- Insert B→A (mirror)
ins_ba AS (
  INSERT INTO public.graph_org_relationship_edges
    (from_org_id, to_org_id, relationship_type, strength_score, trust_score, is_warm, shared_count, evidence)
  SELECT
    firm_b, firm_a, 'co_investor',
    strength, trust, warm, shared_cos,
    jsonb_build_object('shared_portfolio_companies', shared_cos)
  FROM co_pairs
  ON CONFLICT (from_org_id, to_org_id, relationship_type)
  DO UPDATE SET
    shared_count   = EXCLUDED.shared_count,
    strength_score = EXCLUDED.strength_score,
    is_warm        = EXCLUDED.is_warm
  RETURNING 1
)
SELECT
  (SELECT COUNT(*) FROM ins_ab) AS ab_inserted,
  (SELECT COUNT(*) FROM ins_ba) AS ba_inserted;

INSERT INTO public.graph_bootstrap_log(phase, message, row_count)
SELECT '05_coinvestor', 'Co-investor edges created (both directions)',
  COUNT(*) FROM public.graph_org_relationship_edges WHERE relationship_type = 'co_investor';

SELECT
  COUNT(*)                                                                    AS total_co_investor_edges,
  COUNT(*) FILTER (WHERE is_warm)                                             AS warm_edges,
  ROUND(AVG(shared_count),1)                                                  AS avg_shared_companies,
  MAX(shared_count)                                                            AS max_shared_companies
FROM public.graph_org_relationship_edges
WHERE relationship_type = 'co_investor';
