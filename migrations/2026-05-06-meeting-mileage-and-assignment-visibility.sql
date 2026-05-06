-- =============================================================
-- Meeting mileage + per-user "show in meeting assignments" toggle
--
-- 1) meetings: add meeting_address (free text) + one_way_miles
--    (numeric, computed at save time via /api/calculate-distance
--    against the saver's home base). When set, the meeting flows
--    into the saver's mileage tracker for the matching year.
--
-- 2) user_profiles: add show_in_meeting_assignments boolean.
--    Default true so existing staff/partner users keep showing up
--    in the meeting "Assign people" picker. Owner can flip it off
--    per user from the Manage > Users edit panel.
-- =============================================================

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS meeting_address text,
  ADD COLUMN IF NOT EXISTS one_way_miles numeric;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS show_in_meeting_assignments boolean NOT NULL DEFAULT true;
