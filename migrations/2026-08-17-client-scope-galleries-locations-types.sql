-- Two things: repair client galleries, then narrow locations and project types.
--
-- PART 1 — REGRESSION, fix first.
--
-- 2026-08-17-client-base-table-drift.sql dropped the client read policy on
-- `projects`. That was right, but `client_read_own_project_deliveries` on
-- `deliveries` decides access with a subquery against `projects` — and a
-- subquery inside a policy is itself filtered by RLS. With no client policy on
-- `projects` the lookup finds nothing, the EXISTS is false, and a signed-in
-- client's gallery list comes back empty. Verified by probe: a client who
-- could see 1 delivery now sees 0.
--
-- (The public share-link flow was never affected — api/delivery-public.ts runs
-- under the service role. This is only clients signed into Slate.)
--
-- The fix is a SECURITY DEFINER lookup, the same pattern as
-- staff_assigned_projects() in 2026-08-01-staff-scope-clients-locations-crew.
-- It answers "which jobs belong to this login's clients" without depending on
-- RLS-inside-a-policy, and is still bounded by the caller's own org and their
-- own client_ids, so it can't reach anyone else's rows.
--
-- PART 2 — the lockdown.
--
-- Any client login could list all 35 locations and all 37 project types in the
-- org: every property address ever shot, for every other client. Their own
-- pages only ever resolve these by id from their own projects
-- (ClientDashboardPage, MyHousesPage, MySchedulePage, ClientReportsPage,
-- MyInvoicesPage all do `.find(l => l.id === p.locationId)`), so narrowing to
-- what their projects reference changes nothing on screen.
--
-- AFTER RUNNING: sign in as an agent/client and check three things —
-- galleries appear again, the schedule still shows addresses, and reports
-- still name project types.

-- ---- the lookup ----
-- Returns the caller's own jobs and the location/type each one points at.
-- STABLE + SECURITY DEFINER: evaluated once per statement, not per row, and
-- not re-filtered by the policies it feeds.
CREATE OR REPLACE FUNCTION public.client_project_ids()
RETURNS TABLE(id text, location_id text, project_type_id text) AS $$
  SELECT p.id, p.location_id, p.project_type_id
  FROM public.projects p
  WHERE p.org_id = public.user_org_id()
    AND p.client_id = ANY(public.user_client_ids())
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- PART 1: galleries work again ----
DROP POLICY IF EXISTS "client_read_own_project_deliveries" ON public.deliveries;
CREATE POLICY "client_read_own_project_deliveries" ON public.deliveries
  FOR SELECT USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND project_id IS NOT NULL
    AND project_id IN (SELECT cpi.id FROM public.client_project_ids() cpi)
  );

-- ---- PART 2a: locations — only the properties they were shot at ----
-- The existing policy lumps partner/client/family together, so it has to be
-- recreated without client before clients get their own narrower one.
DROP POLICY IF EXISTS "partner_read_locations" ON public.locations;
CREATE POLICY "partner_read_locations" ON public.locations
  FOR SELECT USING (
    public.user_role() IN ('partner', 'family')
    AND org_id = public.user_org_id()
  );

DROP POLICY IF EXISTS "client_read_own_locations" ON public.locations;
CREATE POLICY "client_read_own_locations" ON public.locations
  FOR SELECT USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND id IN (
      SELECT cpi.location_id FROM public.client_project_ids() cpi
      WHERE cpi.location_id IS NOT NULL
    )
  );

-- ---- PART 2b: project types — only the ones their own jobs use ----
DROP POLICY IF EXISTS "others_read_project_types" ON public.project_types;
CREATE POLICY "others_read_project_types" ON public.project_types
  FOR SELECT USING (
    public.user_role() IN ('partner', 'staff', 'family')
    AND org_id = public.user_org_id()
  );

DROP POLICY IF EXISTS "client_read_own_project_types" ON public.project_types;
CREATE POLICY "client_read_own_project_types" ON public.project_types
  FOR SELECT USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND id IN (
      SELECT cpi.project_type_id FROM public.client_project_ids() cpi
      WHERE cpi.project_type_id IS NOT NULL
    )
  );

-- Print what's left on the four tables, so the run itself says who can read
-- them rather than needing a separate check.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('deliveries', 'locations', 'project_types', 'projects')
    ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE '% | % | %', r.tablename, r.policyname, r.cmd;
  END LOOP;
END $$;
