-- Travel bases: crew members can now have multiple home addresses
-- (e.g., primary in TN + a "California" base when they fly out to
-- shoot). Mileage is calculated from whichever travel base is set
-- on the project's crew entry. Falls back to the primary base.
--
-- 1. Add home_bases jsonb array to crew_members. Each entry:
--      { id, label, address, city, state, zip, isPrimary }
-- 2. Add home_base_id to crew_location_distances so the cache is
--    keyed per-(crew, base, location) — distance from TN home is
--    different from distance from CA home for the same shoot.
-- 3. Backfill: for every crew member that has a populated
--    home_address, seed home_bases with one entry labeled "Home"
--    marked primary. Stamp home_base_id='primary' on all existing
--    distance cache rows.

ALTER TABLE crew_members
  ADD COLUMN IF NOT EXISTS home_bases jsonb DEFAULT '[]'::jsonb;

ALTER TABLE crew_location_distances
  ADD COLUMN IF NOT EXISTS home_base_id text DEFAULT 'primary';

-- Backfill home_bases from home_address (skip if already populated).
UPDATE crew_members
SET home_bases = jsonb_build_array(jsonb_build_object(
  'id', 'primary',
  'label', 'Home',
  'address', COALESCE(home_address->>'address', ''),
  'city', COALESCE(home_address->>'city', ''),
  'state', COALESCE(home_address->>'state', ''),
  'zip', COALESCE(home_address->>'zip', ''),
  'isPrimary', true
))
WHERE (home_bases IS NULL OR jsonb_typeof(home_bases) <> 'array' OR jsonb_array_length(home_bases) = 0)
  AND home_address IS NOT NULL
  AND COALESCE(home_address->>'address', '') <> '';

-- Stamp existing cache rows with the primary base id so the new
-- composite cache key matches.
UPDATE crew_location_distances
SET home_base_id = 'primary'
WHERE home_base_id IS NULL OR home_base_id = '';

-- Drop the old 2-column unique constraint (if it exists) and add
-- a 3-column one that includes home_base_id.
ALTER TABLE crew_location_distances
  DROP CONSTRAINT IF EXISTS crew_location_distances_crew_member_id_location_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS crew_location_distances_unique_per_base
  ON crew_location_distances (crew_member_id, home_base_id, location_id);
