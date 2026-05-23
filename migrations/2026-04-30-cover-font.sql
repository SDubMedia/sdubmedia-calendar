-- Per-gallery cover font. Empty string = default (Cormorant Garamond).
-- Other values map to Google Fonts loaded by DeliverGalleryPage.

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS cover_font text NOT NULL DEFAULT '';
