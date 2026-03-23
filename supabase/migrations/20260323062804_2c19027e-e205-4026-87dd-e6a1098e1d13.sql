
ALTER TABLE public.investor_database ADD COLUMN is_trending boolean DEFAULT false;
ALTER TABLE public.investor_database ADD COLUMN is_popular boolean DEFAULT false;
ALTER TABLE public.investor_database ADD COLUMN is_recent boolean DEFAULT false;
