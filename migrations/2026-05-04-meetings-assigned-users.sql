-- Replace `assigned_crew_member_ids` (crew-keyed) with `assigned_user_ids`
-- (user-keyed) so partners can be assigned to meetings too. Partners
-- typically don't have a crew_member record, so the previous column
-- couldn't reach them.
--
-- Backfill: for any existing meeting that had crew member ids assigned,
-- look up the corresponding user_profiles.id (the user linked to that
-- crew member) and add it to the new list. Crew members without a
-- linked user just drop off.

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS assigned_user_ids jsonb DEFAULT '[]'::jsonb;

UPDATE meetings m
SET assigned_user_ids = COALESCE((
  SELECT jsonb_agg(up.id::text)
  FROM user_profiles up
  WHERE up.org_id = m.org_id
    AND up.crew_member_id IN (
      SELECT jsonb_array_elements_text(m.assigned_crew_member_ids)
    )
), '[]'::jsonb)
WHERE m.assigned_crew_member_ids IS NOT NULL
  AND jsonb_array_length(m.assigned_crew_member_ids) > 0;

UPDATE meetings
SET assigned_user_ids = '[]'::jsonb
WHERE assigned_user_ids IS NULL;

ALTER TABLE meetings
  DROP COLUMN IF EXISTS assigned_crew_member_ids;
