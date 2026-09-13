-- Some project types never happen anywhere: an "Additional Photos" or
-- "Additional Edit" job is editing work after a shoot, so it has no address
-- and should never be flagged as missing one (Geoff, 2026-09-13). Per type,
-- default true; the Manage → Types dialog has the switch.
ALTER TABLE public.project_types
  ADD COLUMN IF NOT EXISTS needs_location boolean NOT NULL DEFAULT true;

-- Geoff's edit-only types, switched off up front.
UPDATE public.project_types
  SET needs_location = false
  WHERE org_id = 'org_sdubmedia' AND name IN ('Additional Photos', 'Additional Edit');
