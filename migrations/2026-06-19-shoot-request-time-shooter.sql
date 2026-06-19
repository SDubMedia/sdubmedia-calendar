-- Add the agent's requested time and optional preferred shooter to a shoot
-- request. Time is required at the form level; shooter is optional (null = the
-- owner assigns whoever when approving).
ALTER TABLE shoot_requests ADD COLUMN IF NOT EXISTS preferred_time text;
ALTER TABLE shoot_requests ADD COLUMN IF NOT EXISTS preferred_crew_member_id text;
