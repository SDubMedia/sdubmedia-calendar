-- Project cancellation: capture *why* a project was cancelled and *when*.
-- Cancelled projects already exist via the status enum — these columns just
-- hold the audit detail surfaced when a user picks "Cancelled" in the
-- project dialog.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS cancellation_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
