-- A real focal point for the cover, like Pixieset.
--
-- WHY: top / centre / bottom was too blunt. A focal point stored as
-- percentages and applied with object-position keeps THAT point of the photo
-- at the same relative spot in the frame no matter how the hero is shaped —
-- phone, iPad or a wide desktop. Choose it once, it holds everywhere.

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS cover_focal_x integer NOT NULL DEFAULT 50;
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS cover_focal_y integer NOT NULL DEFAULT 50;

-- Carry over the coarse setting so nothing jumps: top/bottom become the
-- vertical positions they were approximating. cover_focal now means only
-- "point" (use the x/y above) or "contain" (show the whole frame, no crop).
UPDATE deliveries SET cover_focal_y = 15 WHERE cover_focal = 'top';
UPDATE deliveries SET cover_focal_y = 85 WHERE cover_focal = 'bottom';
UPDATE deliveries SET cover_focal = 'point' WHERE cover_focal IN ('top', 'center', 'bottom');

-- No RLS change: more columns on a table that already has policies.
