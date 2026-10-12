-- Candidate selection for the Data Room "Best Matches" panel.
--
-- Scoring and the human-readable reasons live in src/lib/investorFit.ts; this
-- function only narrows ~9k live firms down to the few hundred worth scoring.
-- Without it the client would pull every row (~2 MB) on each panel render.
--
-- SECURITY INVOKER (the default) so firm_records RLS still applies to the caller.

CREATE OR REPLACE FUNCTION public.match_investors_for_company(
  p_stages TEXT[] DEFAULT NULL,
  p_vertical_patterns TEXT[] DEFAULT NULL,
  p_limit INT DEFAULT 300
)
RETURNS TABLE (
  id UUID,
  firm_name TEXT,
  logo_url TEXT,
  website_url TEXT,
  thesis_verticals TEXT[],
  stage_focus TEXT[],
  geo_focus TEXT[]
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    f.id,
    f.firm_name,
    f.logo_url,
    f.website_url,
    f.thesis_verticals,
    ARRAY(SELECT s::TEXT FROM unnest(f.stage_focus) s) AS stage_focus,
    COALESCE(f.geo_focus, '{}') AS geo_focus
  FROM public.firm_records f
  WHERE f.ready_for_live
    AND f.deleted_at IS NULL
    AND f.thesis_verticals <> '{}'
    AND (
      p_stages IS NULL
      OR f.stage_focus && ARRAY(SELECT s::public.stage_focus_enum FROM unnest(p_stages) s)
    )
    AND (
      p_vertical_patterns IS NULL
      OR EXISTS (
        SELECT 1 FROM unnest(f.thesis_verticals) v
        WHERE v ILIKE ANY (p_vertical_patterns)
      )
    )
  -- Most thesis tags matched first, so the limit trims the weakest candidates
  -- rather than an arbitrary slice.
  ORDER BY (
    SELECT count(*) FROM unnest(f.thesis_verticals) v
    WHERE p_vertical_patterns IS NULL OR v ILIKE ANY (p_vertical_patterns)
  ) DESC, f.firm_name
  LIMIT LEAST(COALESCE(p_limit, 300), 1000);
$$;

COMMENT ON FUNCTION public.match_investors_for_company IS
  'Narrows live firm_records to investor candidates matching a company''s stage and thesis tags. Ranking happens client-side in src/lib/investorFit.ts.';

GRANT EXECUTE ON FUNCTION public.match_investors_for_company TO authenticated;
