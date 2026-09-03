-- ============================================================
-- Freeze the price on a proposal at the moment it is sent.
--
-- Agreement text can reference {{total}}, {{deposit_amount}}, {{balance_amount}}
-- merge fields instead of hand-typed dollar figures, so a proposal's own price
-- resolves live from its lineItems/paymentConfig while it's still a draft.
-- That's correct for a draft — editing pricing should keep the agreement text
-- in sync. It stops being correct the moment the proposal is SENT: a client
-- who already read "$450 deposit" must never watch that number silently
-- change because the owner adjusted a line item afterward.
--
-- Mirrors letterhead_snapshot exactly (see 2026-08-27-letterhead-snapshot.sql):
-- stamped once, on send, never re-stamped. Null = draft, or sent before this
-- column existed — both render live, which is correct in both cases.
--
-- DELIBERATELY NOT BACKFILLED, for the same reason as letterhead: what the
-- price said the day an existing proposal was sent was never recorded.
-- ============================================================

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb;

COMMENT ON COLUMN proposals.pricing_snapshot IS
  'total/depositAmount/balanceAmount/depositPercent as they were when this proposal was sent. Null = render live. Never backfill: it would fabricate history.';
