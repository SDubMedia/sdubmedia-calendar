-- Agent booking: whether the agent will meet the photographer on-site
-- (separate from the gate code / lockbox notes). Defaults to false.
ALTER TABLE shoot_requests ADD COLUMN IF NOT EXISTS agent_will_meet boolean NOT NULL DEFAULT false;
