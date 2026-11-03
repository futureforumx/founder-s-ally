create table if not exists public.design_studio_state (
  singleton boolean primary key default true check (singleton),
  draft_config jsonb not null,
  published_config jsonb not null,
  draft_revision_id uuid not null,
  published_revision_id uuid not null,
  published_version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  published_at timestamptz not null default now(),
  published_by text
);

create table if not exists public.design_studio_revisions (
  id uuid primary key default gen_random_uuid(),
  version integer not null,
  action text not null check (action in ('published', 'draft_saved', 'restored')),
  config jsonb not null,
  actor text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.design_studio_state enable row level security;
alter table public.design_studio_revisions enable row level security;
revoke all on public.design_studio_state, public.design_studio_revisions from anon, authenticated;
grant select, insert, update on public.design_studio_state to service_role;
grant select, insert on public.design_studio_revisions to service_role;

-- The first revision matches the current Vekta CSS values. An install is immediately
-- usable without exposing an unpublished configuration to public consumers.
do $$
declare
  initial_id uuid := gen_random_uuid();
  initial_config jsonb := '{
    "foundations":{"colors":{"--background":"#0a0a0a","--foreground":"#fafafa","--card":"#111111","--primary":"#fafafa","--primary-foreground":"#090909","--muted-foreground":"#a1a1aa","--border":"#292929","--success":"#29e3a6","--warning":"#f4bf50","--destructive":"#ef4444","--info":"#60a5fa"},"radius":"12px","spacing":"16px","density":"comfortable","fontFamily":"Geist"},
    "icons":{"library":"lucide","size":16,"strokeWidth":2,"color":"--muted-foreground","mappings":{"navigation.investors":"Users","navigation.companies":"Building2","actions.search":"Search","actions.track":"Bookmark","actions.download":"Download","status.success":"CircleCheck","status.warning":"TriangleAlert"}},
    "componentPresets":[{"id":"button.primary","name":"Primary button","component":"button","variant":"default","size":"default","radius":"md","padding":"default"},{"id":"button.secondary","name":"Secondary button","component":"button","variant":"secondary","size":"default","radius":"md","padding":"default"},{"id":"badge.success","name":"Success badge","component":"badge","variant":"success","size":"default","radius":"md","padding":"default"},{"id":"card.metric","name":"Metric card","component":"card","variant":"default","size":"default","radius":"lg","padding":"comfortable"}],
    "visualizations":[{"id":"investor-fit-distribution","name":"Investor fit distribution","type":"bar","title":"Investor fit score","color":"#29e3a6","showGrid":true,"showLegend":false,"xAxisKey":"name","yAxisKey":"value","xAxisLabel":"Month","yAxisLabel":"Score","showTooltip":true,"showLabels":false},{"id":"fundraising-activity","name":"Fundraising activity","type":"area","title":"Funding activity","color":"#8b72f8","showGrid":true,"showLegend":true,"xAxisKey":"name","yAxisKey":"value","xAxisLabel":"Month","yAxisLabel":"Activity","showTooltip":true,"showLabels":false}],
    "patterns":[{"id":"page-header","name":"Page header","template":"page-header","density":"comfortable"},{"id":"search-filters","name":"Search and filters","template":"search-filters","density":"comfortable"},{"id":"metric-grid","name":"Metric dashboard","template":"metric-grid","density":"comfortable"},{"id":"empty-state","name":"Empty state","template":"empty-state","density":"comfortable"}],
    "motion":{"durationMs":200,"easing":"ease-in-out","intensity":"standard","reducedMotion":true}
  }'::jsonb;
begin
  insert into public.design_studio_revisions(id, version, action, config, note)
  values (initial_id, 1, 'published', initial_config, 'Initial published design configuration')
  on conflict do nothing;
  insert into public.design_studio_state(singleton, draft_config, published_config, draft_revision_id, published_revision_id, published_version)
  values (true, initial_config, initial_config, initial_id, initial_id, 1)
  on conflict (singleton) do nothing;
end $$;

create or replace function public.design_studio_mutate(
  p_action text,
  p_config jsonb default null,
  p_expected_revision uuid default null,
  p_target_revision uuid default null,
  p_actor text default null,
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  state_row public.design_studio_state%rowtype;
  next_id uuid := gen_random_uuid();
  next_version integer;
  next_config jsonb;
  target_action text;
begin
  select * into state_row from public.design_studio_state where singleton = true for update;
  if not found then raise exception 'Design studio state is not initialized'; end if;

  if p_action = 'save_draft' then
    if state_row.draft_revision_id is distinct from p_expected_revision then raise exception 'DRAFT_CONFLICT'; end if;
    if p_config is null then raise exception 'Configuration is required'; end if;
    insert into public.design_studio_revisions(id, version, action, config, actor, note)
      values (next_id, state_row.published_version, 'draft_saved', p_config, p_actor, p_note);
    update public.design_studio_state set draft_config = p_config, draft_revision_id = next_id, updated_at = now(), updated_by = p_actor where singleton = true;
  elsif p_action = 'publish' then
    if state_row.draft_revision_id is distinct from p_expected_revision then raise exception 'DRAFT_CONFLICT'; end if;
    next_config := state_row.draft_config;
    next_version := state_row.published_version + 1;
    insert into public.design_studio_revisions(id, version, action, config, actor, note)
      values (next_id, next_version, 'published', next_config, p_actor, p_note);
    update public.design_studio_state set published_config = next_config, published_revision_id = next_id, draft_revision_id = next_id, draft_config = next_config, published_version = next_version, updated_at = now(), updated_by = p_actor, published_at = now(), published_by = p_actor where singleton = true;
  elsif p_action = 'restore' then
    if state_row.draft_revision_id is distinct from p_expected_revision then raise exception 'DRAFT_CONFLICT'; end if;
    select config, action into next_config, target_action from public.design_studio_revisions where id = p_target_revision;
    if next_config is null or target_action not in ('published', 'restored') then raise exception 'REVISION_NOT_FOUND'; end if;
    next_version := state_row.published_version + 1;
    insert into public.design_studio_revisions(id, version, action, config, actor, note)
      values (next_id, next_version, 'restored', next_config, p_actor, coalesce(p_note, 'Restored from revision ' || p_target_revision::text));
    update public.design_studio_state set published_config = next_config, draft_config = next_config, published_revision_id = next_id, draft_revision_id = next_id, published_version = next_version, updated_at = now(), updated_by = p_actor, published_at = now(), published_by = p_actor where singleton = true;
  else
    raise exception 'Unsupported design studio action';
  end if;

  return jsonb_build_object('revision_id', next_id, 'published_version', (select published_version from public.design_studio_state where singleton = true));
end;
$$;

revoke all on function public.design_studio_mutate(text, jsonb, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.design_studio_mutate(text, jsonb, uuid, uuid, text, text) to service_role;
