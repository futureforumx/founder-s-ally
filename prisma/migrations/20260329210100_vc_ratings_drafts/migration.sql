-- Align with supabase/migrations/20260329210000_vc_ratings_drafts.sql (RLS lives in Supabase-only migrations).
ALTER TABLE "vc_ratings" ADD COLUMN IF NOT EXISTS "is_draft" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vc_ratings" ADD COLUMN IF NOT EXISTS "star_ratings" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "vc_ratings" ALTER COLUMN "nps" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "vc_ratings_one_draft_per_author_firm_person"
  ON "vc_ratings" ("author_user_id", "vc_firm_id", COALESCE("vc_person_id", ''::text))
  WHERE "is_draft" = true;
