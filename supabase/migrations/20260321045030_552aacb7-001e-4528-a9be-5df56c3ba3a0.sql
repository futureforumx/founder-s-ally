
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add sector_embedding column to investor_database
ALTER TABLE public.investor_database
ADD COLUMN IF NOT EXISTS sector_embedding vector(1536);

-- Create index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_investor_sector_embedding
ON public.investor_database
USING ivfflat (sector_embedding vector_cosine_ops)
WITH (lists = 50);

-- Create the match_investors RPC function
CREATE OR REPLACE FUNCTION public.match_investors(
  founder_sector_embedding vector(1536),
  founder_stage text DEFAULT NULL,
  founder_ask integer DEFAULT NULL,
  founder_geo text DEFAULT NULL,
  similarity_threshold float DEFAULT 0.75,
  match_limit integer DEFAULT 25
)
RETURNS TABLE(
  id uuid,
  firm_name text,
  lead_partner text,
  thesis_verticals text[],
  preferred_stage text,
  min_check_size integer,
  max_check_size integer,
  recent_deals text[],
  location text,
  lead_or_follow text,
  market_sentiment text,
  sentiment_detail text,
  ca_sb54_compliant boolean,
  similarity_score float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    i.id,
    i.firm_name,
    i.lead_partner,
    i.thesis_verticals,
    i.preferred_stage,
    i.min_check_size,
    i.max_check_size,
    i.recent_deals,
    i.location,
    i.lead_or_follow,
    i.market_sentiment,
    i.sentiment_detail,
    i.ca_sb54_compliant,
    (1 - (i.sector_embedding <=> founder_sector_embedding))::float AS similarity_score
  FROM public.investor_database i
  WHERE
    i.sector_embedding IS NOT NULL
    -- Hard filter: Stage
    AND (founder_stage IS NULL OR i.preferred_stage IS NULL OR i.preferred_stage = founder_stage)
    -- Hard filter: Check size range covers the founder ask
    AND (founder_ask IS NULL OR (i.min_check_size <= founder_ask AND i.max_check_size >= founder_ask))
    -- Hard filter: Geography (loose substring match)
    AND (founder_geo IS NULL OR i.location IS NULL OR i.location ILIKE '%' || founder_geo || '%')
    -- Semantic filter: Cosine similarity threshold
    AND (1 - (i.sector_embedding <=> founder_sector_embedding)) > similarity_threshold
  ORDER BY similarity_score DESC
  LIMIT match_limit;
$$;
