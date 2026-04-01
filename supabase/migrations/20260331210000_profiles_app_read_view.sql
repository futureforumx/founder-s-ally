-- profiles_app_read: server-side read model for nullable profile counters.
--
-- Contract (see src/lib/profileRead.ts):
--   • Browser / Supabase JS: read public.profiles + normalizeProfileRowForRead (RLS + mock).
--   • SQL / service_role / Edge: read this view; COALESCE list must match PROFILE_READ_COUNTER_FIELDS.
-- Storage and writes: always public.profiles (nullable semantics unchanged).

CREATE OR REPLACE VIEW public.profiles_app_read
WITH (security_invoker = true)
AS
SELECT
  COALESCE(p.actions_last_30d, 0)::integer AS actions_last_30d,
  p.avatar_url,
  p.bio,
  p.capital_raised_lifetime,
  p.city,
  p.community_tags,
  p.company_departed_at,
  p.company_id,
  p.company_joined_at,
  p.company_role,
  p.country,
  p.created_at,
  p.current_role_title,
  p.domains_of_expertise,
  p.engagement_score,
  p.founder_role,
  p.founder_seniority,
  p.fundraising_experience_level,
  p.full_name,
  p.gtm_experience,
  p.has_completed_onboarding,
  p.has_prior_exit,
  p.has_seen_settings_tour,
  p.hiring_experience_level,
  p.id,
  p.intro_preferences,
  COALESCE(p.intros_made_count, 0)::integer AS intros_made_count,
  p.is_public,
  p.last_active_at,
  p.leadership_style,
  p.linkedin_url,
  p.location,
  p.management_experience_level,
  COALESCE(p.playbooks_used_count, 0)::integer AS playbooks_used_count,
  p.preferred_help_areas,
  p.primary_expertise,
  COALESCE(p.prior_exits_count, 0)::smallint AS prior_exits_count,
  p.prior_startups_count,
  p.region,
  p.resume_url,
  p.risk_tolerance,
  p.timezone,
  p.title,
  p.twitter_url,
  p.updated_at,
  p.user_id,
  p.user_type,
  p.willing_to_advise,
  p.working_style,
  p.years_experience
FROM public.profiles p;

COMMENT ON VIEW public.profiles_app_read IS
  'READ ONLY. Server-side counterpart to src/lib/profileRead.ts: COALESCE on the same counter columns as PROFILE_READ_COUNTER_FIELDS. Writes: public.profiles only.';

GRANT SELECT ON public.profiles_app_read TO anon, authenticated, service_role;
