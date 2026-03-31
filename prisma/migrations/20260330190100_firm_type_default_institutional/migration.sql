-- Safe after enum values exist (separate migration / transaction).
ALTER TABLE "vc_firms" ALTER COLUMN "firm_type" SET DEFAULT 'INSTITUTIONAL'::"FirmType";
