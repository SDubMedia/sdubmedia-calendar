-- Toggle for using the org's logo as the gallery watermark instead of
-- (or in addition to) the existing text watermark. When true and the
-- org has a logoUrl, the public gallery tiles the logo with low opacity.

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS watermark_use_logo boolean NOT NULL DEFAULT false;
