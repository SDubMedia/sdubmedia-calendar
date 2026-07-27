-- The projects table never had an updated_at column, but several endpoints
-- write it on update (crew-update-status, agent-cancel-shoot, notify-on-the-way,
-- stripe-webhook deposit flip, project-talent). Every one of those writes failed
-- ("column updated_at does not exist") — two of them silently. Adding the column
-- makes all of them work as intended; no code changes needed.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
