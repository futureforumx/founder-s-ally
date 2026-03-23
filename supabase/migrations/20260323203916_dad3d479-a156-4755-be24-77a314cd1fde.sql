
-- Add claimed_by to track which user claimed an unclaimed company profile
ALTER TABLE public.company_analyses ADD COLUMN IF NOT EXISTS claimed_by uuid DEFAULT NULL;

-- Add manager role support: update company_members role options
-- We already have 'pending', 'owner' — add 'manager' as a valid role concept
-- No enum constraint exists so this is just documentation

-- Add a column to track if a company was scraped (no founder yet) vs user-created
ALTER TABLE public.company_analyses ADD COLUMN IF NOT EXISTS is_claimed boolean DEFAULT true;
