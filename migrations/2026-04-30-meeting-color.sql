-- Per-meeting color so users can visually differentiate meetings on the
-- calendar (discovery calls vs scope reviews vs internal, etc.).
-- Empty string = default slate-blue.

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '';
