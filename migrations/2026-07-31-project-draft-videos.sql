-- Draft cuts (editor review copies) attached to a project.
--
-- Drafts ride in the existing project_documents table rather than a new one:
-- the RLS there is already exactly what a draft needs — owner sees every one,
-- assigned crew (on crew or post_production) see their own projects', clients
-- never see any of it. Both policies are FOR ALL on the whole table, so adding
-- a column needs no policy change.
--
--   kind    'document' = script / shot list / call sheet (the original use)
--           'draft'    = a review copy of the edit, usually video
--   version per-project draft number so the UI can say "Draft v3" without
--           anyone having to rename files. Documents stay at 0.

ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'document';

ALTER TABLE public.project_documents
  DROP CONSTRAINT IF EXISTS project_documents_kind_check;
ALTER TABLE public.project_documents
  ADD CONSTRAINT project_documents_kind_check CHECK (kind IN ('document', 'draft'));

ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;

-- The sheet reads one project's documents and drafts as two separate lists.
CREATE INDEX IF NOT EXISTS idx_project_documents_project_kind
  ON public.project_documents(project_id, kind);
