-- ============================================================
-- Add mileage tracking: home address + distance cache
-- Run in Supabase SQL Editor
-- ============================================================

-- ---- Crew Members: home address for mileage calculation ----
alter table crew_members
  add column if not exists home_address jsonb;

-- ---- Distance cache: crew member → location distances ----
create table if not exists crew_location_distances (
  id text primary key,
  crew_member_id text not null references crew_members(id) on delete cascade,
  location_id text not null references locations(id) on delete cascade,
  distance_miles numeric not null default 0,
  created_at timestamptz not null default now(),
  unique(crew_member_id, location_id)
);

-- ---- RLS ----
alter table crew_location_distances enable row level security;

-- Owner sees all distances (for reports)
create policy "owner_all_crew_location_distances" on crew_location_distances
  for all using (
    public.user_role() = 'owner'
  );

-- Staff sees only their own distances
create policy "staff_own_distances" on crew_location_distances
  for select using (
    public.user_role() = 'staff'
    and crew_member_id = public.user_crew_member_id()
  );
