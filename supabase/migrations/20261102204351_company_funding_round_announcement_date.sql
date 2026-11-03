ALTER TABLE public.company_funding_rounds
  ADD COLUMN IF NOT EXISTS announcement_date date;
