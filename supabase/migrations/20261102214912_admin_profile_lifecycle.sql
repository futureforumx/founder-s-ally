ALTER TABLE public.startup_founders
  ADD COLUMN IF NOT EXISTS record_status text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.operator_profiles
  ADD COLUMN IF NOT EXISTS record_status text NOT NULL DEFAULT 'live';

CREATE INDEX IF NOT EXISTS startup_founders_active_created_idx
  ON public.startup_founders (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS operator_profiles_active_record_status_idx
  ON public.operator_profiles (record_status)
  WHERE deleted_at IS NULL;
