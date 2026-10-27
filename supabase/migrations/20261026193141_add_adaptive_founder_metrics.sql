ALTER TABLE public.company_metrics
  ADD COLUMN extra_metrics JSONB NOT NULL DEFAULT '{}'::jsonb;
