-- ============================================================
-- What happens to a pre-sale deposit when the claim window closes and the
-- person never picked a time.
--
-- Per event, not per business: a $50 hold on a once-a-year February shoot and
-- a $25 hold on a Christmas afternoon are not the same promise, and the answer
-- has to be printed on the page they sign either way.
--
--   forfeit     — the deposit is kept. What "nonrefundable" plainly means.
--   half_refund — half back, half kept. A middle ground for a date that moved
--                 for reasons the customer had no say in.
--   credit      — held against a future session.
--
-- The value drives the wording on the sign-up page and in the "pick your time"
-- email, so it can never be set to something the customer wasn't told.
-- ============================================================

ALTER TABLE public.mini_sessions
  ADD COLUMN IF NOT EXISTS unclaimed_policy text NOT NULL DEFAULT 'forfeit';

ALTER TABLE public.mini_sessions
  DROP CONSTRAINT IF EXISTS mini_sessions_unclaimed_policy_check;

-- Constrained on purpose: this string is rendered into a legal disclosure and
-- decides whether money moves. A typo must fail loudly at write time, not
-- silently render an empty promise to a customer.
ALTER TABLE public.mini_sessions
  ADD CONSTRAINT mini_sessions_unclaimed_policy_check
  CHECK (unclaimed_policy IN ('forfeit', 'half_refund', 'credit'));

COMMENT ON COLUMN public.mini_sessions.unclaimed_policy IS
  'What happens to the deposit if the claim window closes unused: forfeit | half_refund | credit. Shown verbatim in the sign-up disclosure.';
