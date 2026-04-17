-- Fix bad display data already in DB: "a16z | TechCrunch" leads; sector "ai" on obvious fintech deals.
WITH cleaned AS (
  SELECT
    id,
    trim(
      both ' '
      FROM regexp_replace(
        regexp_replace(name_raw, '\s*\|\s*(TechCrunch|GeekWire|AlleyWatch)\s*', '', 'ig'),
        '\s+',
        ' ',
        'g'
      )
    ) AS name_raw_new
  FROM public.funding_deal_investors
  WHERE name_raw ~* '\|\s*(TechCrunch|GeekWire|AlleyWatch)'
)
UPDATE public.funding_deal_investors fdi
SET
  name_raw = c.name_raw_new,
  name_normalized = trim(
    both ' '
    FROM regexp_replace(lower(c.name_raw_new), '[^a-z0-9]+', ' ', 'g')
  )
FROM cleaned c
WHERE fdi.id = c.id
  AND fdi.name_raw IS DISTINCT FROM c.name_raw_new;

UPDATE public.funding_deals fd
SET
  sector_raw = 'fintech',
  sector_normalized = 'fintech'
FROM public.source_articles sa
WHERE sa.id = fd.source_article_id
  AND coalesce(fd.needs_review, false) IS NOT TRUE
  AND lower(coalesce(nullif(btrim(fd.sector_normalized), ''), nullif(btrim(fd.sector_raw), ''), '')) = 'ai'
  AND lower(coalesce(sa.title, '') || ' ' || coalesce(left(sa.raw_text, 8000), ''))
    ~ 'fintech|financial risk|transaction data|merchant intelligence|payment|embedded finance|lending|risk management';
