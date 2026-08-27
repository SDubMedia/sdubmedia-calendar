-- ============================================================
-- Make "hold a place" atomic, so the cap cannot be beaten by two people
-- tapping at the same moment.
--
-- The API counted the places taken and then inserted. Two requests arriving
-- together both read "1 left" and both insert — and nothing downstream catches
-- it, because the only unique index covers (mini_session_id, slot_time) for
-- pending/booked rows, while reservations are `waitlist` with an empty
-- slot_time. So the cap silently becomes cap+1.
--
-- That is precisely the failure the cap exists to prevent: somebody pays a
-- nonrefundable deposit and there is no time for them on the day. A race that
-- only shows up when a mailing list opens at 9am — which is exactly when these
-- go on sale — is not one to leave to chance.
--
-- Locking the mini_sessions row serialises reservations per event. It does not
-- block anything else: slot bookings, claims and reads don't take this lock.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reserve_mini_place(
  p_event_id   text,
  p_booking_id text,
  p_org_id     text,
  p_token      text,
  p_name       text,
  p_email      text,
  p_phone      text,
  p_source     text,
  p_signature  jsonb,
  p_total      integer,
  p_hold_minutes integer
) RETURNS TABLE (ok boolean, places_left integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap   integer;
  v_taken integer;
BEGIN
  -- Serialise every reservation for THIS event behind the event row.
  SELECT reservation_cap INTO v_cap
  FROM mini_sessions WHERE id = p_event_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  -- Same rule as reservationsLeft(): anyone holding a place, minus checkouts
  -- that were started and abandoned.
  SELECT count(*) INTO v_taken
  FROM mini_session_bookings b
  WHERE b.mini_session_id = p_event_id
    AND b.status IN ('waitlist', 'booked', 'pending', 'no_show')
    AND NOT (
      b.status = 'waitlist'
      AND b.payment_status = 'pending'
      AND b.created_at < now() - make_interval(mins => p_hold_minutes)
    );

  IF v_cap > 0 AND v_taken >= v_cap THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  INSERT INTO mini_session_bookings
    (id, org_id, mini_session_id, slot_time, name, email, phone, source,
     booking_token, signature, total_cents, status, payment_status)
  VALUES
    (p_booking_id, p_org_id, p_event_id, '', p_name, p_email, p_phone, p_source,
     p_token, p_signature, p_total, 'waitlist', 'pending');

  RETURN QUERY SELECT true, CASE WHEN v_cap > 0 THEN v_cap - v_taken - 1 ELSE 0 END;
END;
$$;

-- Only the service role calls this (from the public endpoint, which is the
-- authorization boundary). No direct client access.
REVOKE ALL ON FUNCTION public.reserve_mini_place(text, text, text, text, text, text, text, text, jsonb, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_mini_place(text, text, text, text, text, text, text, text, jsonb, integer, integer) FROM anon, authenticated;

COMMENT ON FUNCTION public.reserve_mini_place IS
  'Atomically claim one capped pre-sale place. Locks the mini_sessions row so simultaneous buyers cannot exceed reservation_cap.';
