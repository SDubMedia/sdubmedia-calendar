-- Phase B — block-based contract template authoring.
-- Adds a JSONB `blocks` column on contract_templates so the new editor can
-- store structured blocks (centered_title, section_divider, prose,
-- merge_field, etc.) alongside the legacy `content` HTML which we keep
-- populated for the existing rendering surfaces.

ALTER TABLE contract_templates
  ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]';
