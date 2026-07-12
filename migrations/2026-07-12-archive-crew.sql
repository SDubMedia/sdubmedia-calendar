-- ============================================================
-- Archive staff: hide a crew member from the Staff list / crew pickers without
-- deleting them (so their history on past projects, pay, and W-9 stays intact).
-- ============================================================

ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
