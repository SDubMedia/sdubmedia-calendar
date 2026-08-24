-- Balance payments need their OWN session column. Reusing checkout_session_id
-- meant a balance checkout overwrote the original booking's session id, and if
-- the customer then went back and completed the FIRST payment instead, the
-- webhook rejected it as a mismatch — money captured, booking still unpaid.
ALTER TABLE mini_session_bookings ADD COLUMN IF NOT EXISTS balance_checkout_session_id text;
