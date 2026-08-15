-- Let a client choose SEVERAL services, not one package.
--
-- WHY: proposals stored a single selected_package_id, so a client could pick
-- one collection and nothing else. Geoff's wedding proposal offers a film
-- collection, then optional add-ons ("Make The Memories Last Forever"), then
-- events and coverage — pick one from the first, any number from the others.
-- With one slot, the add-ons literally cannot be sold.
--
-- selected_package_id stays for every proposal already sent, and for
-- single-choice templates. The array is the new source of truth when present.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS selected_package_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- No RLS change: proposals already has policies and this is another column on
-- the same row.
