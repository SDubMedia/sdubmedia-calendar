-- Lock down partner AND staff meeting visibility to match the new
-- "you only see what you're assigned to" rule.
--
-- Previously:
--   - partners saw any unattached meeting (admin's personal entries)
--   - staff saw ANY meeting in their org
--
-- Now: both must be either tied to one of their assigned clients
-- (partner) OR explicitly assigned via the assigned_user_ids list.
-- Owner still sees everything via owner_all_meetings.

DROP POLICY IF EXISTS "partner_read_meetings" ON meetings;

CREATE POLICY "partner_read_meetings" ON meetings
  FOR SELECT
  USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
    AND (
      (client_id IS NOT NULL AND client_id = ANY(public.user_client_ids()))
      OR (assigned_user_ids ? auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "staff_read_meetings" ON meetings;

CREATE POLICY "staff_read_meetings" ON meetings
  FOR SELECT
  USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND assigned_user_ids ? auth.uid()::text
  );
