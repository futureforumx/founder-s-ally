-- Heartland Ventures Fund III — restore Fresh Capital fund details from
-- the Jan. 21, 2026 GlobeNewswire announcement.
--
-- Source notes:
-- - Fund title: "Heartland Ventures Launches $60 Million Fund III..."
-- - Target size: $60M
-- - Investment focus: Seed and Series A
-- - Themes/markets discussed: industrial tech, manufacturing, logistics /
--   supply chain, construction, real estate
--
-- We keep the theme list concise for the public Fresh Capital pills.

UPDATE public.vc_funds vf
SET
  target_size_usd = 60000000,
  stage_focus = ARRAY['Seed', 'Series A']::text[],
  geography_focus = ARRAY['U.S.']::text[],
  sector_focus = ARRAY['Industrial Tech', 'Manufacturing', 'Supply Chain']::text[],
  announcement_title = 'Heartland Ventures Launches $60 Million Fund III to Power Reindustrialization',
  updated_at = now()
FROM public.firm_records fr
WHERE vf.firm_record_id = fr.id
  AND vf.deleted_at IS NULL
  AND fr.deleted_at IS NULL
  AND lower(trim(fr.firm_name)) = lower(trim('Heartland Ventures'))
  AND lower(trim(vf.name)) = lower(trim('Fund III'));
