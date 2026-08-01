-- Staff could read AND WRITE every crew member's time entries and mileage.
--
-- This was already fixed once. 2026-04-29-staff-rls-tighten.sql scoped
-- staff_own_trips and staff_own_time_entries to the caller's own
-- crew_member_id, for exactly this reason. But 2026-04-fix-all-rls-critical.sql
-- carries an older, unscoped version of the same two policy names, so re-running
-- that file after the tightening dropped the good policies and recreated the
-- loose ones. Production has been running the loose version since.
--
-- Both are FOR ALL with no WITH CHECK, which means the same permissive test
-- governs writes: one contractor could inflate their own mileage or delete
-- another's hours — the numbers payouts are calculated from.
--
-- ⚠️ Do NOT re-run 2026-04-fix-all-rls-critical.sql. It will undo this again.
-- Two files creating the same policy name is the trap; this one is dated later
-- and is the source of truth for these policies.
--
-- Also closes, while we're here:
--   services / service_variants / service_categories — the whole catalog
--     including internal cost, i.e. your margin on every job. No staff screen
--     reads the catalog (projects carry their own snapshot of services).
--   project_history — the change log for every project, not just theirs.

-- ---- mileage: your own trips, read and write ----
DROP POLICY IF EXISTS "staff_own_trips" ON public.manual_trips;
DROP POLICY IF EXISTS "staff_own_manual_trips" ON public.manual_trips;
CREATE POLICY "staff_own_manual_trips" ON public.manual_trips
  FOR ALL
  USING (
    public.user_role() = 'staff'
    AND crew_member_id = public.user_crew_member_id()
  )
  WITH CHECK (
    public.user_role() = 'staff'
    AND crew_member_id = public.user_crew_member_id()
  );

-- ---- time tracking: your own entries, read and write ----
DROP POLICY IF EXISTS "staff_own_time_entries" ON public.time_entries;
CREATE POLICY "staff_own_time_entries" ON public.time_entries
  FOR ALL
  USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND crew_member_id = public.user_crew_member_id()
  )
  WITH CHECK (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND crew_member_id = public.user_crew_member_id()
  );

-- ---- service catalog: not staff's business ----
DROP POLICY IF EXISTS "staff_read_services" ON public.services;
DROP POLICY IF EXISTS "staff_read_service_variants" ON public.service_variants;
DROP POLICY IF EXISTS "staff_read_service_categories" ON public.service_categories;

-- ---- project history: only for jobs they're on ----
DROP POLICY IF EXISTS "team_read_project_history" ON public.project_history;
CREATE POLICY "team_read_project_history" ON public.project_history
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() IN ('owner', 'partner')
      OR (
        public.user_role() = 'staff'
        AND project_id IN (SELECT sap.id FROM public.staff_assigned_projects() sap)
      )
    )
  );
