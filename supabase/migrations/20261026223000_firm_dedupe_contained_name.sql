-- Dedupe scan also groups a firm when:
--   * a 5+ letter distinctive core appears anywhere in another live name
--   * two names share a first word of 4+ letters and the cores are still similar
-- "primary" inside "High Peaks Venture Partners (now called Primary Venture Partners)"
-- is the contained-name case. Corporate and generic words are not needles.

create or replace function public.admin_list_firm_duplicate_clusters(
  p_limit integer default 50,
  p_offset integer default 0,
  p_query text default ''
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_temp, public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 80);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_query text := left(trim(coalesce(p_query, '')), 80);
  v_like text;
  v_scanned integer := 0;
  v_total integer := 0;
  v_skipped integer := 0;
  v_clusters jsonb := '[]'::jsonb;
  v_deny text[] := array[
    'angel','alpha','beta','apex','atlas','base','black','blue','bridge','capital',
    'catalyst','core','crest','digital','east','first','forge','fund','funds','global',
    'gold','green','horizon','impact','launch','new','next','north','nova','open',
    'partner','partners','peak','pioneer','prime','red','rise','silver','south',
    'spark','summit','tech','true','vector','venture','ventures','vertex','west','white'
  ];
  v_stop text[] := array[
    'management','investment','investments','holdings','holding','advisors','advisor',
    'advisory','group','company','companies','corporation','associates','international',
    'limited','equity','ventures','venture','capital','partners','partner','funds','fund'
  ];
  i integer;
begin
  if to_regprocedure('public.plpgsql_check_pragma(text[])') is not null then
    -- Temp tables are invisible to plpgsql_check unless declared. The call is
    -- skipped where that extension is not installed.
    perform plpgsql_check_pragma('table:pg_temp._firm_dup_base(id uuid, firm_name text, legal_name text, website_url text, aliases text[], completeness_score numeric, ready_for_live boolean, norm_core text, norm_keep text, token text)');
    perform plpgsql_check_pragma('table:pg_temp._firm_dup_pairs(a uuid, b uuid)');
    perform plpgsql_check_pragma('table:pg_temp._firm_dup_token(token text, id uuid)');
    perform plpgsql_check_pragma('table:pg_temp._firm_dup_label(id uuid, cluster uuid)');
  end if;

  perform set_config('statement_timeout', '25000', true);
  v_like := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');

  drop table if exists pg_temp._firm_dup_pairs;
  drop table if exists pg_temp._firm_dup_label;
  drop table if exists pg_temp._firm_dup_base;
  drop table if exists pg_temp._firm_dup_token;

  create temp table _firm_dup_base (
    id uuid primary key,
    firm_name text not null,
    legal_name text,
    website_url text,
    aliases text[] not null,
    completeness_score numeric,
    ready_for_live boolean,
    norm_core text not null,
    norm_keep text not null,
    token text not null
  ) on commit drop;

  insert into _firm_dup_base (
    id, firm_name, legal_name, website_url, aliases, completeness_score, ready_for_live,
    norm_core, norm_keep, token
  )
  select
    named.id,
    named.firm_name,
    named.legal_name,
    named.website_url,
    named.aliases,
    named.completeness_score,
    named.ready_for_live,
    named.norm_core,
    named.norm_keep,
    split_part(named.norm_core, ' ', 1)
  from (
    select
      fr.id,
      fr.firm_name,
      fr.legal_name,
      fr.website_url,
      coalesce(fr.aliases, '{}'::text[]) as aliases,
      fr.completeness_score,
      fr.ready_for_live,
      public.firm_search_normalize(fr.firm_name, true) as norm_core,
      public.firm_search_normalize(fr.firm_name, false) as norm_keep
    from public.firm_records fr
    where fr.deleted_at is null
      and length(btrim(coalesce(fr.firm_name, ''))) > 0
      and (
        v_query = ''
        or fr.firm_name ilike '%' || v_like || '%' escape '\'
        or coalesce(fr.legal_name, '') ilike '%' || v_like || '%' escape '\'
        or coalesce(fr.website_url, '') ilike '%' || v_like || '%' escape '\'
        or exists (
          select 1
          from unnest(coalesce(fr.aliases, '{}'::text[])) as alias_name
          where alias_name ilike '%' || v_like || '%' escape '\'
        )
      )
  ) named;

  get diagnostics v_scanned = row_count;

  create index _firm_dup_base_core_idx on _firm_dup_base (norm_core);

  select count(*)::integer into v_skipped
  from (
    select norm_core
    from _firm_dup_base
    where length(norm_core) >= 4
    group by norm_core
    having count(*) > 15
  ) big;

  create temp table _firm_dup_pairs (
    a uuid not null,
    b uuid not null,
    primary key (a, b)
  ) on commit drop;

  insert into _firm_dup_pairs (a, b)
  select a.id, b.id
  from _firm_dup_base a
  join (
    select norm_core
    from _firm_dup_base
    where length(norm_core) >= 4
    group by norm_core
    having count(*) between 2 and 15
  ) ok on ok.norm_core = a.norm_core
  join _firm_dup_base b
    on b.norm_core = a.norm_core
   and a.id < b.id
  where not (a.norm_core = any (v_deny))
     or similarity(a.norm_keep, b.norm_keep) >= 0.78;

  -- Same first word, including 4-letter words such as "high".
  insert into _firm_dup_pairs (a, b)
  select a.id, b.id
  from _firm_dup_base a
  join (
    select token
    from _firm_dup_base
    where length(token) >= 4
    group by token
    having count(*) between 2 and 12
  ) ok on ok.token = a.token
  join _firm_dup_base b
    on b.token = a.token
   and a.id < b.id
   and a.norm_core <> b.norm_core
  where not (a.token = any (v_deny))
    and similarity(a.norm_core, b.norm_core) >= 0.84
  on conflict do nothing;

  -- A 5+ letter core anywhere in another name. Buckets over 12 are left out.
  create temp table _firm_dup_token (
    token text not null,
    id uuid not null,
    primary key (token, id)
  ) on commit drop;

  insert into _firm_dup_token (token, id)
  select tok, b.id
  from _firm_dup_base b
  cross join lateral regexp_split_to_table(b.norm_keep, ' ') as tok
  where length(tok) >= 5
  on conflict do nothing;

  insert into _firm_dup_pairs (a, b)
  select t1.id, t2.id
  from (
    select t.token
    from _firm_dup_token t
    where exists (
      select 1
      from _firm_dup_base owner
      where owner.norm_core = t.token
        and not (owner.norm_core = any (v_deny))
        and not (owner.norm_core = any (v_stop))
    )
    group by t.token
    having count(*) between 2 and 12
  ) ok
  join _firm_dup_token t1 on t1.token = ok.token
  join _firm_dup_token t2 on t2.token = ok.token and t1.id < t2.id
  on conflict do nothing;

  delete from _firm_dup_pairs p
  using public.firm_not_duplicates n
  where (p.a = n.firm_a and p.b = n.firm_b)
     or (p.a = n.firm_b and p.b = n.firm_a);

  create temp table _firm_dup_label (
    id uuid primary key,
    cluster uuid not null
  ) on commit drop;

  insert into _firm_dup_label (id, cluster)
  select id, id
  from _firm_dup_base b
  where exists (
    select 1 from _firm_dup_pairs p where p.a = b.id or p.b = b.id
  );

  for i in 1..8 loop
    update _firm_dup_label l
    set cluster = s.next_cluster
    from (
      select
        x.id,
        least(x.cluster::text, min(y.cluster::text))::uuid as next_cluster
      from _firm_dup_label x
      join _firm_dup_pairs p on p.a = x.id or p.b = x.id
      join _firm_dup_label y on y.id = case when p.a = x.id then p.b else p.a end
      group by x.id, x.cluster
    ) s
    where l.id = s.id
      and s.next_cluster is not null
      and s.next_cluster <> l.cluster;
  end loop;

  -- A dismissed pair must not stay together through a third similar name.
  for i in 1..12 loop
    delete from _firm_dup_label victim
    where victim.id in (
      select case
        when coalesce(ba.completeness_score, 0) < coalesce(bb.completeness_score, 0)
          or (
            coalesce(ba.completeness_score, 0) = coalesce(bb.completeness_score, 0)
            and la.id > lb.id
          )
        then la.id
        else lb.id
      end
      from public.firm_not_duplicates n
      join _firm_dup_label la on la.id = n.firm_a
      join _firm_dup_label lb on lb.id = n.firm_b and lb.cluster = la.cluster
      join _firm_dup_base ba on ba.id = la.id
      join _firm_dup_base bb on bb.id = lb.id
    );
    exit when not found;
  end loop;

  select count(*)::integer into v_total
  from (
    select cluster
    from _firm_dup_label
    group by cluster
    having count(*) between 2 and 12
  ) c;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'member_count', c.member_count,
      'members', c.members
    )
    order by c.member_count desc, c.sort_name
  ), '[]'::jsonb)
  into v_clusters
  from (
    select
      l.cluster as id,
      count(*)::integer as member_count,
      min(b.firm_name) as sort_name,
      jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'firm_name', b.firm_name,
          'legal_name', b.legal_name,
          'website_url', b.website_url,
          'aliases', to_jsonb(b.aliases),
          'completeness_score', b.completeness_score,
          'ready_for_live', b.ready_for_live
        )
        order by b.completeness_score desc nulls last, b.firm_name
      ) as members
    from _firm_dup_label l
    join _firm_dup_base b on b.id = l.id
    group by l.cluster
    having count(*) between 2 and 12
    order by count(*) desc, min(b.firm_name)
    limit v_limit
    offset v_offset
  ) c;

  return jsonb_build_object(
    'scanned', v_scanned,
    'total_clusters', v_total,
    'skipped_large', v_skipped,
    'clusters', coalesce(v_clusters, '[]'::jsonb)
  );
end;
$$;

comment on function public.admin_list_firm_duplicate_clusters(integer, integer, text) is
  'Admin-only. Groups live firm names, including a 5+ letter core found anywhere in another name and similar names that share a 4+ letter first word. Skips pairs marked as not duplicates.';

revoke all on function public.admin_list_firm_duplicate_clusters(integer, integer, text) from public, anon, authenticated;
grant execute on function public.admin_list_firm_duplicate_clusters(integer, integer, text) to service_role;
