-- Add one_time_use flag to locations
-- Allows marking locations as one-time-use so they don't clutter the master list
ALTER TABLE locations ADD COLUMN one_time_use boolean NOT NULL DEFAULT false;
