-- Allow authenticated users to edit their own vc_ratings rows.
-- Existing RLS currently allows SELECT + INSERT but not UPDATE.
-- 20260330240000 creates the table and this policy when vc_ratings is not here yet.
DO $$
BEGIN
  IF to_regclass('public.vc_ratings') IS NULL THEN
    RAISE NOTICE 'vc_ratings is not present yet; update policy is created in 20260330240000';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "vc_ratings_update_own_author" ON public.vc_ratings;

  CREATE POLICY "vc_ratings_update_own_author"
    ON public.vc_ratings FOR UPDATE TO authenticated
    USING (
      author_user_id IS NOT NULL
      AND (auth.jwt()->>'sub') = author_user_id
    )
    WITH CHECK (
      author_user_id IS NOT NULL
      AND (auth.jwt()->>'sub') = author_user_id
    );
END $$;
