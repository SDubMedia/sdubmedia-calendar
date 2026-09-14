-- "Editor hand-off" galleries (Geoff, 2026-09-14): the owner's uploads are
-- originals for the editor and never reach the client; the editor's uploads
-- are the finals, and only those are delivered. No client proofing round.
-- Per gallery, off by default (the Workflow panel on the gallery page).
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS editor_handoff boolean NOT NULL DEFAULT false;
