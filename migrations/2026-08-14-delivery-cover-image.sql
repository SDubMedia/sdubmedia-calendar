-- Dedicated cover image for a gallery.
--
-- WHY: cover_file_id points at a row in delivery_files, so the cover was only
-- ever a reference to a photo that is also IN the gallery. Delete that photo
-- and the cover silently disappears — you cannot upload an image purely to be
-- the cover. It also meant the cover displayed the gallery's browsing copy,
-- which is re-encoded to 80% JPEG on upload and looks soft blown up to a
-- full-screen hero.
--
-- cover_storage_path is an R2 object owned by the delivery itself: uploaded at
-- full quality, never listed among the files, and unaffected by deleting
-- photos. cover_file_id stays for galleries already using a gallery photo, and
-- the storage path wins when both are set.

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS cover_storage_path text NOT NULL DEFAULT '';

-- Dimensions of that image, so the public page can reserve the right space
-- before it loads instead of reflowing the hero.
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS cover_width  integer NOT NULL DEFAULT 0;
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS cover_height integer NOT NULL DEFAULT 0;

-- No RLS changes needed: these are columns on an existing table whose policies
-- already scope by org_id, and the public gallery reads deliveries through the
-- service role in api/delivery-public.ts rather than under RLS.
