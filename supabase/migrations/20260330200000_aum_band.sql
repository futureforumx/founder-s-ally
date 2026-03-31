CREATE TYPE "AumBand" AS ENUM ('NANO', 'MICRO', 'SMALL', 'MID_SIZE', 'LARGE', 'MEGA_FUND');

ALTER TABLE "vc_firms" ADD COLUMN IF NOT EXISTS "aum_band" "AumBand";
ALTER TABLE "vc_funds" ADD COLUMN IF NOT EXISTS "aum_band" "AumBand";

CREATE INDEX IF NOT EXISTS "vc_firms_aum_band_idx" ON "vc_firms"("aum_band");
CREATE INDEX IF NOT EXISTS "vc_funds_aum_band_idx" ON "vc_funds"("aum_band");

UPDATE "vc_funds"
SET "aum_band" = CASE
  WHEN "aum_usd" IS NULL AND "size_usd" IS NULL THEN NULL
  WHEN GREATEST(COALESCE("aum_usd", 0::double precision), COALESCE("size_usd", 0::double precision)) < 25000000 THEN 'NANO'::"AumBand"
  WHEN GREATEST(COALESCE("aum_usd", 0::double precision), COALESCE("size_usd", 0::double precision)) < 75000000 THEN 'MICRO'::"AumBand"
  WHEN GREATEST(COALESCE("aum_usd", 0::double precision), COALESCE("size_usd", 0::double precision)) < 250000000 THEN 'SMALL'::"AumBand"
  WHEN GREATEST(COALESCE("aum_usd", 0::double precision), COALESCE("size_usd", 0::double precision)) < 750000000 THEN 'MID_SIZE'::"AumBand"
  WHEN GREATEST(COALESCE("aum_usd", 0::double precision), COALESCE("size_usd", 0::double precision)) < 1000000000 THEN 'LARGE'::"AumBand"
  ELSE 'MEGA_FUND'::"AumBand"
END
WHERE "deleted_at" IS NULL;

UPDATE "vc_firms" f
SET "aum_band" = x.b
FROM (
  SELECT "firm_id",
    CASE
      WHEN m IS NULL THEN NULL::"AumBand"
      WHEN m < 25000000 THEN 'NANO'::"AumBand"
      WHEN m < 75000000 THEN 'MICRO'::"AumBand"
      WHEN m < 250000000 THEN 'SMALL'::"AumBand"
      WHEN m < 750000000 THEN 'MID_SIZE'::"AumBand"
      WHEN m < 1000000000 THEN 'LARGE'::"AumBand"
      ELSE 'MEGA_FUND'::"AumBand"
    END AS b
  FROM (
    SELECT "firm_id",
      MAX(
        CASE
          WHEN "aum_usd" IS NULL AND "size_usd" IS NULL THEN NULL::double precision
          ELSE GREATEST(COALESCE("aum_usd", 0::double precision), COALESCE("size_usd", 0::double precision))
        END
      ) AS m
    FROM "vc_funds"
    WHERE "deleted_at" IS NULL
    GROUP BY "firm_id"
  ) t
) x
WHERE f."id" = x."firm_id";
