-- Expand stage_focus_enum so firm_records.stage_focus[] / stage_min / stage_max accept standard VC stages.
-- Existing: Friends and Family, Pre-Seed, Seed, Series A, Series B+, Growth

ALTER TYPE public.stage_focus_enum ADD VALUE IF NOT EXISTS 'Series B';
ALTER TYPE public.stage_focus_enum ADD VALUE IF NOT EXISTS 'Series C';
ALTER TYPE public.stage_focus_enum ADD VALUE IF NOT EXISTS 'Series C+';
ALTER TYPE public.stage_focus_enum ADD VALUE IF NOT EXISTS 'Series D';
