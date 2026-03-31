-- Founder reviews: canonical table (normally created by Prisma). This migration makes Supabase-only
-- projects pick up `public.vc_ratings` so PostgREST and Edge stops returning PGRST205 / schema-cache errors.

CREATE TABLE IF NOT EXISTS public.vc_ratings (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  author_user_id text,
  vc_person_id text,
  vc_firm_id text,
  interaction_type text NOT NULL,
  interaction_detail text,
  interaction_date date,
  score_resp integer,
  score_respect integer,
  score_feedback integer,
  score_follow_thru integer,
  score_value_add integer,
  nps integer,
  comment text,
  anonymous boolean NOT NULL DEFAULT true,
  verified boolean NOT NULL DEFAULT false,
  is_draft boolean NOT NULL DEFAULT false,
  star_ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_ratings_pkey PRIMARY KEY (id),
  CONSTRAINT vc_ratings_vc_target_ck CHECK (
    vc_person_id IS NOT NULL OR vc_firm_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS vc_ratings_vc_person_id_interaction_type_idx
  ON public.vc_ratings (vc_person_id, interaction_type);

CREATE INDEX IF NOT EXISTS vc_ratings_vc_firm_id_interaction_type_idx
  ON public.vc_ratings (vc_firm_id, interaction_type);

CREATE INDEX IF NOT EXISTS vc_ratings_created_at_idx
  ON public.vc_ratings (created_at);

-- FKs only when directory tables exist (fresh DBs may run this before vc_firms).
DO $$
BEGIN
  IF to_regclass('public.vc_firms') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'vc_ratings_vc_firm_id_fkey'
    ) THEN
      ALTER TABLE public.vc_ratings
        ADD CONSTRAINT vc_ratings_vc_firm_id_fkey
        FOREIGN KEY (vc_firm_id) REFERENCES public.vc_firms (id) ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;

  IF to_regclass('public.vc_people') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'vc_ratings_vc_person_id_fkey'
    ) THEN
      ALTER TABLE public.vc_ratings
        ADD CONSTRAINT vc_ratings_vc_person_id_fkey
        FOREIGN KEY (vc_person_id) REFERENCES public.vc_people (id) ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS vc_ratings_one_draft_per_author_firm_person
  ON public.vc_ratings (author_user_id, vc_firm_id, COALESCE(vc_person_id, ''::text))
  WHERE is_draft = true;

-- RLS (same as 20260328210200 / 20260329210000 / 20260329213000) so projects that never had Prisma still work.
ALTER TABLE public.vc_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vc_ratings_select_anon" ON public.vc_ratings;
DROP POLICY IF EXISTS "vc_ratings_select_authenticated" ON public.vc_ratings;
DROP POLICY IF EXISTS "vc_ratings_insert_own_author" ON public.vc_ratings;
DROP POLICY IF EXISTS "vc_ratings_update_own_draft" ON public.vc_ratings;
DROP POLICY IF EXISTS "vc_ratings_update_own_author" ON public.vc_ratings;

CREATE POLICY "vc_ratings_select_anon"
  ON public.vc_ratings FOR SELECT TO anon USING (true);

CREATE POLICY "vc_ratings_select_authenticated"
  ON public.vc_ratings FOR SELECT TO authenticated USING (true);

CREATE POLICY "vc_ratings_insert_own_author"
  ON public.vc_ratings FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id IS NOT NULL
    AND (auth.jwt()->>'sub') = author_user_id
  );

CREATE POLICY "vc_ratings_update_own_draft"
  ON public.vc_ratings FOR UPDATE TO authenticated
  USING (
    author_user_id IS NOT NULL
    AND (auth.jwt()->>'sub') = author_user_id
    AND is_draft = true
  )
  WITH CHECK (
    author_user_id IS NOT NULL
    AND (auth.jwt()->>'sub') = author_user_id
  );

CREATE POLICY "vc_ratings_update_own_author"
  ON public.vc_ratings FOR UPDATE TO authenticated
  USING (
    author_user_id IS NOT NULL
    AND (auth.jwt()->>'sub') = author_user_id
  )
  WITH CHECK (
    author_user_id IS NOT NULL
    AND (auth.jwt()->>'sub') = author_user_id
  );
