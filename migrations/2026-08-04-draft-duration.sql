-- Runtime on a draft, so the sheet can show a bitrate next to the file size.
--
-- Why this matters: a 60-second cut at 43.7 MB is ~6 Mbps — a review export,
-- not a master. Approving it delivered a compressed file to the client and
-- nothing on screen made that visible. Size alone doesn't tell you; size over
-- runtime does.
--
-- Captured in the browser at upload time (the same way the gallery reads video
-- metadata), so there's no server-side transcoding involved. Null means we
-- couldn't read it — the UI then shows size only rather than guessing.

ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS duration_seconds numeric;

-- Backfill the one draft whose runtime we know: "Firefly Final.mov" is 60
-- seconds, which makes its 45,843,910 bytes work out at ~6.1 Mbps — the review
-- export that prompted all of this. Everything else stays null until the next
-- upload records it.
UPDATE public.project_documents
SET duration_seconds = 60
WHERE id = 'doc_move_ff_v1' AND duration_seconds IS NULL;
