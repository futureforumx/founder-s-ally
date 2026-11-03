CREATE TABLE IF NOT EXISTS public.admin_profile_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  left_type text NOT NULL CHECK (left_type IN ('company', 'firm', 'founder', 'investor', 'operator')),
  left_id text NOT NULL CHECK (length(btrim(left_id)) > 0),
  right_type text NOT NULL CHECK (right_type IN ('company', 'firm', 'founder', 'investor', 'operator')),
  right_id text NOT NULL CHECK (length(btrim(right_id)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_profile_associations_ordered_pair CHECK (
    left_type < right_type OR (left_type = right_type AND left_id < right_id)
  ),
  CONSTRAINT admin_profile_associations_contains_profile CHECK (
    left_type IN ('founder', 'operator') OR right_type IN ('founder', 'operator')
  ),
  CONSTRAINT admin_profile_associations_no_self_link CHECK (
    left_type <> right_type OR left_id <> right_id
  ),
  CONSTRAINT admin_profile_associations_unique_pair UNIQUE (left_type, left_id, right_type, right_id)
);

CREATE INDEX IF NOT EXISTS admin_profile_associations_left_idx
  ON public.admin_profile_associations (left_type, left_id);
CREATE INDEX IF NOT EXISTS admin_profile_associations_right_idx
  ON public.admin_profile_associations (right_type, right_id);

ALTER TABLE public.admin_profile_associations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_profile_associations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_profile_associations TO service_role;
