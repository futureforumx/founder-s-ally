-- Non-investor startup operators (founders, CTOs, makers) for intelligence.

CREATE TABLE "startup_professionals" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "linkedin" TEXT,
    "email" TEXT,
    "title" TEXT NOT NULL,
    "current_role" TEXT NOT NULL,
    "current_startup" TEXT NOT NULL,
    "prev_startups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "yc_batch" TEXT,
    "ph_maker" BOOLEAN NOT NULL DEFAULT false,
    "ph_launch_count" INTEGER NOT NULL DEFAULT 0,
    "github_handle" TEXT,
    "github_stars" INTEGER NOT NULL DEFAULT 0,
    "angel_list_id" TEXT,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "startup_professionals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "startup_professionals_linkedin_key" ON "startup_professionals"("linkedin");

CREATE UNIQUE INDEX "startup_professionals_full_name_current_startup_key" ON "startup_professionals"("full_name", "current_startup");

CREATE INDEX "startup_professionals_yc_batch_idx" ON "startup_professionals"("yc_batch");
CREATE INDEX "startup_professionals_current_role_idx" ON "startup_professionals"("current_role");
CREATE INDEX "startup_professionals_source_idx" ON "startup_professionals"("source");
CREATE INDEX "startup_professionals_github_stars_idx" ON "startup_professionals"("github_stars");
CREATE INDEX "startup_professionals_location_idx" ON "startup_professionals"("location");
CREATE INDEX "startup_professionals_ph_launch_count_idx" ON "startup_professionals"("ph_launch_count");
