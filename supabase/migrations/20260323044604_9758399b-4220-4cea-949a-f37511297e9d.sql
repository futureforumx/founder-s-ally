
CREATE TABLE public.investor_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  founder_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL,
  nps_score INTEGER NOT NULL CHECK (nps_score >= 0 AND nps_score <= 10),
  interaction_type TEXT NOT NULL DEFAULT 'meeting',
  did_respond BOOLEAN NOT NULL DEFAULT false,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.investor_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own reviews"
  ON public.investor_reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = founder_id);

CREATE POLICY "Users can read own reviews"
  ON public.investor_reviews FOR SELECT
  TO authenticated
  USING (auth.uid() = founder_id);

CREATE UNIQUE INDEX idx_investor_reviews_unique 
  ON public.investor_reviews (founder_id, firm_id);
