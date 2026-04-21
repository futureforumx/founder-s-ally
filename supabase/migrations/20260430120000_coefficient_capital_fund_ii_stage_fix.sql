-- Fix: Coefficient Capital Fund II — replace 'Growth' with 'Series C+' in stage_focus.
UPDATE public.vc_funds
SET
  stage_focus = array_replace(stage_focus, 'Growth', 'Series C+'),
  updated_at  = NOW()
WHERE normalized_key LIKE '%coefficient%'
  AND 'Growth' = ANY(stage_focus);
