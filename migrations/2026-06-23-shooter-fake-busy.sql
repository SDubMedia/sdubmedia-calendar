-- "Fake it till you make it" — each shooter can hold back N minutes/day in the
-- agent-facing booking view so they look more in-demand. 0 = off. Only affects
-- the agent's open-slot picker; the real production calendar is unaffected.
ALTER TABLE shooter_prefs ADD COLUMN IF NOT EXISTS fake_busy_minutes integer NOT NULL DEFAULT 0;
