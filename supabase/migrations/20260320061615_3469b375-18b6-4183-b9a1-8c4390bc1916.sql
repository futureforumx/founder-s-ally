
-- Global competitors registry
CREATE TABLE public.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  website TEXT,
  description TEXT,
  industry_tags TEXT[] NOT NULL DEFAULT '{}',
  logo_url TEXT,
  funding TEXT,
  stage TEXT,
  employee_count TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint on normalized name
CREATE UNIQUE INDEX competitors_name_lower_idx ON public.competitors (lower(trim(name)));

-- Junction table: user's company <-> tracked competitors
CREATE TABLE public.company_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  competitor_id UUID REFERENCES public.competitors(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Tracked' CHECK (status IN ('Tracked', 'Threat', 'Watch')),
  user_defined_advantage TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, competitor_id)
);

-- RLS on competitors (global read, authenticated insert)
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read competitors"
  ON public.competitors FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert competitors"
  ON public.competitors FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update competitors"
  ON public.competitors FOR UPDATE
  TO authenticated
  USING (true);

-- RLS on company_competitors (user-scoped)
ALTER TABLE public.company_competitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tracked competitors"
  ON public.company_competitors FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tracked competitors"
  ON public.company_competitors FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tracked competitors"
  ON public.company_competitors FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tracked competitors"
  ON public.company_competitors FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Recommendation function: find competitors tracked by similar companies
CREATE OR REPLACE FUNCTION public.recommend_competitors(
  _user_id UUID,
  _industry_tags TEXT[],
  _limit INT DEFAULT 5
)
RETURNS TABLE (
  competitor_id UUID,
  competitor_name TEXT,
  website TEXT,
  description TEXT,
  industry_tags TEXT[],
  tracking_count BIGINT,
  tag_overlap INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS competitor_id,
    c.name AS competitor_name,
    c.website,
    c.description,
    c.industry_tags,
    COUNT(DISTINCT cc.user_id) AS tracking_count,
    (SELECT COUNT(*)::INT FROM unnest(c.industry_tags) t WHERE t = ANY(_industry_tags)) AS tag_overlap
  FROM public.competitors c
  JOIN public.company_competitors cc ON cc.competitor_id = c.id
  WHERE c.id NOT IN (
    SELECT competitor_id FROM public.company_competitors WHERE user_id = _user_id
  )
  AND c.industry_tags && _industry_tags
  GROUP BY c.id
  ORDER BY tag_overlap DESC, tracking_count DESC
  LIMIT _limit
$$;
