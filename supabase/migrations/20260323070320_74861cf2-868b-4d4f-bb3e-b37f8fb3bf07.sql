
-- Add sentiment columns to investor_database
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS news_sentiment_score numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS social_sentiment_score numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS community_rating numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reputation_score numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reputation_updated_at timestamptz DEFAULT NULL;

-- Create reputation_logs table
CREATE TABLE public.reputation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid REFERENCES public.investor_database(id) ON DELETE CASCADE NOT NULL,
  reputation_score numeric NOT NULL,
  news_sentiment_score numeric,
  social_sentiment_score numeric,
  community_rating numeric,
  weight_community numeric NOT NULL DEFAULT 0.4,
  weight_social numeric NOT NULL DEFAULT 0.3,
  weight_news numeric NOT NULL DEFAULT 0.3,
  source_details jsonb DEFAULT '{}',
  calculated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reputation_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read reputation logs
CREATE POLICY "Authenticated users can read reputation logs"
  ON public.reputation_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role to insert (edge functions)
CREATE POLICY "Service role can insert reputation logs"
  ON public.reputation_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_reputation_logs_firm_id ON public.reputation_logs(firm_id);
CREATE INDEX idx_reputation_logs_calculated_at ON public.reputation_logs(calculated_at DESC);

-- Enable realtime for reputation_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.reputation_logs;
