-- Tracks when the last reminder email fired so the daily reminder cron is
-- idempotent (3-day cadence). Null means no reminders sent yet.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz;
