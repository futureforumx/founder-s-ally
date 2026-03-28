-- CreateTable
CREATE TABLE "vc_ratings" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "author_user_id" TEXT,
    "vc_person_id" TEXT,
    "vc_firm_id" TEXT,
    "interaction_type" TEXT NOT NULL,
    "interaction_detail" TEXT,
    "interaction_date" DATE,
    "score_resp" INTEGER,
    "score_respect" INTEGER,
    "score_feedback" INTEGER,
    "score_follow_thru" INTEGER,
    "score_value_add" INTEGER,
    "nps" INTEGER NOT NULL,
    "comment" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT true,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vc_ratings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vc_ratings_vc_person_id_interaction_type_idx" ON "vc_ratings"("vc_person_id", "interaction_type");

CREATE INDEX "vc_ratings_vc_firm_id_interaction_type_idx" ON "vc_ratings"("vc_firm_id", "interaction_type");

CREATE INDEX "vc_ratings_created_at_idx" ON "vc_ratings"("created_at");

ALTER TABLE "vc_ratings" ADD CONSTRAINT "vc_ratings_vc_person_id_fkey" FOREIGN KEY ("vc_person_id") REFERENCES "vc_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vc_ratings" ADD CONSTRAINT "vc_ratings_vc_firm_id_fkey" FOREIGN KEY ("vc_firm_id") REFERENCES "vc_firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vc_ratings" ADD CONSTRAINT "vc_ratings_vc_target_ck" CHECK (
  "vc_person_id" IS NOT NULL OR "vc_firm_id" IS NOT NULL
);
