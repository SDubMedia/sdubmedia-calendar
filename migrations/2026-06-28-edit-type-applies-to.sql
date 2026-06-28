-- Scope edit types to a client type (like service bundles). 'any' shows for
-- everyone; 'real_estate' / 'wedding' / 'photography' only show on that client
-- type's projects — so "Full Edit" or "Headshots" don't clutter a real-estate
-- shoot. Existing rows default to 'any' (unchanged behavior) until re-scoped.
ALTER TABLE public.edit_types ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'any';
