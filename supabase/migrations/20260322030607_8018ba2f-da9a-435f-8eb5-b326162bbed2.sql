
-- Company members table for workspace access management
CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.company_analyses(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id)
);

-- Enable RLS
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- Users can read memberships for companies they belong to
CREATE POLICY "Users can read own memberships"
  ON public.company_members FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can read all members of companies they belong to (to see owner info)
CREATE POLICY "Members can see co-members"
  ON public.company_members FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- Users can insert membership requests
CREATE POLICY "Users can request access"
  ON public.company_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'pending');

-- Only owners can update memberships (approve/reject)
CREATE POLICY "Owners can update memberships"
  ON public.company_members FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Users can delete own pending requests
CREATE POLICY "Users can cancel own pending requests"
  ON public.company_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND role = 'pending');
