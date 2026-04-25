-- Edit Types — make them per-org DB rows instead of a hardcoded TypeScript union.
-- Seeds every existing org with the 6 defaults, then back-fills projects.edit_types[]
-- from names to IDs so existing projects keep their selections.

-- 1. Table + RLS
create table if not exists edit_types (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table edit_types enable row level security;

create policy "owner_all_edit_types" on edit_types
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());
create policy "authenticated_read_edit_types" on edit_types
  for select using (org_id = public.user_org_id());

-- 2. Seed 6 defaults per existing org (deterministic IDs = idempotent)
do $$
declare
  o record;
  defaults text[] := array['Social Vertical','Social Horizontal','Podcast Edit','Full Edit','Highlight Reel','Raw Footage'];
  slugs    text[] := array['social_vertical','social_horizontal','podcast_edit','full_edit','highlight_reel','raw_footage'];
  i int;
begin
  for o in select id from organizations loop
    for i in 1..array_length(defaults, 1) loop
      insert into edit_types (id, org_id, name)
      values ('etype_' || o.id || '_' || slugs[i], o.id, defaults[i])
      on conflict (id) do nothing;
    end loop;
  end loop;
end $$;

-- 3. Back-fill projects.edit_types: map string names to newly seeded IDs per org.
-- Values already prefixed 'etype_' (already migrated) are left alone.
do $$
declare
  p record;
  new_arr text[];
  elem text;
  mapped text;
begin
  for p in select id, org_id, edit_types from projects
           where edit_types is not null and array_length(edit_types, 1) > 0 loop
    new_arr := array[]::text[];
    foreach elem in array p.edit_types loop
      if elem like 'etype\_%' escape '\' then
        new_arr := array_append(new_arr, elem);
      else
        select id into mapped from edit_types where org_id = p.org_id and name = elem;
        if mapped is not null then
          new_arr := array_append(new_arr, mapped);
        end if;
      end if;
    end loop;
    update projects set edit_types = new_arr where id = p.id;
  end loop;
end $$;
