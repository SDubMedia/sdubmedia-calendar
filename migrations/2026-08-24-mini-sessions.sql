-- Mini sessions: a dated event of bookable time slots that strangers claim from
-- a public link (QR on a flyer). Each booking signs an agreement, pays by card
-- (full or a deposit with the balance auto-charged the day before), and gets a
-- personal QR code. On shoot day the photographer shoots each party's QR before
-- their session; a bulk upload later splits the card into per-party galleries
-- using those QR frames as delimiters.
--
-- Participants NEVER have logins — the tokens are the gate and every public read
-- goes through a service-role endpoint. So there are deliberately no client /
-- partner / family policies here (see the meetings migration for the shape).

CREATE TABLE IF NOT EXISTS mini_sessions (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  date text NOT NULL,                       -- YYYY-MM-DD (text, like projects.date)
  location_text text NOT NULL DEFAULT '',
  location_id text,
  start_time text NOT NULL DEFAULT '',      -- HH:MM, window start
  end_time text NOT NULL DEFAULT '',        -- HH:MM, window end
  slot_minutes integer NOT NULL DEFAULT 15,
  break_minutes integer NOT NULL DEFAULT 0,
  price_cents integer NOT NULL DEFAULT 0,
  payment_mode text NOT NULL DEFAULT 'full',      -- full | deposit
  deposit_percent integer NOT NULL DEFAULT 50,
  agreement_text text NOT NULL DEFAULT '',
  included_photos integer NOT NULL DEFAULT 0,     -- becomes deliveries.selection_limit
  per_extra_photo_cents integer NOT NULL DEFAULT 0,
  public_token text NOT NULL,                     -- the event QR / sign-up link
  status text NOT NULL DEFAULT 'draft',           -- draft | published | closed | done
  blocked_slots jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ["14:30", …] pulled from sale
  assigned_crew jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS mini_sessions_public_token_idx ON mini_sessions (public_token);
CREATE INDEX IF NOT EXISTS mini_sessions_org_date_idx ON mini_sessions (org_id, date);

CREATE TABLE IF NOT EXISTS mini_session_bookings (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  mini_session_id text NOT NULL REFERENCES mini_sessions(id) ON DELETE CASCADE,
  slot_time text NOT NULL DEFAULT '',       -- HH:MM; '' for waitlist rows
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',          -- ?src= tag from the scanned link
  booking_token text NOT NULL,              -- THIS is the personal QR payload
  signature jsonb,                          -- { name, ip, timestamp, agreementHash }
  stripe_customer_id text,                  -- customer on the CONNECTED account
  checkout_session_id text,
  deposit_paid_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  balance_charged_at timestamptz,
  balance_payment_intent_id text,
  balance_error text,
  payment_status text NOT NULL DEFAULT 'pending',  -- pending | deposit_paid | paid | balance_failed
  status text NOT NULL DEFAULT 'pending',          -- pending | booked | cancelled | no_show | waitlist
  delivery_id text,                                -- their gallery, once photos are sorted
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mini_session_bookings_token_idx ON mini_session_bookings (booking_token);
CREATE INDEX IF NOT EXISTS mini_session_bookings_session_idx ON mini_session_bookings (mini_session_id);

-- Double-booking is prevented by the DATABASE, not by app logic: two people
-- checking out for 2:15 at the same instant means the second insert fails and
-- that request gets a clean 409 + refreshed slot list. Cancelled/no-show/
-- waitlist rows are excluded so a freed slot can be rebooked.
CREATE UNIQUE INDEX IF NOT EXISTS mini_session_bookings_slot_unique
  ON mini_session_bookings (mini_session_id, slot_time)
  WHERE status IN ('pending', 'booked');

ALTER TABLE mini_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mini_session_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_mini_sessions" ON mini_sessions;
CREATE POLICY "owner_all_mini_sessions" ON mini_sessions
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "staff_read_mini_sessions" ON mini_sessions;
CREATE POLICY "staff_read_mini_sessions" ON mini_sessions
  FOR SELECT USING (public.user_role() = 'staff' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "owner_all_mini_session_bookings" ON mini_session_bookings;
CREATE POLICY "owner_all_mini_session_bookings" ON mini_session_bookings
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "staff_read_mini_session_bookings" ON mini_session_bookings;
CREATE POLICY "staff_read_mini_session_bookings" ON mini_session_bookings
  FOR SELECT USING (public.user_role() = 'staff' AND org_id = public.user_org_id());
