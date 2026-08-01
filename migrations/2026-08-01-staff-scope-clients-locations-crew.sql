-- Staff stop being able to read the whole business.
--
-- After 2026-08-01-staff-assigned-projects-only.sql a staff login only loads
-- its own jobs — but three tables were still wide open to them:
--   clients       every company, contact, email, phone, billing arrangement
--   locations     every property address ever shot
--   crew_members  every other contractor's phone, email and pay rates
-- None of it renders on their screens, but it all travels to their browser,
-- where dev tools show it. For a contractor that's the customer list.
--
-- Clients and locations narrow to the ones attached to jobs they're on. Crew
-- goes back to own-record-only, which is what the base schema had before
-- 2026-04-fix-all-rls-critical.sql widened it to the whole roster.

-- One place for "which jobs is this staff member on". SECURITY DEFINER so the
-- lookup doesn't depend on RLS-inside-a-policy semantics; it's still bounded by
-- the caller's own org and crew id, so it can't reach anyone else's data.
CREATE OR REPLACE FUNCTION public.staff_assigned_projects()
RETURNS TABLE(id text, client_id text, location_id text) AS $$
  SELECT p.id, p.client_id, p.location_id
  FROM public.projects p
  WHERE p.org_id = public.user_org_id()
    AND public.user_crew_member_id() IS NOT NULL
    AND public.user_crew_member_id() <> ''
    AND (
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p.crew) = 'array' THEN p.crew ELSE '[]'::jsonb END
        ) e
        WHERE COALESCE(e->>'crewMemberId', e->>'crew_member_id') = public.user_crew_member_id()
      )
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p.post_production) = 'array' THEN p.post_production ELSE '[]'::jsonb END
        ) e
        WHERE COALESCE(e->>'crewMemberId', e->>'crew_member_id') = public.user_crew_member_id()
      )
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- clients: only the ones whose jobs they work on ----
DROP POLICY IF EXISTS "staff_read_clients" ON public.clients;
DROP POLICY IF EXISTS "staff_read_assigned_clients" ON public.clients;
CREATE POLICY "staff_read_assigned_clients" ON public.clients
  FOR SELECT USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND id IN (SELECT sap.client_id FROM public.staff_assigned_projects() sap WHERE sap.client_id IS NOT NULL)
  );

-- ---- locations: only the properties they're sent to ----
-- The existing policy covers partner/staff/client/family in one list, so it has
-- to be recreated without staff, then staff get their own narrower one.
DROP POLICY IF EXISTS "partner_read_locations" ON public.locations;
CREATE POLICY "partner_read_locations" ON public.locations
  FOR SELECT USING (
    public.user_role() IN ('partner', 'client', 'family')
    AND org_id = public.user_org_id()
  );

DROP POLICY IF EXISTS "staff_read_assigned_locations" ON public.locations;
CREATE POLICY "staff_read_assigned_locations" ON public.locations
  FOR SELECT USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND id IN (SELECT sap.location_id FROM public.staff_assigned_projects() sap WHERE sap.location_id IS NOT NULL)
  );

-- ---- crew_members: their own record, nobody else's ----
-- Staff surfaces only ever look up their own row (dashboard, my invoices, my
-- schedule, mileage, onboarding). The crew pickers on Availability and To-Dos
-- are owner-only, and the project sheet shows other people's names to the
-- owner only.
DROP POLICY IF EXISTS "staff_read_crew" ON public.crew_members;
DROP POLICY IF EXISTS "staff_read_own_crew_member" ON public.crew_members;
CREATE POLICY "staff_read_own_crew_member" ON public.crew_members
  FOR SELECT USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND id = public.user_crew_member_id()
  );
