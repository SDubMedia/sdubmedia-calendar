-- Scope project types to a client type (like edit types / service bundles).
-- 'any' shows for everyone; 'real_estate' / 'wedding' / 'photography' only show
-- on that client type's projects. Existing rows default to 'any' (unchanged)
-- until re-scoped in Manage → Project Types.
ALTER TABLE public.project_types ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'any';
