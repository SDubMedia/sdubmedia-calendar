-- Keep full-quality originals on a gallery, per gallery, off by default.
--
-- Every photo uploaded to Slate is re-encoded client-side to JPEG at 80%
-- (see client/src/lib/heic.ts). Full resolution, but a lossy pass that also
-- strips EXIF and flattens to sRGB. That's deliberate — it keeps galleries at
-- ~5MB a photo instead of 30MB+ so they load and download reliably — and it's
-- right for real-estate work. It is wrong for portrait/headshot sessions where
-- the client is paying for the file itself.
--
-- With this on, an upload stores BOTH: the compressed copy the gallery grid
-- browses, and the untouched original that Download hands over. Off by default
-- because most volume here is real estate; the owner flips it per job.
--
--   deliveries.keep_originals        the switch
--   delivery_files.original_storage_path  the untouched file (empty = none,
--                                    which is every existing row — those keep
--                                    serving the single stored file exactly as
--                                    they do today)
--   delivery_files.original_size_bytes    so storage totals stay honest

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS keep_originals boolean NOT NULL DEFAULT false;

ALTER TABLE public.delivery_files
  ADD COLUMN IF NOT EXISTS original_storage_path text NOT NULL DEFAULT '';

ALTER TABLE public.delivery_files
  ADD COLUMN IF NOT EXISTS original_size_bytes bigint NOT NULL DEFAULT 0;
