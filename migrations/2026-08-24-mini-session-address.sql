-- Structured location for mini sessions: a venue name plus real address parts,
-- the same shape the proposal booking fields use (name / address / city /
-- state / zip). location_text stays as the composed one-line version so the
-- public page, emails and the calendar feed keep reading a single field.
ALTER TABLE mini_sessions ADD COLUMN IF NOT EXISTS location_name text NOT NULL DEFAULT '';
ALTER TABLE mini_sessions ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';
ALTER TABLE mini_sessions ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '';
ALTER TABLE mini_sessions ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT '';
ALTER TABLE mini_sessions ADD COLUMN IF NOT EXISTS zip text NOT NULL DEFAULT '';
