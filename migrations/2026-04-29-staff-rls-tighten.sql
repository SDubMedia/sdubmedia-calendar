-- Tighten staff-role RLS.
-- Audit found:
--   1. staff_read_projects — sees all org projects (no scope filter)
--   2. staff_read_clients — sees all org clients
--   3. staff_own_trips — staff can read/edit each other's mileage entries
--   4. staff_own_time_entries — staff can read/edit each other's clock-in records
--
-- Fix: scope projects/clients by user_client_ids() (matches partner/client),
-- and scope trips/time_entries by the user's own crew_member_id.

-- ----------------------------------------------------------------------
-- staff sees only clients they're scoped to
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_read_clients" ON clients;
CREATE POLICY "staff_read_clients" ON clients
  FOR SELECT USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND id = ANY(public.user_client_ids())
  );

-- ----------------------------------------------------------------------
-- staff sees only projects for clients they're scoped to.
-- (Frontend further narrows to projects they're personally crewed on, but
-- that's a UI nicety — RLS uses client_ids as the harder boundary.)
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_read_projects" ON projects;
CREATE POLICY "staff_read_projects" ON projects
  FOR SELECT USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
  );

-- ----------------------------------------------------------------------
-- staff_own_trips — restrict to the user's own crew_member_id.
-- The crew_member_id lives on user_profiles; we look it up via subquery.
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_own_trips" ON manual_trips;
CREATE POLICY "staff_own_trips" ON manual_trips
  FOR ALL USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND crew_member_id = (SELECT crew_member_id FROM user_profiles WHERE id = auth.uid())
  );

-- ----------------------------------------------------------------------
-- staff_own_time_entries — same pattern.
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_own_time_entries" ON time_entries;
CREATE POLICY "staff_own_time_entries" ON time_entries
  FOR ALL USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND crew_member_id = (SELECT crew_member_id FROM user_profiles WHERE id = auth.uid())
  );
