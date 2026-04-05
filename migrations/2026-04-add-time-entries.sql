-- Time tracking for editors/crew
create table if not exists time_entries (
  id text primary key,
  org_id text not null default '',
  crew_member_id text not null default '',
  project_id text not null default '',
  start_time timestamptz not null,
  end_time timestamptz,
  duration_minutes numeric,
  auto_stopped boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table time_entries enable row level security;

create policy "owner_all_time_entries" on time_entries for all using (public.user_role() = 'owner');

create policy "staff_own_time_entries" on time_entries for all using (public.user_role() = 'staff' and crew_member_id = public.user_crew_member_id());
