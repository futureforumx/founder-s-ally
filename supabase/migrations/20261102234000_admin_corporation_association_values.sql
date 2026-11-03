ALTER TABLE public.admin_profile_associations
  ADD COLUMN IF NOT EXISTS left_label text,
  ADD COLUMN IF NOT EXISTS right_label text;

ALTER TABLE public.admin_profile_associations
  DROP CONSTRAINT IF EXISTS admin_profile_associations_left_type_check,
  DROP CONSTRAINT IF EXISTS admin_profile_associations_right_type_check;

ALTER TABLE public.admin_profile_associations
  ADD CONSTRAINT admin_profile_associations_left_type_check
    CHECK (left_type IN ('company', 'firm', 'founder', 'investor', 'operator', 'corporation')),
  ADD CONSTRAINT admin_profile_associations_right_type_check
    CHECK (right_type IN ('company', 'firm', 'founder', 'investor', 'operator', 'corporation'));

ALTER TABLE public.admin_profile_associations
  ADD CONSTRAINT admin_profile_associations_corporation_label_check CHECK (
    (left_type <> 'corporation' OR coalesce(length(btrim(left_label)), 0) > 0)
    AND (right_type <> 'corporation' OR coalesce(length(btrim(right_label)), 0) > 0)
  );
