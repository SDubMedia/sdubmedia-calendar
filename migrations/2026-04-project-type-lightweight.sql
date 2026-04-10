-- Add lightweight flag to project_types
-- Lightweight types show a minimal form (client, date, time, location, notes only)
ALTER TABLE project_types ADD COLUMN lightweight boolean NOT NULL DEFAULT false;
