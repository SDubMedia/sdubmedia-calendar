-- Where the cover image should be anchored, and whether to show all of it.
--
-- WHY: the hero fills the full width at up to 900px tall and crops with
-- object-cover from the centre. A full-length portrait therefore loses the
-- head and the feet and lands on the middle of the subject — Lissa's cover
-- framed her chest. There was no way to influence it.
--
-- "top" / "center" / "bottom" move the crop. "contain" shows the whole frame
-- letterboxed, for the covers where any crop is the wrong answer.

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS cover_focal text NOT NULL DEFAULT 'center';

-- No RLS change: another column on a table that already has policies.
