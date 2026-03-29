-- Allow authenticated users to edit their own vc_ratings rows.
-- Existing RLS currently allows SELECT + INSERT but not UPDATE.

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
