-- Admin notes for waitlist applicants
-- Lets reviewers attach short internal notes to each waitlist request.

ALTER TABLE public.waitlist_users
  ADD COLUMN IF NOT EXISTS admin_notes text;

COMMENT ON COLUMN public.waitlist_users.admin_notes IS 'Short internal note added by admins during waitlist review.';
