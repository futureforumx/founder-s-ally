-- Repair DBs where `claimed_by` stayed uuid after Clerk migration (user_id is text).
-- Clerk `sub` values like user_2abc… are not valid UUIDs → workspace create/claim fails.
-- Idempotent: no-op when column is already text (e.g. after 20260328180000).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_analyses'
      AND column_name = 'claimed_by'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.company_analyses
      ALTER COLUMN claimed_by TYPE text USING claimed_by::text;
  END IF;
END $$;
