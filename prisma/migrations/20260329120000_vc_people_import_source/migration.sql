-- Idempotent CSV imports: one logical row per (data_source, import_record_id)
ALTER TABLE "vc_people" ADD COLUMN IF NOT EXISTS "data_source" TEXT;
ALTER TABLE "vc_people" ADD COLUMN IF NOT EXISTS "import_record_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "vc_people_data_source_import_record_id_key"
  ON "vc_people" ("data_source", "import_record_id");
