-- Adds deposit_paid_at to projects. Stamped by the Stripe webhook when the
-- at_signing milestone first transitions to paid (same moment the project
-- flips from "tentative" to "upcoming"). Used to surface a transient
-- "Deposit Paid" pill on the calendar for ~7 days after payment.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz;
