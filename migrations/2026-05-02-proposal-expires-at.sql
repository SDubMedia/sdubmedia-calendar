-- Optional expiration on proposals. Default null = never expires (back-compat
-- with all existing proposals). Owners can opt to set this when sending —
-- when the column is non-null and < now(), the public proposal page renders
-- an expired state instead of the live form.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_proposals_expires_at ON proposals (expires_at);
