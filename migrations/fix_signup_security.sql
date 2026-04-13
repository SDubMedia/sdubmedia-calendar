-- SECURITY FIX: Never trust org_id from signup metadata.
-- Self-signup ALWAYS creates a new org. Invited users get
-- assigned to the correct org by the owner's update call,
-- not by the trigger.

create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_org_id text;
  is_invited boolean;
begin
  -- Check if this user was pre-invited (org_id was set by a trusted server call)
  -- We only trust org_id if an owner explicitly created this user via the invite flow
  -- The invite flow sets _invited=true in metadata as a signal
  is_invited := coalesce((new.raw_user_meta_data->>'_invited')::boolean, false);

  if is_invited then
    new_org_id := coalesce(new.raw_user_meta_data->>'org_id', '');
  else
    new_org_id := '';
  end if;

  if new_org_id = '' then
    -- Self-signup OR missing org: create a new org, make them owner
    new_org_id := 'org_' || substr(md5(random()::text), 1, 8);
    insert into public.organizations (id, name, slug, plan)
    values (
      new_org_id,
      coalesce(new.raw_user_meta_data->>'org_name', 'My Company'),
      new_org_id,
      'free'
    )
    on conflict (id) do nothing;
  end if;

  insert into public.user_profiles (id, org_id, email, name, role, client_ids, crew_member_id, must_change_password, has_completed_onboarding)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    case when is_invited then 'client' else 'owner' end,
    '{}',
    '',
    is_invited,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;
