-- company_members: Clerk migration left only INSERT with role = 'pending', which blocked
-- "Create workspace" and "Claim profile" (both insert role = 'manager').
-- Add a policy so users can add manager/owner rows when the company_analyses row is theirs or they claimed it.

ALTER TABLE public.company_analyses
  ALTER COLUMN claimed_by TYPE text USING claimed_by::text;

DROP POLICY IF EXISTS "Users insert manager for owned or claimed company" ON public.company_members;

CREATE POLICY "Users insert manager for owned or claimed company" ON public.company_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt()->>'sub') = user_id
    AND role IN ('owner', 'manager')
    AND EXISTS (
      SELECT 1 FROM public.company_analyses ca
      WHERE ca.id = company_id
        AND (
          ca.user_id = (auth.jwt()->>'sub')
          OR (ca.claimed_by IS NOT NULL AND ca.claimed_by = (auth.jwt()->>'sub'))
        )
    )
  );
