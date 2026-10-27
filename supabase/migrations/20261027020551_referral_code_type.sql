-- Referral codes are classified by type. Member codes are created when someone
-- signs up. Organization codes are added from the admin console.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'referral_codes'
      AND column_name = 'source'
  ) THEN
    ALTER TABLE public.referral_codes DROP CONSTRAINT IF EXISTS referral_codes_source_check;
    ALTER TABLE public.referral_codes RENAME COLUMN source TO type;
  END IF;
END $$;

UPDATE public.referral_codes
SET type = 'organization'
WHERE type = 'admin';

ALTER TABLE public.referral_codes
  ALTER COLUMN type SET DEFAULT 'organization';

ALTER TABLE public.referral_codes DROP CONSTRAINT IF EXISTS referral_codes_source_check;
ALTER TABLE public.referral_codes DROP CONSTRAINT IF EXISTS referral_codes_type_check;

ALTER TABLE public.referral_codes
  ADD CONSTRAINT referral_codes_type_check
  CHECK (type IN ('member', 'organization'));

CREATE OR REPLACE FUNCTION public.register_waitlist_member_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.referral_codes (code, type, waitlist_user_id, created_at)
  VALUES (upper(trim(NEW.referral_code)), 'member', NEW.id, COALESCE(NEW.created_at, now()))
  ON CONFLICT (code) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.register_waitlist_member_referral_code()
  FROM PUBLIC, anon, authenticated;
