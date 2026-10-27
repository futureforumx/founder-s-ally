ALTER TABLE public.company_metrics
ADD COLUMN IF NOT EXISTS ltv_cac_ratio_override TEXT;
