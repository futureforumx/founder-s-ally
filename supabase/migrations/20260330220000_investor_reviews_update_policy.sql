-- Allow founders to update their own investor_reviews (needed for PostgREST upsert ON CONFLICT DO UPDATE).
DROP POLICY IF EXISTS "Users can update own reviews" ON public.investor_reviews;

CREATE POLICY "Users can update own reviews"
  ON public.investor_reviews FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'sub') = founder_id)
  WITH CHECK ((auth.jwt()->>'sub') = founder_id);
