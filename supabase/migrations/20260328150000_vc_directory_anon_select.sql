-- Allow public (anon key) read of active VC directory rows so the app works without
-- passing a Clerk JWT that Supabase can verify. Publishable key is already public in the browser.
-- RLS must be enabled (no-op if already on from a prior migration).
-- Relations created later in this history, or absent outside the Prisma directory, are skipped.

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
      'Anon read active ' || rel,
      rel
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon USING (deleted_at IS NULL)',
      'Anon read active ' || rel,
      rel
    );
  END LOOP;
END $$;
