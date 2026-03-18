
-- Company analyses table
CREATE TABLE public.company_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  website_url TEXT,
  stage TEXT,
  sector TEXT,
  scraped_header TEXT,
  scraped_value_prop TEXT,
  scraped_pricing TEXT,
  deck_text TEXT,
  deck_file_path TEXT,
  executive_summary TEXT,
  health_score INTEGER DEFAULT 0,
  mrr TEXT,
  burn_rate TEXT,
  cac TEXT,
  ltv TEXT,
  runway TEXT,
  raw_ai_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_analyses ENABLE ROW LEVEL SECURITY;

-- Users can only access their own analyses
CREATE POLICY "Users can view own analyses" ON public.company_analyses
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses" ON public.company_analyses
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analyses" ON public.company_analyses
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own analyses" ON public.company_analyses
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Storage bucket for pitch decks (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('pitch-decks', 'pitch-decks', false);

-- Storage RLS: users can only access their own files
CREATE POLICY "Users can upload own decks" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'pitch-decks' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own decks" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'pitch-decks' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own decks" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'pitch-decks' AND (storage.foldername(name))[1] = auth.uid()::text);
