-- Treat one gallery as a real estate delivery, per gallery, off by default.
--
-- Real estate is otherwise a kind of CLIENT (an agent, or a shoot billed to a
-- brokerage) — see client/src/lib/galleryQuality.ts and api/_galleryPresentation.ts.
-- That leaves no way to deliver a listing shoot for a mixed client such as
-- Coldwell Banker Southern Realty, who is a standard client because most of
-- their work is recurring corporate content (Geoff, 2026-09-07: the Global
-- Luxury home shoot had no way to be flagged).
--
-- With this on, the gallery is treated exactly like an agent's: the listing
-- layout on the public page, and Download hands over the compressed MLS-size
-- copy rather than the untouched original (unless keep_originals is also on).
-- It is read at serve time, so flipping it after the photos are up still
-- changes what the client downloads — nothing is re-processed.

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS real_estate boolean NOT NULL DEFAULT false;
