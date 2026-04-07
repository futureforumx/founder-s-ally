-- Add deployed_pct column to fund_records for displaying capital deployment progress
ALTER TABLE public.fund_records ADD COLUMN IF NOT EXISTS deployed_pct numeric(5,2);
