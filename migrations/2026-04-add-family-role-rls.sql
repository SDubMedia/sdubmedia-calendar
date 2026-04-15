-- Add RLS policy for family role on personal_events
-- Family users can read and write personal events in their org
DROP POLICY IF EXISTS "family_all_personal_events" ON personal_events;
CREATE POLICY "family_all_personal_events" ON personal_events
  FOR ALL USING (public.user_role() = 'family' AND org_id = public.user_org_id());
