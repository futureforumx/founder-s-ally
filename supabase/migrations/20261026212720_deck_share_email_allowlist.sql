ALTER TABLE public.deck_shares
  ADD COLUMN IF NOT EXISTS allowed_emails text[] NOT NULL DEFAULT '{}'::text[];
