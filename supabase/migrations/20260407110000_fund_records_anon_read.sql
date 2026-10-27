-- Allow anonymous (unauthenticated) reads on fund_records so the investor
-- detail panel can display fund data without requiring a Clerk session.

DROP POLICY IF EXISTS "fund_records_select_anon" ON public.fund_records;
CREATE POLICY "fund_records_select_anon"
  ON public.fund_records FOR SELECT
  TO anon USING (deleted_at IS NULL);
