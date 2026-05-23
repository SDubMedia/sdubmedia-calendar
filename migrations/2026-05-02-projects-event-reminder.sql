-- Track when the last event-reminder cron fired for each project so we
-- don't double-send within a single day. Null = never sent.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS last_event_reminder_sent_at timestamptz;
