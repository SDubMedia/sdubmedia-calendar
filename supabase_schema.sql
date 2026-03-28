-- ============================================================
-- Slate — Multi-Tenant Production Management Platform
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ---- Organizations (multi-tenant) ----
create table if not exists organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  logo_url text not null default '',
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

-- ---- Clients ----
create table if not exists clients (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
  company text not null,
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  retainer_start_date text not null default '',
  monthly_hours numeric not null default 0,
  partner_split jsonb,
  created_at timestamptz not null default now()
);

-- ---- Crew Members ----
create table if not exists crew_members (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
  name text not null,
  roles text[] not null default '{}',
  phone text not null default '',
  email text not null default '',
  business_name text not null default '',
  business_address text not null default '',
  business_city text not null default '',
  business_state text not null default '',
  business_zip text not null default ''
);

-- ---- Contractor Invoices (1099 self-service) ----
create table if not exists contractor_invoices (
  id text primary key,
  crew_member_id text not null references crew_members(id) on delete cascade,
  invoice_number text not null,
  recipient_type text not null default 'sdub_media',
  recipient_name text not null default '',
  period_start text not null,
  period_end text not null,
  line_items jsonb not null default '[]',
  business_info jsonb not null default '{}',
  total numeric not null default 0,
  status text not null default 'draft',
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- ---- Locations ----
create table if not exists locations (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
  name text not null,
  address text not null default '',
  city text not null default '',
  state text not null default '',
  zip text not null default ''
);

-- ---- Project Types ----
create table if not exists project_types (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
  name text not null
);

-- ---- Projects ----
create table if not exists projects (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
  client_id text not null references clients(id) on delete cascade,
  project_type_id text not null references project_types(id) on delete restrict,
  location_id text references locations(id) on delete set null,
  date text not null,
  start_time text not null default '',
  end_time text not null default '',
  status text not null default 'upcoming',
  crew jsonb not null default '[]',
  post_production jsonb not null default '[]',
  editor_billing jsonb,
  edit_types text[] not null default '{}',
  notes text not null default '',
  deliverable_url text not null default '',
  created_at timestamptz not null default now()
);

-- ---- Retainer Payments ----
create table if not exists retainer_payments (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
  client_id text not null references clients(id) on delete cascade,
  date text not null,
  hours numeric not null default 0,
  notes text not null default ''
);

-- ---- Marketing Expenses ----
create table if not exists marketing_expenses (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
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
  org_id text not null default '' references organizations(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'client',
  client_ids text[] not null default '{}',
  crew_member_id text not null default '',
  has_completed_onboarding boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---- Invoices ----
create table if not exists invoices (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
  invoice_number text not null unique,
  client_id text not null references clients(id) on delete cascade,
  period_start text not null,
  period_end text not null,
  subtotal numeric not null default 0,
  tax_rate numeric not null default 0,
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'draft',
  issue_date text not null,
  due_date text not null,
  paid_date text,
  line_items jsonb not null default '[]',
  company_info jsonb not null default '{}',
  client_info jsonb not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- Content Series ----
create table if not exists series (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
  name text not null,
  client_id text not null references clients(id) on delete cascade,
  goal text not null default '',
  status text not null default 'draft',
  monthly_token_limit integer not null default 500000,
  tokens_used_this_month integer not null default 0,
  token_reset_date text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists series_episodes (
  id text primary key,
  series_id text not null references series(id) on delete cascade,
  episode_number integer not null default 1,
  title text not null default '',
  concept text not null default '',
  talking_points text not null default '',
  status text not null default 'idea',
  project_id text references projects(id) on delete set null,
  draft_date text not null default '',
  draft_start_time text not null default '',
  draft_end_time text not null default '',
  draft_location_id text not null default '',
  draft_crew text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists series_messages (
  id text primary key,
  series_id text not null references series(id) on delete cascade,
  role text not null default 'user',
  sender_name text not null default '',
  content text not null default '',
  tokens_used integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---- Notifications ----
create table if not exists notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default '',
  title text not null default '',
  message text not null default '',
  link text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---- Episode Comments ----
create table if not exists episode_comments (
  id text primary key,
  episode_id text not null references series_episodes(id) on delete cascade,
  series_id text not null references series(id) on delete cascade,
  user_name text not null default '',
  user_role text not null default '',
  content text not null default '',
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

-- Helper functions to look up the current user's role, client_ids, and crew_member_id
create or replace function public.user_role()
returns text as $$
  select role from public.user_profiles where id = auth.uid()
$$ language sql security definer stable;

create or replace function public.user_client_ids()
returns text[] as $$
  select client_ids from public.user_profiles where id = auth.uid()
$$ language sql security definer stable;

create or replace function public.user_crew_member_id()
returns text as $$
  select crew_member_id from public.user_profiles where id = auth.uid()
$$ language sql security definer stable;

create or replace function public.user_org_id()
returns text as $$
  select org_id from public.user_profiles where id = auth.uid()
$$ language sql security definer stable;

-- Auto-create a default user_profiles row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_org_id text;
begin
  -- If org_id is provided in metadata (invited user), use it
  -- Otherwise create a new organization (self-signup)
  new_org_id := coalesce(new.raw_user_meta_data->>'org_id', '');
  if new_org_id = '' then
    new_org_id := 'org_' || substr(md5(random()::text), 1, 8);
    insert into public.organizations (id, name, slug, plan)
    values (new_org_id, coalesce(new.raw_user_meta_data->>'org_name', 'My Company'), new_org_id, 'free')
    on conflict (id) do nothing;
  end if;

  insert into public.user_profiles (id, org_id, email, name, role, client_ids, crew_member_id, must_change_password, has_completed_onboarding)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    'client',
    '{}',
    '',
    true,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if it exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- Enable RLS on all tables ----
alter table organizations enable row level security;
alter table user_profiles enable row level security;
alter table clients enable row level security;
alter table projects enable row level security;
alter table crew_members enable row level security;
alter table locations enable row level security;
alter table project_types enable row level security;
alter table retainer_payments enable row level security;
alter table marketing_expenses enable row level security;
alter table invoices enable row level security;
alter table series enable row level security;
alter table series_episodes enable row level security;
alter table series_messages enable row level security;
alter table episode_comments enable row level security;
alter table notifications enable row level security;

-- ---- organizations policies ----
create policy "users_read_own_org" on organizations
  for select using (id = public.user_org_id());
create policy "owner_update_own_org" on organizations
  for update using (id = public.user_org_id() and public.user_role() = 'owner');

-- ---- user_profiles policies ----
create policy "owner_all_user_profiles" on user_profiles
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());
create policy "users_read_own_profile" on user_profiles
  for select using (id = auth.uid());
create policy "users_update_own_flags" on user_profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from user_profiles where id = auth.uid())
    and client_ids = (select client_ids from user_profiles where id = auth.uid())
    and crew_member_id = (select crew_member_id from user_profiles where id = auth.uid())
    and org_id = (select org_id from user_profiles where id = auth.uid())
  );

-- ---- clients policies ----
create policy "owner_all_clients" on clients
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());
create policy "partner_read_clients" on clients
  for select using (public.user_role() = 'partner' and org_id = public.user_org_id() and id = any(public.user_client_ids()));
create policy "client_read_clients" on clients
  for select using (public.user_role() = 'client' and org_id = public.user_org_id() and id = any(public.user_client_ids()));

-- ---- projects policies ----
create policy "owner_all_projects" on projects
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());
create policy "partner_read_projects" on projects
  for select using (public.user_role() = 'partner' and org_id = public.user_org_id() and client_id = any(public.user_client_ids()));
create policy "client_read_projects" on projects
  for select using (public.user_role() = 'client' and org_id = public.user_org_id() and client_id = any(public.user_client_ids()));
create policy "staff_read_projects" on projects
  for select using (
    public.user_role() = 'staff' and org_id = public.user_org_id()
    and (
      exists (select 1 from jsonb_array_elements(crew) as c where c->>'crewMemberId' = public.user_crew_member_id())
      or exists (select 1 from jsonb_array_elements(post_production) as p where p->>'crewMemberId' = public.user_crew_member_id())
    )
  );

-- ---- crew_members policies ----
create policy "owner_all_crew_members" on crew_members
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());
create policy "partner_read_crew_members" on crew_members
  for select using (public.user_role() = 'partner' and org_id = public.user_org_id());
create policy "staff_read_own_crew_member" on crew_members
  for select using (public.user_role() = 'staff' and org_id = public.user_org_id() and id = public.user_crew_member_id());

-- ---- locations policies ----
create policy "owner_all_locations" on locations
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());
create policy "authenticated_read_locations" on locations
  for select using (org_id = public.user_org_id());

-- ---- project_types policies ----
create policy "owner_all_project_types" on project_types
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());
create policy "authenticated_read_project_types" on project_types
  for select using (org_id = public.user_org_id());

-- ---- retainer_payments policies ----
create policy "owner_all_retainer_payments" on retainer_payments
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());
create policy "partner_read_retainer_payments" on retainer_payments
  for select using (public.user_role() = 'partner' and org_id = public.user_org_id() and client_id = any(public.user_client_ids()));
create policy "client_read_retainer_payments" on retainer_payments
  for select using (public.user_role() = 'client' and org_id = public.user_org_id() and client_id = any(public.user_client_ids()));

-- ---- marketing_expenses policies ----
create policy "owner_all_marketing_expenses" on marketing_expenses
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());
create policy "partner_all_marketing_expenses" on marketing_expenses
  for all using (public.user_role() = 'partner' and org_id = public.user_org_id());

-- ---- invoices policies ----
create policy "owner_all_invoices" on invoices
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());
create policy "partner_read_invoices" on invoices
  for select using (public.user_role() = 'partner' and org_id = public.user_org_id() and client_id = any(public.user_client_ids()));
create policy "client_read_invoices" on invoices
  for select using (public.user_role() = 'client' and org_id = public.user_org_id() and client_id = any(public.user_client_ids()));

-- ---- series policies ----
create policy "owner_all_series" on series
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());
create policy "partner_series" on series
  for all using (public.user_role() = 'partner' and org_id = public.user_org_id() and client_id = any(public.user_client_ids()));
create policy "client_series" on series
  for all using (public.user_role() = 'client' and org_id = public.user_org_id() and client_id = any(public.user_client_ids()));

-- ---- series_episodes policies (org scoped via series) ----
create policy "owner_all_series_episodes" on series_episodes
  for all using (series_id in (select id from series where org_id = public.user_org_id()) and public.user_role() = 'owner');
create policy "partner_series_episodes" on series_episodes
  for all using (series_id in (select id from series where org_id = public.user_org_id() and client_id = any(public.user_client_ids())) and public.user_role() = 'partner');
create policy "client_series_episodes" on series_episodes
  for all using (series_id in (select id from series where org_id = public.user_org_id() and client_id = any(public.user_client_ids())) and public.user_role() = 'client');

-- ---- series_messages policies (org scoped via series) ----
create policy "owner_all_series_messages" on series_messages
  for all using (series_id in (select id from series where org_id = public.user_org_id()) and public.user_role() = 'owner');
create policy "partner_series_messages" on series_messages
  for all using (series_id in (select id from series where org_id = public.user_org_id() and client_id = any(public.user_client_ids())) and public.user_role() = 'partner');
create policy "client_series_messages" on series_messages
  for all using (series_id in (select id from series where org_id = public.user_org_id() and client_id = any(public.user_client_ids())) and public.user_role() = 'client');

-- ---- notifications policies ----
create policy "users_own_notifications" on notifications
  for all using (user_id = auth.uid());

-- ---- episode_comments policies (org scoped via series) ----
create policy "owner_all_episode_comments" on episode_comments
  for all using (series_id in (select id from series where org_id = public.user_org_id()) and public.user_role() = 'owner');
create policy "partner_episode_comments" on episode_comments
  for all using (series_id in (select id from series where org_id = public.user_org_id() and client_id = any(public.user_client_ids())) and public.user_role() = 'partner');
create policy "client_episode_comments" on episode_comments
  for all using (series_id in (select id from series where org_id = public.user_org_id() and client_id = any(public.user_client_ids())) and public.user_role() = 'client');

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
