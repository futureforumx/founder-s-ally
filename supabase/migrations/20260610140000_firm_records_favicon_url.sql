ALTER TABLE public.firm_records
  ADD COLUMN IF NOT EXISTS favicon_url text;

COMMENT ON COLUMN public.firm_records.favicon_url IS
  'Optional explicit favicon or small brand mark URL used by admin and public firm displays.';
