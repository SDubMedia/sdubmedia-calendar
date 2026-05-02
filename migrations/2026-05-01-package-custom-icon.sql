-- Custom-icon upload for Packages — owners can upload a transparent PNG/SVG
-- (≤50KB) instead of using the curated Lucide vocabulary. Stored as a data
-- URL on the row; rendered inside the existing navy-circle frame.

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS icon_custom_data_url text NOT NULL DEFAULT '';
