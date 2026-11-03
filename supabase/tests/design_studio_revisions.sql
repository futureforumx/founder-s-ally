-- Run against an isolated local Supabase database after the design studio migration.
-- Every write is rolled back after assertions complete.
begin;
do $$
declare
  current_state public.design_studio_state%rowtype;
  original_color text;
  changed_config jsonb;
  original_published_id uuid;
  published_version integer;
begin
  select * into current_state from public.design_studio_state where singleton = true;
  original_color := current_state.published_config #>> '{foundations,colors,--background}';
  original_published_id := current_state.published_revision_id;

  changed_config := jsonb_set(current_state.draft_config, '{foundations,colors,--background}', '"#121212"'::jsonb);
  perform public.design_studio_mutate('save_draft', changed_config, current_state.draft_revision_id, null, 'test-admin', 'test draft');
  select * into current_state from public.design_studio_state where singleton = true;
  if current_state.draft_config #>> '{foundations,colors,--background}' <> '#121212' then
    raise exception 'draft save did not persist';
  end if;
  if current_state.published_config #>> '{foundations,colors,--background}' <> original_color then
    raise exception 'saving a draft changed the published config';
  end if;

  perform public.design_studio_mutate('publish', null, current_state.draft_revision_id, null, 'test-admin', 'test publish');
  select * into current_state from public.design_studio_state where singleton = true;
  published_version := current_state.published_version;
  if current_state.published_config #>> '{foundations,colors,--background}' <> '#121212' then
    raise exception 'publish did not update the published config';
  end if;

  -- A stale editor cannot overwrite the draft.
  begin
    perform public.design_studio_mutate('save_draft', changed_config, original_published_id, null, 'test-admin', 'stale writer');
    raise exception 'stale draft write should have conflicted';
  exception when others then
    if sqlerrm not like '%DRAFT_CONFLICT%' then raise; end if;
  end;

  perform public.design_studio_mutate('restore', null, current_state.draft_revision_id, original_published_id, 'test-admin', 'test restore');
  select * into current_state from public.design_studio_state where singleton = true;
  if current_state.published_config #>> '{foundations,colors,--background}' <> original_color then
    raise exception 'restore did not restore the selected snapshot';
  end if;
  if current_state.published_version <> published_version + 1 then
    raise exception 'restore did not create a new published version';
  end if;
end $$;
rollback;
