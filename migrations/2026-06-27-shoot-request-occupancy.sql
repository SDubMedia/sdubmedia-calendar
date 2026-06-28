-- Agents flag whether the property is vacant or occupied when booking a shoot,
-- so the photographer knows what to expect on-site. Default false = occupied.
ALTER TABLE shoot_requests ADD COLUMN IF NOT EXISTS is_vacant boolean NOT NULL DEFAULT false;
