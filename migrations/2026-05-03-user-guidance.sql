-- Adds guidance state to user_profiles. Tracks which per-page first-visit
-- guides the user has dismissed and whether the dashboard setup checklist
-- has been hidden (auto-hidden at 100% complete or explicitly dismissed).
-- Single JSONB column avoids a separate table for this lightweight state.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS guidance jsonb DEFAULT '{}'::jsonb;
