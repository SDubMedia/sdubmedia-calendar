-- An editor's finished file no longer overwrites the proof it came from
-- (Geoff, 2026-09-14: "I need them to be separate"). The final is its own
-- row, pointing back at the proof it finishes, so Proofs and Finals are two
-- complete sets: the client picks from proofs, receives finals, and the
-- owner can look at either. source_file_id is NULL for anything that
-- didn't come from a proof (owner uploads, real-estate galleries).
ALTER TABLE public.delivery_files
  ADD COLUMN IF NOT EXISTS source_file_id text;
CREATE INDEX IF NOT EXISTS delivery_files_source_file_idx ON public.delivery_files (source_file_id);
