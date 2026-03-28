-- Alternate identifiers for vc_firms: dedupe imports and resolve merged / renamed firms.

CREATE TYPE "VCFirmAliasType" AS ENUM (
  'WEBSITE_DOMAIN',
  'SLUG',
  'LEGAL_NAME',
  'ALSO_KNOWN_AS',
  'CRUNCHBASE_SLUG',
  'CRUNCHBASE_UUID',
  'LINKEDIN_COMPANY_SLUG',
  'LINKEDIN_NUMERIC_ID',
  'EMAIL_DOMAIN',
  'EXTERNAL_REF',
  'MANUAL'
);

CREATE TABLE "vc_firm_aliases" (
  "id" TEXT NOT NULL,
  "firm_id" TEXT NOT NULL,
  "alias_type" "VCFirmAliasType" NOT NULL,
  "alias_value" TEXT NOT NULL,
  "source" TEXT,
  "notes" TEXT,
  "confidence" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vc_firm_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vc_firm_aliases_alias_type_alias_value_key" ON "vc_firm_aliases"("alias_type", "alias_value");

CREATE INDEX "vc_firm_aliases_firm_id_idx" ON "vc_firm_aliases"("firm_id");

CREATE INDEX "vc_firm_aliases_alias_value_idx" ON "vc_firm_aliases"("alias_value");

ALTER TABLE "vc_firm_aliases" ADD CONSTRAINT "vc_firm_aliases_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "vc_firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
