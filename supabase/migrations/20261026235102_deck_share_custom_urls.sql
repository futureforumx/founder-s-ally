ALTER TABLE public.deck_shares
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS company_slug text,
  ADD COLUMN IF NOT EXISTS presentation_slug text,
  ADD COLUMN IF NOT EXISTS contact_email text;

DO $$ BEGIN
  ALTER TABLE public.deck_shares
    ADD CONSTRAINT deck_shares_presentation_slug_format
    CHECK (presentation_slug IS NULL OR presentation_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_shares_public_path
  ON public.deck_shares(company_slug, presentation_slug)
  WHERE company_slug IS NOT NULL AND presentation_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deck_shares_workspace
  ON public.deck_shares(workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;
