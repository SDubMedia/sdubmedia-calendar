-- Give a draft a state, so both dashboards can be views rather than features.
--
--   pending    the editor posted it, the owner hasn't decided       (default)
--   approved   the owner accepted the cut — set by project-draft-promote
--   set_aside  the owner isn't taking this one forward (reshoot, superseded,
--              client changed direction). Clears it off the owner's "waiting
--              on you" list without deleting the file, and tells the editor
--              where it stands instead of leaving him waiting.
--
-- IMPORTANT: approved ≠ delivered. Approving says the cut is right; delivering
-- the gallery is a separate act the owner controls. Don't collapse the two —
-- an editor seeing "approved" must not assume the client has it.
--
-- review_note carries the one-line reason for setting one aside, so the editor
-- doesn't have to guess or re-send the same cut.
--
-- Only meaningful for kind='draft'; documents keep the default and ignore it.

ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.project_documents
  DROP CONSTRAINT IF EXISTS project_documents_review_status_check;
ALTER TABLE public.project_documents
  ADD CONSTRAINT project_documents_review_status_check
  CHECK (review_status IN ('pending', 'approved', 'set_aside'));

ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS review_note text NOT NULL DEFAULT '';

ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- The owner's "drafts waiting on you" card reads exactly this.
CREATE INDEX IF NOT EXISTS idx_project_documents_pending_drafts
  ON public.project_documents(org_id, kind, review_status);

-- The two drafts moved by hand on 2026-08-03 (David's Sparta videos) predate
-- this column and correctly default to pending — they are genuinely awaiting
-- review.
