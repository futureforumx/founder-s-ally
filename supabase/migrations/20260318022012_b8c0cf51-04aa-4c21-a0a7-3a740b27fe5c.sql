
CREATE TABLE public.pending_investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_analysis_id uuid REFERENCES public.company_analyses(id) ON DELETE CASCADE,
  investor_name text NOT NULL,
  entity_type text NOT NULL DEFAULT 'VC Firm',
  instrument text NOT NULL DEFAULT 'Equity',
  amount integer NOT NULL DEFAULT 0,
  round_name text,
  source_type text NOT NULL DEFAULT 'SEC Filing',
  source_detail text,
  source_date text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_investors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pending investors" ON public.pending_investors FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pending investors" ON public.pending_investors FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pending investors" ON public.pending_investors FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own pending investors" ON public.pending_investors FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
