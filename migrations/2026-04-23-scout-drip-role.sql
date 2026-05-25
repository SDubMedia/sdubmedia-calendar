-- ============================================================
-- Scoped Postgres role for Scout's tool-leads drip cron.
--
-- scout_drip has NO permissions except:
--   - SELECT on 6 columns of tool_leads
--   - UPDATE on 3 columns of tool_leads
--
-- Scout authenticates with a pre-minted JWT (role claim = scout_drip,
-- signed with the Slate JWT secret). PostgREST assumes the role for
-- each request, so Scout cannot read or write any other table.
-- ============================================================

-- 1. Create the role (NOLOGIN — only assumed via PostgREST JWT).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'scout_drip') then
    create role scout_drip nologin noinherit;
  end if;
end$$;

-- 2. Allow PostgREST's authenticator role to assume scout_drip.
--    This is the standard Supabase pattern — without it, the JWT's
--    role claim can't resolve to this role.
grant scout_drip to authenticator;

-- 3. Schema + narrow table grants. Column-level for belt-and-suspenders.
grant usage on schema public to scout_drip;

grant select (id, email, drip_stage, first_seen_at, last_sent_at, unsubscribed_at)
  on public.tool_leads to scout_drip;

grant update (drip_stage, last_sent_at, last_template_id)
  on public.tool_leads to scout_drip;

-- 4. RLS policies for scout_drip on tool_leads.
--    USING (true) because drip needs to see every non-unsubscribed lead;
--    handler-side code already filters unsubscribed_at + drip_stage.
alter table public.tool_leads enable row level security;

drop policy if exists "scout_drip_select_tool_leads" on public.tool_leads;
create policy "scout_drip_select_tool_leads" on public.tool_leads
  for select to scout_drip using (true);

drop policy if exists "scout_drip_update_tool_leads" on public.tool_leads;
create policy "scout_drip_update_tool_leads" on public.tool_leads
  for update to scout_drip using (true) with check (true);
