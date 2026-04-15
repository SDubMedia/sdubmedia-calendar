-- Add per-user personal event templates as JSONB on user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS personal_event_templates jsonb DEFAULT '[]';
