
CREATE TABLE public.cap_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  investor_name text NOT NULL DEFAULT '',
  entity_type text NOT NULL DEFAULT 'Angel',
  instrument text NOT NULL DEFAULT 'SAFE (Post-money)',
  amount integer NOT NULL DEFAULT 0,
  date text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cap_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cap table" ON public.cap_table FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cap table" ON public.cap_table FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cap table" ON public.cap_table FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own cap table" ON public.cap_table FOR DELETE TO authenticated USING (auth.uid() = user_id);
