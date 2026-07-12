-- Snapshot the exact 1099 agreement text a staff member signed, so the executed
-- document always reproduces what was actually agreed to — even after the owner
-- later edits the per-company template (which bumps the version and re-signs).
-- Existing rows stay NULL; the viewer falls back to the current template text
-- when the row's version still matches the org's current version.
ALTER TABLE staff_agreements ADD COLUMN IF NOT EXISTS agreement_text text;
