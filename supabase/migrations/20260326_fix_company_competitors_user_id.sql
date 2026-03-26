-- Drop the foreign key constraint that references auth.users
ALTER TABLE public.company_competitors 
DROP CONSTRAINT IF EXISTS company_competitors_user_id_fkey;

-- Change user_id column from UUID to TEXT to support Clerk user IDs (which are strings)
ALTER TABLE public.company_competitors 
ALTER COLUMN user_id SET DATA TYPE TEXT USING user_id::text;

-- Remove the old unique constraint and add a new one with text user_id
ALTER TABLE public.company_competitors 
DROP CONSTRAINT IF EXISTS company_competitors_user_id_competitor_id_key;

ALTER TABLE public.company_competitors 
ADD CONSTRAINT company_competitors_user_id_competitor_id_key UNIQUE (user_id, competitor_id);

-- Drop existing RLS policies on company_competitors
DROP POLICY IF EXISTS "Users can view own tracked competitors" ON public.company_competitors;
DROP POLICY IF EXISTS "Users can insert own tracked competitors" ON public.company_competitors;
DROP POLICY IF EXISTS "Users can update own tracked competitors" ON public.company_competitors;
DROP POLICY IF EXISTS "Users can delete own tracked competitors" ON public.company_competitors;

-- Create new RLS policies that work with Clerk JWT
-- The 'sub' claim in Clerk JWT contains the user ID (already a string)
CREATE POLICY "Users can view own tracked competitors"
  ON public.company_competitors FOR SELECT
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own tracked competitors"
  ON public.company_competitors FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own tracked competitors"
  ON public.company_competitors FOR UPDATE
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users can delete own tracked competitors"
  ON public.company_competitors FOR DELETE
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));
