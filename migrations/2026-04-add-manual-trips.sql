-- Manual mileage trips (office visits, gear pickup, ad-hoc trips)
create table if not exists manual_trips (
  id text primary key,
  crew_member_id text not null references crew_members(id) on delete cascade,
  date text not null,
  destination text not null default '',
  location_id text references locations(id) on delete set null,
  purpose text not null default '',
  round_trip_miles numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table manual_trips enable row level security;

create policy "owner_all_manual_trips" on manual_trips
  for all using (public.user_role() = 'owner');

create policy "staff_own_manual_trips" on manual_trips
  for all using (public.user_role() = 'staff' and crew_member_id = public.user_crew_member_id());
