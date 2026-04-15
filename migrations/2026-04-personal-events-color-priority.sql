-- Add color and priority fields to personal_events
ALTER TABLE personal_events ADD COLUMN IF NOT EXISTS color text DEFAULT '';
ALTER TABLE personal_events ADD COLUMN IF NOT EXISTS priority boolean DEFAULT false;
