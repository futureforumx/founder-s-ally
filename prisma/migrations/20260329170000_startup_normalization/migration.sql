-- CreateTable
CREATE TABLE "startups" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "company_url" TEXT,
    "sector" "SectorFocus",
    "location" TEXT,
    "total_raised_usd" DECIMAL(15,2),
    "last_funding_date" DATE,
    "last_verified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "startups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "startups_company_name_key" ON "startups"("company_name");

-- AlterTable
ALTER TABLE "vc_funds"
    ALTER COLUMN "open_date" TYPE TIMESTAMPTZ(6) USING "open_date" AT TIME ZONE 'UTC',
    ALTER COLUMN "close_date" TYPE TIMESTAMPTZ(6) USING "close_date" AT TIME ZONE 'UTC',
    ADD COLUMN "source_url" TEXT,
    ADD COLUMN "confidence" DECIMAL(3,2) DEFAULT 0.00;

-- Backfill startups from existing investment denormalized company fields
INSERT INTO "startups" ("id", "company_name", "company_url", "sector", "location", "last_verified_at")
SELECT
    gen_random_uuid()::text AS id,
    inv.company_name,
    MIN(inv.company_url) AS company_url,
    MIN(inv.sector) AS sector,
    MIN(inv.location) AS location,
    CURRENT_TIMESTAMP AS last_verified_at
FROM "vc_investments" inv
GROUP BY inv.company_name
ON CONFLICT ("company_name") DO NOTHING;

-- AlterTable
ALTER TABLE "vc_investments"
    ADD COLUMN "startup_id" TEXT,
    ADD COLUMN "led_round" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "source_url" TEXT,
    ADD COLUMN "confidence" DECIMAL(3,2) DEFAULT 0.00;

-- Link each investment to its normalized startup row
UPDATE "vc_investments" inv
SET "startup_id" = s.id
FROM "startups" s
WHERE s.company_name = inv.company_name;

-- Convert round_type text values to existing StageFocus enum
ALTER TABLE "vc_investments" ADD COLUMN "round_type_new" "StageFocus";

UPDATE "vc_investments"
SET "round_type_new" = CASE
    WHEN round_type IS NULL THEN NULL
    WHEN UPPER(REPLACE(REPLACE(round_type, '-', '_'), ' ', '_')) = 'PRE_SEED' THEN 'PRE_SEED'::"StageFocus"
    WHEN UPPER(REPLACE(REPLACE(round_type, '-', '_'), ' ', '_')) = 'SEED' THEN 'SEED'::"StageFocus"
    WHEN UPPER(REPLACE(REPLACE(round_type, '-', '_'), ' ', '_')) = 'SERIES_A' THEN 'SERIES_A'::"StageFocus"
    WHEN UPPER(REPLACE(REPLACE(round_type, '-', '_'), ' ', '_')) = 'SERIES_B' THEN 'SERIES_B'::"StageFocus"
    WHEN UPPER(REPLACE(REPLACE(round_type, '-', '_'), ' ', '_')) = 'SERIES_C' THEN 'SERIES_C'::"StageFocus"
    WHEN UPPER(REPLACE(REPLACE(round_type, '-', '_'), ' ', '_')) = 'GROWTH' THEN 'GROWTH'::"StageFocus"
    WHEN UPPER(REPLACE(REPLACE(round_type, '-', '_'), ' ', '_')) = 'LATE' THEN 'LATE'::"StageFocus"
    WHEN UPPER(REPLACE(REPLACE(round_type, '-', '_'), ' ', '_')) = 'IPO' THEN 'IPO'::"StageFocus"
    ELSE NULL
END;

ALTER TABLE "vc_investments"
    DROP COLUMN "round_type";

ALTER TABLE "vc_investments"
    RENAME COLUMN "round_type_new" TO "round_type";

ALTER TABLE "vc_investments"
    ALTER COLUMN "check_size_usd" TYPE DECIMAL(15,2)
    USING CASE
      WHEN "check_size_usd" IS NULL THEN NULL
      ELSE ROUND("check_size_usd"::numeric, 2)
    END,
    ALTER COLUMN "investment_date" TYPE TIMESTAMPTZ(6)
    USING CASE
      WHEN "investment_date" IS NULL THEN NULL
      ELSE "investment_date" AT TIME ZONE 'UTC'
    END;

ALTER TABLE "vc_investments"
    ALTER COLUMN "startup_id" SET NOT NULL;

-- Keep only normalized startup relation fields in investments
ALTER TABLE "vc_investments"
    DROP COLUMN "company_name",
    DROP COLUMN "company_url",
    DROP COLUMN "sector",
    DROP COLUMN "stage_at_investment",
    DROP COLUMN "location";

-- CreateIndex
CREATE INDEX "vc_investments_startup_id_idx" ON "vc_investments"("startup_id");

-- CreateIndex
CREATE UNIQUE INDEX "vc_investments_firm_id_startup_id_round_type_key" ON "vc_investments"("firm_id", "startup_id", "round_type");

-- AddForeignKey
ALTER TABLE "vc_investments"
ADD CONSTRAINT "vc_investments_startup_id_fkey"
FOREIGN KEY ("startup_id") REFERENCES "startups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
