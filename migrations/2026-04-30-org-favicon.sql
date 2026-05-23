-- Org-level favicon. Stored as a data URL or absolute URL — same shape
-- as logo_url. Empty string = browser default favicon.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS favicon_url text NOT NULL DEFAULT '';
