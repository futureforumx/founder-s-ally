-- Provenance columns on startup_professionals + batch JSON on changelogs.

ALTER TABLE "startup_professionals" ADD COLUMN "source_priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "startup_professionals" ADD COLUMN "last_seen_at" TIMESTAMP(3);
ALTER TABLE "startup_professionals" ADD COLUMN "source_updated_at" TIMESTAMP(3);
ALTER TABLE "startup_professionals" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "startup_professionals"
SET "source_priority" = CASE LOWER("source")
    WHEN 'yc' THEN 100
    WHEN 'ph' THEN 80
    WHEN 'github' THEN 70
    WHEN 'angellist' THEN 60
    ELSE 0
END
WHERE "source_priority" = 0;

CREATE INDEX "startup_professionals_source_priority_idx" ON "startup_professionals"("source_priority");
CREATE INDEX "startup_professionals_last_seen_at_idx" ON "startup_professionals"("last_seen_at");

ALTER TABLE "startup_professional_changelogs" ADD COLUMN "patch" JSONB;
ALTER TABLE "startup_professional_changelogs" ADD COLUMN "source_priority" INTEGER NOT NULL DEFAULT 0;
