-- Meetings now support an explicit assigned-crew list. Staff users
-- only see meetings where their crew_member_id is in this array;
-- owner/partner see all meetings regardless. Empty list = admin-only
-- (the safe default for the existing rows that didn't track assignees).

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS assigned_crew_member_ids jsonb DEFAULT '[]'::jsonb;

UPDATE meetings
SET assigned_crew_member_ids = '[]'::jsonb
WHERE assigned_crew_member_ids IS NULL;
