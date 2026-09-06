-- A personal note from the studio, shown in the editorial gallery's
-- statement section under the headline ("Fifteen photographs. Two films.").
--
-- WHY: the one piece of the editorial presentation that is writing rather
-- than data. Empty means "use the default" (client/src/lib/galleryCopy.ts),
-- which already carries the client's first name and the studio name via
-- merge fields, so most galleries never need it edited.
--
-- No RLS change: owner_all_deliveries covers writes; every existing read
-- policy already returns whole rows, and the public route serves it by
-- token. Not sensitive — it is written to be shown to the client.

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';
