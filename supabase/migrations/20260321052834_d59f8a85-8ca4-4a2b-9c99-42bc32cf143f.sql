
-- 1. Interaction tracking table
CREATE TABLE public.founder_vc_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  founder_id uuid NOT NULL,
  firm_id uuid NOT NULL REFERENCES public.investor_database(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('saved', 'skipped', 'viewed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (founder_id, firm_id, action_type)
);

ALTER TABLE public.founder_vc_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own interactions"
  ON public.founder_vc_interactions FOR SELECT TO authenticated
  USING (auth.uid() = founder_id);

CREATE POLICY "Users can insert own interactions"
  ON public.founder_vc_interactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = founder_id);

CREATE POLICY "Users can delete own interactions"
  ON public.founder_vc_interactions FOR DELETE TO authenticated
  USING (auth.uid() = founder_id);

CREATE INDEX idx_fvi_founder ON public.founder_vc_interactions(founder_id);
CREATE INDEX idx_fvi_firm ON public.founder_vc_interactions(firm_id);
CREATE INDEX idx_fvi_action ON public.founder_vc_interactions(action_type);

-- 2. Collaborative filtering RPC
CREATE OR REPLACE FUNCTION public.get_collaborative_recommendations(_current_founder_id uuid)
RETURNS TABLE (
  firm_id uuid,
  firm_name text,
  peer_save_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH current_profile AS (
    SELECT sector, stage
    FROM public.company_analyses
    WHERE user_id = _current_founder_id
    ORDER BY updated_at DESC
    LIMIT 1
  ),
  peer_founders AS (
    SELECT ca.user_id
    FROM public.company_analyses ca, current_profile cp
    WHERE ca.user_id != _current_founder_id
      AND ca.sector = cp.sector
      AND ca.stage = cp.stage
  ),
  already_interacted AS (
    SELECT fvi.firm_id
    FROM public.founder_vc_interactions fvi
    WHERE fvi.founder_id = _current_founder_id
      AND fvi.action_type IN ('saved', 'skipped')
  )
  SELECT
    fvi.firm_id,
    id_db.firm_name,
    COUNT(*) AS peer_save_count
  FROM public.founder_vc_interactions fvi
  JOIN peer_founders pf ON fvi.founder_id = pf.user_id
  JOIN public.investor_database id_db ON id_db.id = fvi.firm_id
  WHERE fvi.action_type = 'saved'
    AND fvi.firm_id NOT IN (SELECT firm_id FROM already_interacted)
  GROUP BY fvi.firm_id, id_db.firm_name
  ORDER BY peer_save_count DESC
  LIMIT 5;
$$;

-- 3. Save-rate decay function
CREATE OR REPLACE FUNCTION public.get_sector_save_rates(_sector text)
RETURNS TABLE (
  firm_id uuid,
  total_recommendations bigint,
  save_count bigint,
  save_rate numeric,
  decay_multiplier numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH sector_firms AS (
    SELECT id AS firm_id
    FROM public.investor_database
    WHERE _sector = ANY(thesis_verticals)
  ),
  rec_counts AS (
    SELECT
      fvi.firm_id,
      COUNT(*) AS total_recommendations,
      COUNT(*) FILTER (WHERE fvi.action_type = 'saved') AS save_count
    FROM public.founder_vc_interactions fvi
    JOIN sector_firms sf ON sf.firm_id = fvi.firm_id
    WHERE fvi.action_type IN ('saved', 'skipped', 'viewed')
    GROUP BY fvi.firm_id
  )
  SELECT
    rc.firm_id,
    rc.total_recommendations,
    rc.save_count,
    ROUND(rc.save_count::numeric / NULLIF(rc.total_recommendations, 0) * 100, 2) AS save_rate,
    CASE
      WHEN rc.total_recommendations > 50
        AND (rc.save_count::numeric / NULLIF(rc.total_recommendations, 0) * 100) < 5
      THEN 0.85
      ELSE 1.0
    END AS decay_multiplier
  FROM rec_counts rc;
$$;
