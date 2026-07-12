-- ============================================================
-- Tighten crew_location_distances so a staff member can only read their OWN
-- cached home->location distances (mileage), not everyone's.
--
-- The prior "staff_read_distances" policy checked only role + org_id (and the
-- table has no org_id column), so it was too loose — at the raw database level
-- a staff member could read other crew members' distances. The app UI already
-- filters to the logged-in person (useScopedData), but the DB rule should
-- enforce it too. Scope to the caller's own crew_member_id.
-- ============================================================

DROP POLICY IF EXISTS "staff_read_distances" ON crew_location_distances;
DROP POLICY IF EXISTS "staff_own_distances" ON crew_location_distances;
CREATE POLICY "staff_own_distances" ON crew_location_distances
  FOR SELECT USING (
    public.user_role() = 'staff'
    AND crew_member_id = (SELECT crew_member_id FROM user_profiles WHERE id = auth.uid())
  );
