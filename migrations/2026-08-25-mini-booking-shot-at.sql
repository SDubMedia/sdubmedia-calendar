-- ============================================================
-- Mini session bookings: "we've photographed this family" tick.
--
-- On shoot day the owner works down the slot list, and until now the only
-- per-row action was "mark no-show". So the only visual "handled" state meant
-- the family never turned up — the opposite of what you want to record about
-- the one standing in front of you. Geoff read the struck-through row as
-- "already shot", which is exactly the confusion this removes.
--
-- Nullable timestamp rather than a status value: they are still `booked`
-- either way, and the time is worth keeping (it says when the session actually
-- ran, which is not always the slot time).
-- ============================================================

ALTER TABLE public.mini_session_bookings
  ADD COLUMN IF NOT EXISTS shot_at timestamptz;

COMMENT ON COLUMN public.mini_session_bookings.shot_at IS
  'When the photographer marked this family as photographed. NULL = not yet shot. Independent of status, which stays "booked".';
