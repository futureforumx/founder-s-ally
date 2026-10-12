-- Store the chosen investor approach and what happened on the existing
-- context-scoped target row. Existing RLS policies on context_entity_notes
-- continue to scope reads and writes to the owner's contexts.
ALTER TABLE public.context_entity_notes
  ADD COLUMN IF NOT EXISTS intro_route text,
  ADD COLUMN IF NOT EXISTS intro_outcome text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'context_entity_notes_intro_route_check'
      AND conrelid = 'public.context_entity_notes'::regclass
  ) THEN
    ALTER TABLE public.context_entity_notes
      ADD CONSTRAINT context_entity_notes_intro_route_check
      CHECK (
        intro_route IS NULL OR intro_route IN (
          'ask_intro', 'direct_outreach', 'portfolio_help', 'thesis_content', 'advice'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'context_entity_notes_intro_outcome_check'
      AND conrelid = 'public.context_entity_notes'::regclass
  ) THEN
    ALTER TABLE public.context_entity_notes
      ADD CONSTRAINT context_entity_notes_intro_outcome_check
      CHECK (
        intro_outcome IS NULL OR intro_outcome IN (
          'intro_requested', 'connected', 'meeting_booked', 'declined',
          'no_response', 'passed', 'committed'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cen_owner_org_intro_outcome
  ON public.context_entity_notes (owner_context_id, organization_id, intro_outcome)
  WHERE organization_id IS NOT NULL;
