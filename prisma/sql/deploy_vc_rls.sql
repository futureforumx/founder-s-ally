-- Deploy VC directory RLS to the database behind DATABASE_URL (run: prisma db execute --file prisma/sql/deploy_vc_rls.sql)

ALTER TABLE public.vc_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_firm_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_source_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_score_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read active vc_firms" ON public.vc_firms;
DROP POLICY IF EXISTS "Authenticated read active vc_funds" ON public.vc_funds;
DROP POLICY IF EXISTS "Authenticated read active vc_people" ON public.vc_people;
DROP POLICY IF EXISTS "Authenticated read active vc_investments" ON public.vc_investments;
DROP POLICY IF EXISTS "Authenticated read active vc_source_links" ON public.vc_source_links;
DROP POLICY IF EXISTS "Authenticated read active vc_signals" ON public.vc_signals;
DROP POLICY IF EXISTS "Authenticated read active vc_score_snapshots" ON public.vc_score_snapshots;

DROP POLICY IF EXISTS "Anon read active vc_firms" ON public.vc_firms;
DROP POLICY IF EXISTS "Anon read active vc_firm_aliases" ON public.vc_firm_aliases;
DROP POLICY IF EXISTS "Anon read active vc_funds" ON public.vc_funds;
DROP POLICY IF EXISTS "Anon read active vc_people" ON public.vc_people;
DROP POLICY IF EXISTS "Anon read active vc_investments" ON public.vc_investments;
DROP POLICY IF EXISTS "Anon read active vc_source_links" ON public.vc_source_links;
DROP POLICY IF EXISTS "Anon read active vc_signals" ON public.vc_signals;
DROP POLICY IF EXISTS "Anon read active vc_score_snapshots" ON public.vc_score_snapshots;

CREATE POLICY "Authenticated read active vc_firms"
  ON public.vc_firms FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE POLICY "Authenticated read active vc_firm_aliases"
  ON public.vc_firm_aliases FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vc_firms f
      WHERE f.id = vc_firm_aliases.firm_id AND f.deleted_at IS NULL
    )
  );

CREATE POLICY "Authenticated read active vc_funds"
  ON public.vc_funds FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE POLICY "Authenticated read active vc_people"
  ON public.vc_people FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE POLICY "Authenticated read active vc_investments"
  ON public.vc_investments FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE POLICY "Authenticated read active vc_source_links"
  ON public.vc_source_links FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE POLICY "Authenticated read active vc_signals"
  ON public.vc_signals FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE POLICY "Authenticated read active vc_score_snapshots"
  ON public.vc_score_snapshots FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_firms"
  ON public.vc_firms FOR SELECT TO anon USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_firm_aliases"
  ON public.vc_firm_aliases FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.vc_firms f
      WHERE f.id = vc_firm_aliases.firm_id AND f.deleted_at IS NULL
    )
  );

CREATE POLICY "Anon read active vc_funds"
  ON public.vc_funds FOR SELECT TO anon USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_people"
  ON public.vc_people FOR SELECT TO anon USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_investments"
  ON public.vc_investments FOR SELECT TO anon USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_source_links"
  ON public.vc_source_links FOR SELECT TO anon USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_signals"
  ON public.vc_signals FOR SELECT TO anon USING (deleted_at IS NULL);

CREATE POLICY "Anon read active vc_score_snapshots"
  ON public.vc_score_snapshots FOR SELECT TO anon USING (deleted_at IS NULL);
