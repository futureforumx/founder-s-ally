ALTER TABLE public.deck_shares
  ADD COLUMN IF NOT EXISTS company_stage_snapshot text;
