
-- Create profiles table for founder/operator people records
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  title text,
  bio text,
  location text,
  user_type text NOT NULL DEFAULT 'founder',
  avatar_url text,
  company_id uuid REFERENCES public.company_analyses(id) ON DELETE SET NULL,
  linkedin_url text,
  twitter_url text,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read public profiles
CREATE POLICY "Anyone can read public profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Users can read own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert own profile
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
