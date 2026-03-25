
CREATE TABLE public.company_approval_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company_analyses(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '30 days')
);

ALTER TABLE public.company_approval_codes ENABLE ROW LEVEL SECURITY;

-- Company owners/managers can see their codes
CREATE POLICY "Company members can view their codes"
  ON public.company_approval_codes
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = company_approval_codes.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin', 'manager')
    )
  );

-- Company owners can create codes
CREATE POLICY "Company members can create codes"
  ON public.company_approval_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Company owners can deactivate codes
CREATE POLICY "Code creators can update their codes"
  ON public.company_approval_codes
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());
