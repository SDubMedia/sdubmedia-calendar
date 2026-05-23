-- Tier A: gallery cover/design fields. Adds the bits a Pixieset-style hero
-- needs — a layout choice, a subtitle line, and a date string. The cover
-- IMAGE is already wired via deliveries.cover_file_id.

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS cover_layout text NOT NULL DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS cover_subtitle text,
  ADD COLUMN IF NOT EXISTS cover_date text;

-- cover_layout valid values (loose check — easier to add new options later):
--   'center'  — title centered over hero (default, matches Pixieset Center)
--   'vintage' — title in serif slab top-left over darkened hero (matches Pixieset Vintage)
--   'minimal' — no hero image, just typography on white
