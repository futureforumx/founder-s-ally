-- Audit trail for StartupProfessional field updates.

CREATE TABLE "startup_professional_changelogs" (
    "id" TEXT NOT NULL,
    "startup_professional_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "startup_professional_changelogs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "startup_professional_changelogs_startup_professional_id_idx" ON "startup_professional_changelogs"("startup_professional_id");
CREATE INDEX "startup_professional_changelogs_created_at_idx" ON "startup_professional_changelogs"("created_at");

ALTER TABLE "startup_professional_changelogs" ADD CONSTRAINT "startup_professional_changelogs_startup_professional_id_fkey" FOREIGN KEY ("startup_professional_id") REFERENCES "startup_professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
