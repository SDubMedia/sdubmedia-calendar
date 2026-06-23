-- Photographer "on my way" check-in. When the assigned shooter is heading to a
-- shoot they stamp this; it (a) notifies the agent and (b) locks the agent out
-- of changing/cancelling — they can adjust only until the shooter checks in.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS on_the_way_at timestamptz;
