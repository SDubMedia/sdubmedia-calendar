-- ============================================================
-- Project history — an append-only audit trail for projects.
--
-- Records who created a project and every subsequent move: status changes
-- (e.g. In Editing -> Delivered) and date/time changes. Shown as a timeline at
-- the bottom of the project edit screen. Logged going forward only — past
-- changes were never recorded and cannot be backfilled.
-- ============================================================

create table if not exists project_history (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  actor_user_id text,                       -- who did it (user_profiles.id); null if unknown
  actor_name text not null default '',      -- name snapshot at the time
  action text not null,                     -- 'created' | 'status_changed' | 'date_changed' | 'time_changed'
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);

create index if not exists project_history_project_idx on project_history(project_id, created_at desc);

alter table project_history enable row level security;

-- Owner: full access within their org.
drop policy if exists "owner_all_project_history" on project_history;
create policy "owner_all_project_history" on project_history for all
  using (public.user_role() = 'owner' and org_id = public.user_org_id())
  with check (public.user_role() = 'owner' and org_id = public.user_org_id());

-- Partner + staff: read the trail for projects in their org.
drop policy if exists "team_read_project_history" on project_history;
create policy "team_read_project_history" on project_history for select
  using (public.user_role() in ('owner', 'partner', 'staff') and org_id = public.user_org_id());

-- Owner/partner/staff record their own actions (append-only; no update/delete).
drop policy if exists "team_insert_project_history" on project_history;
create policy "team_insert_project_history" on project_history for insert
  with check (public.user_role() in ('owner', 'partner', 'staff') and org_id = public.user_org_id());
