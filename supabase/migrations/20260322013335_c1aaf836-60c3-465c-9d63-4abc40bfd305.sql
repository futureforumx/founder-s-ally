
-- Fix: Drop the security definer view and recreate with SECURITY INVOKER
DROP VIEW IF EXISTS public.investor_directory_safe;

CREATE VIEW public.investor_directory_safe
WITH (security_invoker = true)
AS
SELECT
  id, firm_name, lead_partner, thesis_verticals, preferred_stage,
  min_check_size, max_check_size, recent_deals, location,
  lead_or_follow, market_sentiment, sentiment_detail, aum,
  website_url, logo_url, ca_sb54_compliant, created_at,
  last_enriched_at, sector_embedding,
  NULL::text AS email,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_credits uc
      WHERE uc.user_id = auth.uid() AND uc.tier = 'admin'
    )
    THEN email_source
    ELSE NULL
  END AS email_source
FROM public.investor_database;
