-- Draft / partial investor reviews: autosave before final submit.
-- Skipped when 20260330240000 will create vc_ratings with these columns already present.
DO $$
BEGIN
  IF to_regclass('public.vc_ratings') IS NULL THEN
    RAISE NOTICE 'vc_ratings is not present yet; draft columns are created in 20260330240000';
    RETURN;
  END IF;

  ALTER TABLE public.vc_ratings
    ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

  ALTER TABLE public.vc_ratings
    ADD COLUMN IF NOT EXISTS star_ratings jsonb NOT NULL DEFAULT '{}'::jsonb;

  ALTER TABLE public.vc_ratings
    ALTER COLUMN nps DROP NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS vc_ratings_one_draft_per_author_firm_person
    ON public.vc_ratings (author_user_id, vc_firm_id, COALESCE(vc_person_id, ''::text))
    WHERE is_draft = true;

  DROP POLICY IF EXISTS "vc_ratings_update_own_draft" ON public.vc_ratings;

  CREATE POLICY "vc_ratings_update_own_draft"
    ON public.vc_ratings FOR UPDATE TO authenticated
    USING (
      author_user_id IS NOT NULL
      AND (auth.jwt()->>'sub') = author_user_id
      AND is_draft = true
    )
    WITH CHECK (
      author_user_id IS NOT NULL
      AND (auth.jwt()->>'sub') = author_user_id
    );
END $$;
