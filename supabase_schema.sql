-- ============================================================
-- SDub Media FilmProject Pro — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ---- Clients ----
create table if not exists clients (
  id text primary key,
  company text not null,
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  retainer_start_date text not null default '',
  monthly_hours numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ---- Crew Members ----
create table if not exists crew_members (
  id text primary key,
  name text not null,
  roles text[] not null default '{}',
  phone text not null default '',
  email text not null default ''
);

-- ---- Locations ----
create table if not exists locations (
  id text primary key,
  name text not null,
  address text not null default '',
  city text not null default '',
  state text not null default '',
  zip text not null default ''
);

-- ---- Project Types ----
create table if not exists project_types (
  id text primary key,
  name text not null
);

-- ---- Projects ----
create table if not exists projects (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  project_type_id text not null references project_types(id) on delete restrict,
  location_id text references locations(id) on delete set null,
  date text not null,
  start_time text not null default '',
  end_time text not null default '',
  status text not null default 'upcoming',
  crew jsonb not null default '[]',
  post_production jsonb not null default '[]',
  edit_types text[] not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- ---- Retainer Payments ----
create table if not exists retainer_payments (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  date text not null,
  hours numeric not null default 0,
  notes text not null default ''
);

-- ---- Marketing Expenses ----
create table if not exists marketing_expenses (
  id text primary key,
  date text not null,
  category text not null default 'Other',
  description text not null default '',
  notes text not null default '',
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ---- User Profiles (auth) ----
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'client',
  client_ids text[] not null default '{}',
  crew_member_id text not null default '',
  created_at timestamptz not null default now()
);

-- ---- Disable RLS for now ----
alter table clients disable row level security;
alter table crew_members disable row level security;
alter table locations disable row level security;
alter table project_types disable row level security;
alter table projects disable row level security;
alter table retainer_payments disable row level security;
alter table marketing_expenses disable row level security;
alter table user_profiles disable row level security;

-- ============================================================
-- Seed Data
-- ============================================================

-- Clients
insert into clients (id, company, contact_name, phone, email, retainer_start_date, monthly_hours) values
  ('client_cbsr', 'Coldwell Banker Southern Realty', 'Sam Sizemore', '864-494-6909', 'sam.cbsouthernrealty@gmail.com', '2025-01-01', 25)
on conflict (id) do nothing;

-- Crew Members
insert into crew_members (id, name, roles, phone, email) values
  ('crew_zach', 'Zach Harrison', array['Photographer'], '6617337513', ''),
  ('crew_ken', 'Ken Robinson', array['Photographer'], '615-849-2477', ''),
  ('crew_melissa', 'Melissa Mann', array['Editor','Photographer','Photo_editor'], '661-917-8526', ''),
  ('crew_antonio', 'Antonio Brum', array['Videographer','Crew','Editor','Video_editor'], '629-401-7226', ''),
  ('crew_geoff', 'Geoff Southworth', array['Videographer','Editor','Photographer','Video_editor','Photo_editor','Crew'], '661-916-9468', 'Geoff@SDubMedia.com')
on conflict (id) do nothing;

-- Locations
insert into locations (id, name, address, city, state, zip) values
  ('loc_cbsr_mboro', 'Coldwell Banker Southern Realty', '1980 Old Fort Pkwy', 'Murfreesboro', 'TN', '37129'),
  ('loc_cbsr_brentwood', 'CBSR Brentwood', '1600 Westgate Cir', 'Brentwood', 'TN', '37027'),
  ('loc_cbsr_murfreesboro', 'CBSR Murfreesboro', '1980 Old Fort Pkwy', 'Murfreesboro', 'TN', '37129'),
  ('loc_cbsr_lawrenceburg', 'CBSR Lawrenceburg', '102 Weakley Creek Rd', 'Lawrenceburg', 'TN', '38464'),
  ('loc_cbsr_shelbyville', 'CBSR Shelbyville', '1708 N Main St', 'Shelbyville', 'TN', '37160'),
  ('loc_cbsr_columbia', 'CBSR Columbia', '2563 Nashville Hwy Ste. 6', 'Columbia', 'TN', '38401'),
  ('loc_cbsr_mtjuliet', 'CBSR Mt. Juliet', '2600 N Mt Juliet Rd', 'Mt. Juliet', 'TN', '37122'),
  ('loc_cbsr_nashville', 'CBSR Nashville', '915 Rep. John Lewis Way S Suite 102', 'Nashville', 'TN', '37203')
on conflict (id) do nothing;

-- Project Types
insert into project_types (id, name) values
  ('pt_awards', 'Awards Ceremony'),
  ('pt_jason_recruit', 'Jason Nagy - Recruitment Videos'),
  ('pt_jason_nagy', 'Jason Nagy'),
  ('pt_jason', 'Jason'),
  ('pt_rich_minute', 'Rich Weekly Minute'),
  ('pt_rich_tips', 'Rich Weekly Tips'),
  ('pt_podcast', 'Podcast'),
  ('pt_office_merger', 'Office Merger'),
  ('pt_full_day', 'Full day event'),
  ('pt_agent_camera', 'Agent on Camera'),
  ('pt_mboro_grand', 'Murfreesboro Grand Opening'),
  ('pt_chuck', 'Chuck Whitehead'),
  ('pt_sales', 'Sales Meeting'),
  ('pt_headshot', 'Headshot Photography')
on conflict (id) do nothing;

-- Projects
insert into projects (id, client_id, project_type_id, location_id, date, start_time, end_time, status, crew, post_production, edit_types, notes) values
  ('proj_001', 'client_cbsr', 'pt_rich_minute', 'loc_cbsr_mboro', '2026-03-09', '12:00', '14:00', 'upcoming',
    '[{"crewMemberId":"crew_geoff","role":"Main Videographer","hoursWorked":2,"hoursDeducted":2}]',
    '[{"crewMemberId":"crew_geoff","role":"Video Editor","hoursWorked":1,"hoursDeducted":1}]',
    array['Social Vertical','Social Horizontal'], ''),
  ('proj_002', 'client_cbsr', 'pt_podcast', 'loc_cbsr_nashville', '2026-03-12', '10:00', '13:00', 'upcoming',
    '[{"crewMemberId":"crew_geoff","role":"Main Videographer","hoursWorked":3,"hoursDeducted":3},{"crewMemberId":"crew_antonio","role":"Crew","hoursWorked":3,"hoursDeducted":3}]',
    '[{"crewMemberId":"crew_antonio","role":"Video Editor","hoursWorked":2,"hoursDeducted":2}]',
    array['Podcast Edit'], ''),
  ('proj_003', 'client_cbsr', 'pt_headshot', 'loc_cbsr_brentwood', '2026-03-15', '09:00', '12:00', 'upcoming',
    '[{"crewMemberId":"crew_zach","role":"Photographer","hoursWorked":3,"hoursDeducted":3}]',
    '[{"crewMemberId":"crew_melissa","role":"Photo Editor","hoursWorked":2,"hoursDeducted":2}]',
    array[]::text[], ''),
  ('proj_004', 'client_cbsr', 'pt_agent_camera', 'loc_cbsr_murfreesboro', '2026-02-20', '14:00', '16:00', 'completed',
    '[{"crewMemberId":"crew_geoff","role":"Main Videographer","hoursWorked":2,"hoursDeducted":2}]',
    '[{"crewMemberId":"crew_geoff","role":"Video Editor","hoursWorked":1.5,"hoursDeducted":1.5}]',
    array['Social Vertical'], ''),
  ('proj_005', 'client_cbsr', 'pt_rich_tips', 'loc_cbsr_mboro', '2026-02-27', '12:00', '14:00', 'in_editing',
    '[{"crewMemberId":"crew_geoff","role":"Main Videographer","hoursWorked":2,"hoursDeducted":2}]',
    '[{"crewMemberId":"crew_antonio","role":"Video Editor","hoursWorked":1,"hoursDeducted":1}]',
    array['Social Vertical','Social Horizontal'], '')
on conflict (id) do nothing;

-- Retainer Payments
insert into retainer_payments (id, client_id, date, hours, notes) values
  ('pay_001', 'client_cbsr', '2026-01-01', 25, 'January retainer'),
  ('pay_002', 'client_cbsr', '2026-02-01', 25, 'February retainer'),
  ('pay_003', 'client_cbsr', '2026-03-01', 25, 'March retainer')
on conflict (id) do nothing;
