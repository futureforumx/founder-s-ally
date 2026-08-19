-- Company Metrics: Data Room > Metrics tab (Team, Market, Traction, Unit Economics, Financial Health).
-- Keyed by Clerk user id (auth.jwt()->>'sub'), one row per founder — mirrors company_pitch_decks pattern
-- (per-user, not per-company-workspace, so it works before any company workspace is linked).

CREATE TABLE public.company_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,

  -- Team
  headcount TEXT,
  background TEXT,

  -- Market
  tam TEXT,
  sam TEXT,
  som TEXT,

  -- Traction
  nrr TEXT,
  active_users TEXT,
  active_users_mode TEXT NOT NULL DEFAULT 'mau' CHECK (active_users_mode IN ('mau', 'dau')),
  churn_rate TEXT,
  burn_multiple TEXT,

  -- Unit Economics
  cac TEXT,
  ltv TEXT,
  cac_payback_days TEXT,

  -- Financial Health
  monthly_burn_rate TEXT,
  runway TEXT,
  runway_unit TEXT NOT NULL DEFAULT 'months' CHECK (runway_unit IN ('days', 'months')),
  gross_margin TEXT,
  cash_on_hand TEXT,
  total_debt TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.company_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metrics" ON public.company_metrics
  FOR SELECT TO authenticated USING ((auth.jwt() ->> 'sub') = user_id);
CREATE POLICY "Users can insert own metrics" ON public.company_metrics
  FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'sub') = user_id);
CREATE POLICY "Users can update own metrics" ON public.company_metrics
  FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'sub') = user_id);
CREATE POLICY "Users can delete own metrics" ON public.company_metrics
  FOR DELETE TO authenticated USING ((auth.jwt() ->> 'sub') = user_id);

CREATE OR REPLACE FUNCTION public.set_company_metrics_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_company_metrics_updated_at
BEFORE UPDATE ON public.company_metrics
FOR EACH ROW
EXECUTE FUNCTION public.set_company_metrics_updated_at();
