-- Add pause support to time_entries
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS paused_at timestamptz DEFAULT NULL;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS total_paused_ms integer DEFAULT 0;
