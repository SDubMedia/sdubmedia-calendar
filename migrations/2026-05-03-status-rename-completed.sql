-- Rename project status `completed` → `editing_done` and introduce
-- a new terminal `delivered` state. Conceptually:
--   completed (old) === editing_done (new) — work is done, file
--                       hand-off may not have happened yet
--   delivered (new)  — final files actually shipped to the client
--
-- Existing "completed" projects stay where they are (renamed to
-- editing_done). Owner manually advances them to "delivered" as
-- they confirm hand-off.

UPDATE projects
SET status = 'editing_done'
WHERE status = 'completed';

-- If there's a CHECK constraint on status (some envs have one),
-- swap it for one that allows the new values. Wrapped in a DO
-- block since the constraint name varies by environment.
DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
  FROM pg_constraint
  WHERE conrelid = 'projects'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE projects DROP CONSTRAINT %I', cons_name);
  END IF;
END $$;
