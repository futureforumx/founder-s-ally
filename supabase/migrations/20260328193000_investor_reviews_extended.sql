-- Investor reviews: star dimensions, anonymous flag, optional person scoping, text firm_id (Prisma cuids)

DROP INDEX IF EXISTS public.idx_investor_reviews_unique;

ALTER TABLE public.investor_reviews
  ALTER COLUMN firm_id TYPE text USING firm_id::text;

ALTER TABLE public.investor_reviews
  ALTER COLUMN did_respond DROP NOT NULL;

ALTER TABLE public.investor_reviews
  ADD COLUMN IF NOT EXISTS person_id text NOT NULL DEFAULT '';

ALTER TABLE public.investor_reviews
  ADD COLUMN IF NOT EXISTS star_ratings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.investor_reviews
  ADD COLUMN IF NOT EXISTS interaction_detail text;

ALTER TABLE public.investor_reviews
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT true;

UPDATE public.investor_reviews SET person_id = '' WHERE person_id IS NULL;

CREATE UNIQUE INDEX idx_investor_reviews_unique
  ON public.investor_reviews (founder_id, firm_id, person_id);
