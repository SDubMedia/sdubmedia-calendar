-- Gallery video support — adds video as a first-class media type alongside
-- photos. Videos store a separate thumbnail object key (the user picks a
-- frame from playback during upload, captured to a JPEG and uploaded to R2)
-- plus duration metadata. Existing rows are images (default).
--
-- Why a separate column instead of a discriminator on mime_type:
-- mime_type already exists, but treating media_type as the source of truth
-- keeps upgrade-time logic simple ('image' or 'video') and avoids parsing
-- the mime string at every render.

ALTER TABLE delivery_files
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS thumbnail_storage_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

CREATE INDEX IF NOT EXISTS delivery_files_media_type_idx ON delivery_files(media_type);
