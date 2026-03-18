
DROP POLICY "Anyone can read investors" ON public.investor_database;
CREATE POLICY "Anyone can read investors" ON public.investor_database
  FOR SELECT TO anon, authenticated USING (true);
