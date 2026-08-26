-- ============================================================
-- Mini sessions: sell a capped number of places before the date is known.
--
-- The February shoot is a two-week window that isn't announced until close to
-- the time. Geoff wants to take a nonrefundable $50 now to hold a place, then
-- when the date lands, email everyone at once and give them 72 hours to pick a
-- time and pay the rest.
--
-- Deliberately NOT a nullable `date`: every downstream surface (calendar, cron,
-- sorting, the public page) assumes a date exists, and making it optional would
-- mean auditing all of them. Instead the owner enters a placeholder inside the
-- expected month and flags it TBD, so the public page shows "February 2027 —
-- date to be confirmed" while everything else keeps working.
--
-- Reservations reuse the EXISTING `waitlist` booking status, which the schema
-- already had. That matters for more than tidiness: the partial unique index on
-- (mini_session_id, slot_time) only covers 'pending' and 'booked', so a dozen
-- reservations all sharing an empty slot_time cannot collide — and the moment
-- one is converted to a real slot, the same index starts protecting it.
-- ============================================================

ALTER TABLE public.mini_sessions
  -- Date is a placeholder; show the month, not the day.
  ADD COLUMN IF NOT EXISTS date_tbd boolean NOT NULL DEFAULT false,
  -- Hard limit on places sold. 0 = no limit (normal same-day booking events).
  -- This is the number that has to appear in the disclosure: overselling means
  -- people lose money and never get photographed.
  ADD COLUMN IF NOT EXISTS reservation_cap integer NOT NULL DEFAULT 0,
  -- Flat deposit in cents, overriding deposit_percent when set. $50 of $150 is
  -- not a round percentage, and "a third, ish" is not what you put on a page
  -- someone is agreeing to.
  ADD COLUMN IF NOT EXISTS deposit_flat_cents integer NOT NULL DEFAULT 0,
  -- When the 72-hour window to claim a slot closes. NULL until booking opens.
  ADD COLUMN IF NOT EXISTS booking_deadline timestamptz,
  -- Stamped when the owner emails everyone the "pick your time" invitation, so
  -- it can never go out twice.
  ADD COLUMN IF NOT EXISTS booking_opened_at timestamptz;

COMMENT ON COLUMN public.mini_sessions.date_tbd IS
  'True while the exact date is unannounced. The public page sells reservations instead of slots and shows the month only.';
COMMENT ON COLUMN public.mini_sessions.reservation_cap IS
  'Maximum places sold before the date is known. 0 = unlimited. Must be disclosed on the sign-up page.';
COMMENT ON COLUMN public.mini_sessions.deposit_flat_cents IS
  'Flat deposit in cents. Overrides deposit_percent when greater than zero.';

-- Reservations are counted for the cap, so this is the lookup that matters.
CREATE INDEX IF NOT EXISTS mini_session_bookings_event_status_idx
  ON public.mini_session_bookings (mini_session_id, status);
