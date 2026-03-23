
ALTER TABLE public.investor_database
  ADD COLUMN IF NOT EXISTS firm_type text DEFAULT 'Institutional',
  ADD COLUMN IF NOT EXISTS is_actively_deploying boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS founder_sentiment_score integer DEFAULT null,
  ADD COLUMN IF NOT EXISTS headcount text DEFAULT null;
