-- Aum band on Prisma vc_* tables (optional: many Supabase-only envs have no vc_funds / vc_firms).
DO $$
BEGIN
  IF to_regclass('public.vc_firms') IS NULL AND to_regclass('public.vc_funds') IS NULL THEN
    RAISE NOTICE 'Skipping AumBand migration: public.vc_firms and public.vc_funds are not present';
    RETURN;
  END IF;

  BEGIN
    CREATE TYPE "AumBand" AS ENUM ('NANO', 'MICRO', 'SMALL', 'MID_SIZE', 'LARGE', 'MEGA_FUND');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.vc_firms') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.vc_firms ADD COLUMN IF NOT EXISTS aum_band "AumBand";
  CREATE INDEX IF NOT EXISTS vc_firms_aum_band_idx ON public.vc_firms (aum_band);
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.vc_funds') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.vc_funds ADD COLUMN IF NOT EXISTS aum_band "AumBand";
  CREATE INDEX IF NOT EXISTS vc_funds_aum_band_idx ON public.vc_funds (aum_band);
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.vc_funds') IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.vc_funds
  SET aum_band = CASE
    WHEN aum_usd IS NULL AND size_usd IS NULL THEN NULL
    WHEN GREATEST(COALESCE(aum_usd, 0::double precision), COALESCE(size_usd, 0::double precision)) < 25000000 THEN 'NANO'::"AumBand"
    WHEN GREATEST(COALESCE(aum_usd, 0::double precision), COALESCE(size_usd, 0::double precision)) < 75000000 THEN 'MICRO'::"AumBand"
    WHEN GREATEST(COALESCE(aum_usd, 0::double precision), COALESCE(size_usd, 0::double precision)) < 250000000 THEN 'SMALL'::"AumBand"
    WHEN GREATEST(COALESCE(aum_usd, 0::double precision), COALESCE(size_usd, 0::double precision)) < 750000000 THEN 'MID_SIZE'::"AumBand"
    WHEN GREATEST(COALESCE(aum_usd, 0::double precision), COALESCE(size_usd, 0::double precision)) < 1000000000 THEN 'LARGE'::"AumBand"
    ELSE 'MEGA_FUND'::"AumBand"
  END
  WHERE deleted_at IS NULL;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.vc_firms') IS NULL OR to_regclass('public.vc_funds') IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.vc_firms f
  SET aum_band = x.b
  FROM (
    SELECT firm_id,
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
      SELECT firm_id,
        MAX(
          CASE
            WHEN aum_usd IS NULL AND size_usd IS NULL THEN NULL::double precision
            ELSE GREATEST(COALESCE(aum_usd, 0::double precision), COALESCE(size_usd, 0::double precision))
          END
        ) AS m
      FROM public.vc_funds
      WHERE deleted_at IS NULL
      GROUP BY firm_id
    ) t
  ) x
  WHERE f.id = x.firm_id;
END;
$$;
