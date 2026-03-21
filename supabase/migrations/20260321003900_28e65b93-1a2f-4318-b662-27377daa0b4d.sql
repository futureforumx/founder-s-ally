
CREATE OR REPLACE FUNCTION public.find_connections_by_investor(_investor_name text)
RETURNS TABLE(
  user_id uuid,
  company_name text,
  sector text,
  stage text,
  investor_amount integer,
  instrument text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    ct.user_id,
    COALESCE(ca.company_name, '') AS company_name,
    ca.sector,
    ca.stage,
    ct.amount AS investor_amount,
    ct.instrument
  FROM public.cap_table ct
  LEFT JOIN public.company_analyses ca ON ca.user_id = ct.user_id
  WHERE LOWER(TRIM(ct.investor_name)) = LOWER(TRIM(_investor_name))
  ORDER BY ct.created_at DESC
$$;
