-- RLS for vc_ratings (table from Prisma: `prisma migrate deploy` must run before this on fresh DBs).
-- Supabase-only databases create the table in 20260330240000, which also installs these policies.
DO $$
BEGIN
  IF to_regclass('public.vc_ratings') IS NULL THEN
    RAISE NOTICE 'vc_ratings is not present yet; skipping RLS until 20260330240000';
    RETURN;
  END IF;

  ALTER TABLE public.vc_ratings ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "vc_ratings_select_anon" ON public.vc_ratings;
  DROP POLICY IF EXISTS "vc_ratings_select_authenticated" ON public.vc_ratings;
  DROP POLICY IF EXISTS "vc_ratings_insert_own_author" ON public.vc_ratings;

  CREATE POLICY "vc_ratings_select_anon"
    ON public.vc_ratings FOR SELECT TO anon
    USING (true);

  CREATE POLICY "vc_ratings_select_authenticated"
    ON public.vc_ratings FOR SELECT TO authenticated
    USING (true);

  CREATE POLICY "vc_ratings_insert_own_author"
    ON public.vc_ratings FOR INSERT TO authenticated
    WITH CHECK (
      author_user_id IS NOT NULL
      AND (auth.jwt()->>'sub') = author_user_id
    );
END $$;
