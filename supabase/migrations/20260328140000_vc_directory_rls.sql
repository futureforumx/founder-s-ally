-- VC directory tables (Prisma / vc_*): RLS for Clerk-authenticated app users.
-- Read-only for signed-in users; soft-deleted rows hidden. Service role bypasses RLS.
-- Some of these relations are created later in this history, or only exist when the
-- Prisma directory is present. Skip a relation that is not here yet.

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY[
    'vc_firms',
    'vc_funds',
    'vc_people',
    'vc_investments',
    'vc_source_links',
    'vc_signals',
    'vc_score_snapshots'
  ]
  LOOP
    IF to_regclass('public.' || rel) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rel);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'Authenticated read active ' || rel,
      rel
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (deleted_at IS NULL)',
      'Authenticated read active ' || rel,
      rel
    );
  END LOOP;
END $$;
