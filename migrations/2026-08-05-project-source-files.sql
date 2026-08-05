-- RAW / source-file handoff from the photographer to the editor.
--
-- Two mechanisms on purpose, because one size doesn't fit:
--
--   projects.source_files_url  — a link (Drive, Dropbox, WeTransfer). This is
--     how a real session actually moves: 300 RAW frames is ~9GB, which is an
--     hour up and an hour down through a browser with no resume. A link costs
--     nothing and never times out. Downside: Slate doesn't hold the files.
--
--   project_documents kind='source' — actual files in Slate, for the handful of
--     frames where that's easier than a link. Same table and therefore the same
--     RLS that already works: owner sees all, assigned crew see their own jobs',
--     clients never see any of it.
--
-- Editors get both on the job and on their dashboard, and both stay available
-- after finals are uploaded so a re-download is always possible.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS source_files_url text NOT NULL DEFAULT '';

ALTER TABLE public.project_documents
  DROP CONSTRAINT IF EXISTS project_documents_kind_check;
ALTER TABLE public.project_documents
  ADD CONSTRAINT project_documents_kind_check
  CHECK (kind IN ('document', 'draft', 'source'));
