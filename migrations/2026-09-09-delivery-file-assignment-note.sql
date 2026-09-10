-- A note the owner writes when sending a batch of proofs to an editor
-- ("warm these up, skip the first five, client wants B&W on the porch set").
--
-- WHY: send-to-editor (2026-09-05) hands over the photos but not the
-- instructions — those went in a separate text and got lost. Stored on each
-- assigned file (same shape as assigned_crew_member_id / assigned_at) so the
-- note travels with the batch: the editor sees it on her dashboard and at
-- the top of the gallery when she downloads, and it clears with the
-- assignment when her final lands or the owner unsends.
--
-- No RLS change: staff already read every column on rows they can see
-- (RLS is row-level), and the owner has FOR ALL.

ALTER TABLE public.delivery_files
  ADD COLUMN IF NOT EXISTS assignment_note text;
