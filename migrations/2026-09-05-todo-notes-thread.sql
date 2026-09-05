-- Turn a to-do's single flat-string note into a dated, growing thread —
-- same shape as projects.client_notes ({id, text, createdAt}[]) — so
-- "add notes below the to-do" means keeping a log, not overwriting one line.
--
-- Preserve any existing flat-string value as the thread's first entry
-- rather than discarding it.

ALTER TABLE public.todos RENAME COLUMN notes TO notes_legacy_text;
ALTER TABLE public.todos ADD COLUMN notes jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.todos
  SET notes = jsonb_build_array(jsonb_build_object(
        'id', 'note_' || replace(gen_random_uuid()::text, '-', ''),
        'text', notes_legacy_text,
        'createdAt', created_at::text
      ))
  WHERE notes_legacy_text IS NOT NULL AND notes_legacy_text <> '';

ALTER TABLE public.todos DROP COLUMN notes_legacy_text;

-- No RLS change: owner_all_todos and staff_own_todos (migrations/2026-07-23-todos.sql)
-- already cover this column — RLS is row-level, not column-level.
