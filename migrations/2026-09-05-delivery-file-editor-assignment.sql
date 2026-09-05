-- Let the owner hand-pick specific proofs and assign them to an editor,
-- independent of client selections.
--
-- WHY: the only existing way an editor knows what to work on is the client's
-- own picks (delivery_selections). That doesn't help a real-estate gallery
-- with no client proofing, or a case where the owner wants to nudge a
-- subset of a larger pick to a specific editor. assigned_crew_member_id +
-- assigned_at let that assignment persist in the gallery, not just live in
-- a one-time email — an editor who opens the gallery days later still sees
-- exactly what's hers.

ALTER TABLE public.delivery_files
  ADD COLUMN IF NOT EXISTS assigned_crew_member_id text REFERENCES public.crew_members(id),
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS delivery_files_assigned_idx
  ON public.delivery_files (assigned_crew_member_id);

-- No RLS change needed: owner already has FOR ALL via owner_all_delivery_files,
-- and staff's existing staff_read_assigned_delivery_files SELECT policy
-- already covers every row on a project she's assigned to — RLS is row-level,
-- not column-level, so these two new columns are already visible to her on
-- rows she can already read.
