-- Founder/operator roster entries for each founder workspace company.
CREATE TABLE public.company_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company_analyses(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  member_type text GENERATED ALWAYS AS (
    CASE WHEN title ~* '\mfounder\M' THEN 'founder' ELSE 'operator' END
  ) STORED,
  ready_for_live boolean NOT NULL DEFAULT false,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX company_team_members_company_person_title_uidx
  ON public.company_team_members (company_id, lower(btrim(full_name)), lower(btrim(title)));
CREATE INDEX company_team_members_company_idx
  ON public.company_team_members (company_id, created_at);

ALTER TABLE public.company_team_members ENABLE ROW LEVEL SECURITY;

-- This public-schema table is company-scoped and only exposed to signed-in members.
REVOKE ALL ON TABLE public.company_team_members FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.company_team_members TO authenticated;

CREATE POLICY "Company members can read company team roster"
  ON public.company_team_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_analyses ca
      WHERE ca.id = company_team_members.company_id
        AND (ca.user_id = (auth.jwt() ->> 'sub') OR ca.claimed_by = (auth.jwt() ->> 'sub'))
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = company_team_members.company_id
        AND cm.user_id = (auth.jwt() ->> 'sub')
    )
  );

CREATE POLICY "Company managers can add company team members"
  ON public.company_team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (auth.jwt() ->> 'sub')
    AND (
      EXISTS (
        SELECT 1
        FROM public.company_analyses ca
        WHERE ca.id = company_team_members.company_id
          AND (ca.user_id = (auth.jwt() ->> 'sub') OR ca.claimed_by = (auth.jwt() ->> 'sub'))
      )
      OR EXISTS (
        SELECT 1
        FROM public.company_members cm
        WHERE cm.company_id = company_team_members.company_id
          AND cm.user_id = (auth.jwt() ->> 'sub')
          AND cm.role IN ('owner', 'manager', 'admin')
      )
    )
  );
