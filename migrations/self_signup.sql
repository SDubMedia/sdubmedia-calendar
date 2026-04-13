-- Update trigger: self-signup users become owners of their new org
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_org_id text;
  new_role text;
begin
  new_org_id := coalesce(new.raw_user_meta_data->>'org_id', '');

  if new_org_id = '' then
    -- Self-signup: create a new org and make them owner
    new_org_id := 'org_' || substr(md5(random()::text), 1, 8);
    insert into public.organizations (id, name, slug, plan)
    values (
      new_org_id,
      coalesce(new.raw_user_meta_data->>'org_name', 'My Company'),
      new_org_id,
      'free'
    )
    on conflict (id) do nothing;
    new_role := 'owner';
  else
    -- Invited user: join existing org as client (owner updates role after)
    new_role := 'client';
  end if;

  insert into public.user_profiles (id, org_id, email, name, role, client_ids, crew_member_id, must_change_password, has_completed_onboarding)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new_role,
    '{}',
    '',
    case when new_role = 'owner' then false else true end,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;
